"""
PDF Extractor - Native PDF Processing with OpenAI
Specialized for multi-page PDF invoices without image conversion.

Architecture: initial-api → orchestrator → pdf-extractor (for PDFs) → enrichment-worker → ...
                                         → data-extractor-v2 (for images)

Key Benefits:
- Direct PDF processing (no image conversion quality loss)
- Multi-page invoice support (consolidates all pages)
- Optimized prompts for PDF text extraction
- Lower token usage than base64 images
"""

import os
import io
import json
import logging
import base64
import requests
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, storage, secretmanager
from openai import OpenAI
import fitz  # PyMuPDF for PDF text extraction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# CORS configuration matching other services
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://invoiceparse.netlify.app",
            "https://profound-babka-8bbaa6.netlify.app",
            "http://localhost:3000",
            "http://localhost:3001",
            "*"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Tenant-ID", "X-User-UID"]
    }
})

# Initialize clients
db = firestore.Client()
storage_client = storage.Client()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Service URL for pipeline chaining (same as data-extractor-v2)
ENRICHMENT_WORKER_URL = os.getenv(
    'ENRICHMENT_WORKER_URL',
    'https://enrichment-worker-812016027146.asia-south1.run.app'
)

# OpenAI client (lazy initialization)
openai_client = None


def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from Secret Manager"""
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_ID}/secrets/openai-api-key-secret/versions/latest"
        response = client.access_secret_version(request={"name": name})
        api_key = response.payload.data.decode("UTF-8")
        logger.info("🔑 OpenAI API key retrieved from Secret Manager")
        return OpenAI(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to get OpenAI key from Secret Manager: {e}")
        # Fallback to environment variable
        api_key = os.getenv('OPENAI_API_KEY')
        if api_key:
            logger.info("🔑 Using OpenAI API key from environment")
            return OpenAI(api_key=api_key)
        raise ValueError("No OpenAI API key available")


def get_tenant_id(req) -> str:
    """Extract tenant_id from request - required for multi-tenant isolation"""
    tenant_id = req.headers.get('X-Tenant-ID') or req.args.get('tenant_id')
    if not tenant_id:
        data = req.get_json(silent=True) or {}
        tenant_id = data.get('tenant_id')
    if not tenant_id:
        raise ValueError("tenant_id is required for data isolation")
    return tenant_id


def extract_pdf_text(pdf_content: bytes) -> Dict[str, Any]:
    """
    Extract text content from PDF using PyMuPDF.
    Returns structured text with page information.
    """
    try:
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        pages_text = []
        total_pages = len(doc)
        
        for page_num in range(total_pages):
            page = doc[page_num]
            text = page.get_text("text")
            pages_text.append({
                'page_number': page_num + 1,
                'text': text,
                'has_content': bool(text.strip())
            })
        
        doc.close()
        
        # Combine all text for analysis
        full_text = "\n\n--- PAGE BREAK ---\n\n".join([
            f"[Page {p['page_number']}]\n{p['text']}" 
            for p in pages_text if p['has_content']
        ])
        
        return {
            'total_pages': total_pages,
            'pages': pages_text,
            'full_text': full_text,
            'has_extractable_text': any(p['has_content'] for p in pages_text)
        }
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return {
            'total_pages': 0,
            'pages': [],
            'full_text': '',
            'has_extractable_text': False,
            'error': str(e)
        }


def prepare_pdf_for_vision(pdf_content: bytes, max_pages: int = 10) -> List[Dict[str, str]]:
    """
    Convert PDF pages to base64 images for Vision API fallback.
    Used when PDF has no extractable text (scanned documents).
    """
    try:
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        images = []
        
        pages_to_process = min(len(doc), max_pages)
        
        for page_num in range(pages_to_process):
            page = doc[page_num]
            # Higher DPI for better OCR quality
            mat = fitz.Matrix(2, 2)  # 2x zoom = ~144 DPI
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            base64_img = base64.b64encode(img_bytes).decode('utf-8')
            
            images.append({
                'page_number': page_num + 1,
                'base64': base64_img,
                'mime_type': 'image/png'
            })
        
        doc.close()
        return images
    except Exception as e:
        logger.error(f"PDF to image conversion failed: {e}")
        return []


def extract_with_text_prompt(text_content: str, total_pages: int) -> Dict[str, Any]:
    """
    Use OpenAI to extract structured data from PDF text.
    Optimized prompt for multi-page invoice handling.
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    system_prompt = """You are an expert invoice data extraction system specialized in Indian GST invoices.

CRITICAL INSTRUCTIONS:
1. This invoice may span MULTIPLE PAGES - extract data from ALL pages
2. Header info (invoice number, date, vendor) is typically on page 1
3. Line items may continue across multiple pages - combine them ALL
4. Totals/summary is typically on the last page
5. Handle GST components: CGST, SGST, IGST separately

OUTPUT FORMAT (JSON):
{
    "headers_raw": {
        "invoice_number": "string",
        "invoice_date": "DD/MM/YYYY or as shown",
        "vendor_name": "string",
        "vendor_gstin": "15-char GSTIN",
        "vendor_address": "string",
        "buyer_name": "string", 
        "buyer_gstin": "15-char GSTIN",
        "buyer_address": "string",
        "total_amount": number (final payable amount),
        "subtotal": number (before tax),
        "tax_amount": number (total tax),
        "cgst_amount": number,
        "sgst_amount": number,
        "igst_amount": number,
        "place_of_supply": "state code or name",
        "reverse_charge": "Yes/No"
    },
    "line_items_raw": [
        {
            "description": "item/service description",
            "hsn_code": "HSN/SAC code",
            "quantity": number,
            "unit": "string (Nos/Kg/Hrs etc)",
            "unit_price": number,
            "amount": number (before tax),
            "tax_rate": number (percentage),
            "tax_amount": number,
            "total": number (including tax)
        }
    ],
    "extraction_metadata": {
        "pages_processed": number,
        "confidence": "high/medium/low",
        "notes": "any extraction notes or issues"
    }
}

IMPORTANT:
- All amounts should be numbers (not strings)
- Extract ALL line items from ALL pages
- If data is unclear, use best interpretation and note in metadata
- GSTIN format: 2-digit state code + 10-char PAN + 1 entity code + 1 check digit + Z"""

    user_prompt = f"""Extract invoice data from this {total_pages}-page invoice:

{text_content}

Return ONLY valid JSON matching the specified format. Combine line items from all pages into a single list."""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=4000,
            temperature=0.1  # Low temperature for consistent extraction
        )
        
        response_text = response.choices[0].message.content
        token_usage = response.usage.total_tokens if response.usage else 0
        
        # Parse JSON from response
        try:
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '```' in response_text:
                json_str = response_text.split('```')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            
            extracted_data = json.loads(json_str)
            extracted_data['_token_usage'] = token_usage
            extracted_data['_extraction_method'] = 'text_analysis'
            return extracted_data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed: {e}")
            return {
                'headers_raw': {'raw_text': response_text[:500]},
                'line_items_raw': [],
                '_token_usage': token_usage,
                '_extraction_method': 'text_analysis',
                '_parse_error': str(e)
            }
            
    except Exception as e:
        logger.error(f"OpenAI API call failed: {e}")
        raise


def extract_with_vision_prompt(images: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Use OpenAI Vision API for scanned PDFs (no extractable text).
    Handles multi-page by sending all page images.
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    system_prompt = """You are an expert invoice OCR and data extraction system for Indian GST invoices.

You are analyzing a multi-page scanned invoice. Extract data from ALL pages and combine into a single result.

OUTPUT FORMAT (JSON):
{
    "headers_raw": {
        "invoice_number": "string",
        "invoice_date": "DD/MM/YYYY",
        "vendor_name": "string",
        "vendor_gstin": "15-char GSTIN",
        "buyer_name": "string",
        "buyer_gstin": "15-char GSTIN",
        "total_amount": number,
        "tax_amount": number
    },
    "line_items_raw": [
        {
            "description": "string",
            "hsn_code": "string",
            "quantity": number,
            "unit_price": number,
            "amount": number,
            "tax_rate": number
        }
    ]
}

Combine line items from ALL pages. Return ONLY valid JSON."""

    # Build message content with all page images
    content = [{"type": "text", "text": f"Extract invoice data from this {len(images)}-page invoice:"}]
    
    for img in images:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{img['mime_type']};base64,{img['base64']}",
                "detail": "high"
            }
        })
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content}
            ],
            max_tokens=4000,
            temperature=0.1
        )
        
        response_text = response.choices[0].message.content
        token_usage = response.usage.total_tokens if response.usage else 0
        
        # Parse JSON
        try:
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            
            extracted_data = json.loads(json_str)
            extracted_data['_token_usage'] = token_usage
            extracted_data['_extraction_method'] = 'vision_ocr'
            return extracted_data
            
        except json.JSONDecodeError:
            return {
                'headers_raw': {'raw_text': response_text[:500]},
                'line_items_raw': [],
                '_token_usage': token_usage,
                '_extraction_method': 'vision_ocr'
            }
            
    except Exception as e:
        logger.error(f"Vision API call failed: {e}")
        raise


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for load balancer"""
    return jsonify({
        'status': 'healthy',
        'service': 'pdf-extractor',
        'version': '1.0.0',
        'features': ['native-pdf', 'multi-page', 'vision-fallback']
    })


@app.route('/extract', methods=['POST'])
def extract_pdf():
    """
    Extract data from PDF invoice.
    
    Input: {
        "job_id": "string",
        "gcs_input_path": "gs://bucket/path/to/file.pdf",
        "tenant_id": "string" (or via X-Tenant-ID header),
        "client_id": "string" (optional, for COA matching in enrichment)
    }
    
    Output: Same schema as data-extractor-v2 for pipeline compatibility
    """
    global openai_client
    
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json()
        
        job_id = data.get('job_id')
        gcs_path = data.get('gcs_input_path')
        client_id = data.get('client_id')
        
        if not job_id or not gcs_path:
            return jsonify({'error': 'job_id and gcs_input_path required'}), 400
        
        logger.info(f"📄 PDF extraction started for job {job_id}")
        
        # Update job status to EXTRACTING
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTING',
            'extractor_type': 'pdf-native',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        # Download PDF from GCS
        bucket_name = gcs_path.replace('gs://', '').split('/')[0]
        blob_path = '/'.join(gcs_path.replace('gs://', '').split('/')[1:])
        
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        pdf_content = blob.download_as_bytes()
        
        logger.info(f"📥 Downloaded PDF: {len(pdf_content)} bytes")
        
        # First try text extraction (faster, cheaper)
        pdf_data = extract_pdf_text(pdf_content)
        
        if pdf_data['has_extractable_text'] and len(pdf_data['full_text'].strip()) > 100:
            # PDF has extractable text - use text analysis
            logger.info(f"📝 Using text extraction ({pdf_data['total_pages']} pages)")
            extracted_data = extract_with_text_prompt(
                pdf_data['full_text'], 
                pdf_data['total_pages']
            )
        else:
            # Scanned PDF - fallback to Vision API
            logger.info(f"🖼️ PDF appears scanned, using Vision API")
            images = prepare_pdf_for_vision(pdf_content)
            if not images:
                raise ValueError("Failed to convert PDF to images for OCR")
            extracted_data = extract_with_vision_prompt(images)
        
        # Store extraction in Firestore (same location as data-extractor-v2)
        extraction_doc = {
            'headers_raw': extracted_data.get('headers_raw', {}),
            'line_items_raw': extracted_data.get('line_items_raw', []),
            'extraction_metadata': extracted_data.get('extraction_metadata', {}),
            'extracted_at': datetime.utcnow().isoformat(),
            'extraction_method': extracted_data.get('_extraction_method', 'unknown'),
            'token_usage': extracted_data.get('_token_usage', 0),
            'pages_processed': pdf_data.get('total_pages', 1)
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main').set(extraction_doc)
        
        # Update job status to EXTRACTED
        line_items_count = len(extracted_data.get('line_items_raw', []))
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTED',
            'line_items_count': line_items_count,
            'pages_processed': pdf_data.get('total_pages', 1),
            'extraction_method': extracted_data.get('_extraction_method', 'unknown'),
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"✅ Extracted job {job_id}: {line_items_count} line items from {pdf_data.get('total_pages', 1)} pages")
        
        # Trigger enrichment-worker (same as data-extractor-v2)
        auth_header = request.headers.get('Authorization')
        
        def call_enrichment_worker():
            try:
                enrichment_payload = {
                    'tenant_id': tenant_id,
                    'job_id': job_id,
                    'client_id': client_id,
                    'line_items': extracted_data.get('line_items_raw', [])
                }
                
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{ENRICHMENT_WORKER_URL}/enrich-job",
                    json=enrichment_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Enrichment triggered for job {job_id}")
                else:
                    logger.error(f"❌ Enrichment trigger failed: {resp.status_code}")
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'ENRICHMENT_FAILED',
                        'error': f"Enrichment trigger failed: {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Enrichment call failed: {e}")
                db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                    'status': 'ENRICHMENT_FAILED',
                    'error': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Call enrichment asynchronously
        threading.Thread(target=call_enrichment_worker, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'line_items_count': line_items_count,
            'pages_processed': pdf_data.get('total_pages', 1),
            'extraction_method': extracted_data.get('_extraction_method', 'unknown'),
            'enrichment_triggered': True
        })
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ PDF extraction failed: {e}")
        # Update job status to FAILED
        try:
            db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                'status': 'EXTRACTION_FAILED',
                'error': str(e),
                'updated_at': datetime.utcnow().isoformat()
            })
        except:
            pass
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
