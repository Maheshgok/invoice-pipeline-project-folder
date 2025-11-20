"""
OpenAI Processing Module
Handles image analysis with OpenAI Vision API

Latest Deployment: 2025-11-20 09:52 UTC
OpenAI Library: ≥1.50.0 (latest compatible version)
Key Improvements: Enhanced error handling, timeout configuration, retry logic
Docker Image: queue-processor@sha256:fe48a8dac90b5ef3e824bbc32d2a4b00d81c349250e16e1f5453820f6c319ab3
"""
import os
import json
import base64
import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from openai import OpenAI
from google.cloud import storage
from pdf2image import convert_from_bytes
from PIL import Image
import io

logger = logging.getLogger(__name__)

class OpenAIProcessor:
    """
    Handles OpenAI Vision API processing for invoice images
    """
    
    def __init__(self):
        self.api_key = os.environ.get('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        # Initialize OpenAI client with explicit configuration
        try:
            self.client = OpenAI(
                api_key=self.api_key,
                timeout=60.0,
                max_retries=2
            )
            logger.info("OpenAI client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            raise
        
        # Initialize storage client with explicit project ID
        project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.storage_client = storage.Client(project=project_id)
        logger.info(f"OpenAI Processor initialized for project: {project_id}")
        
        # Indian purchase invoice processing prompt
        self.invoice_prompt = """You are an accountant for an INDIAN business recording PURCHASE / VENDOR invoices
in the BUYER'S books.

ASSUMPTIONS
- Every invoice image is a PURCHASE (vendor bill), never a sales invoice.
- The business is always the CUSTOMER on the invoice.
- Any GST/tax on the invoice is INPUT TAX (asset/debit), NOT output tax payable.

TASK
Read the invoice image and return a SINGLE JSON object with EXACTLY this shape
(keys must match; use empty string/null/0 if something is not present):

{
  "vendor_name": "",
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "total_amount": 0,
  "currency": "",
  "gstin": "",
  "pan": "",
  "items": [
    {
      "description": "",
      "quantity": 0,
      "unit_price": 0,
      "total": 0,
      "hsn_code": "",
      "gst_rate": 0
    }
  ],
  "tax_details": {
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "total_gst": 0,
    "taxable_amount": 0
  },
  "suggested_journal_entries": [
    {
      "account_name": "",
      "account_type": "",
      "debit_amount": 0,
      "credit_amount": 0,
      "narration": ""
    }
  ],
  "double_entry_bookkeeping": {
    "journal_entry_set": [
      {
        "entry_number": 1,
        "date": "",
        "entries": [
          {
            "account_name": "",
            "account_code": "",
            "account_type": "",
            "debit_amount": 0,
            "credit_amount": 0,
            "narration": ""
          }
        ],
        "total_debit": 0,
        "total_credit": 0,
        "is_balanced": true,
        "entry_description": ""
      }
    ]
  },
  "compliance_notes": {
    "gst_applicable": "",
    "tds_applicable": "",
    "accounting_standard": "",
    "expense_category": ""
  },
  "extracted_table": [
    []
  ]
}

FIELD RULES
- Dates: "DD-MM-YYYY" where possible.
- Numeric fields: numbers only (no commas, no currency symbols).
- If a field is missing on the invoice, use 0 for amounts and "" for strings.

ACCOUNTING RULES (INDIA, PURCHASE SIDE)
- ALWAYS treat tax as INPUT tax:
  - Use accounts like "CGST Input Tax Credit", "SGST Input Tax Credit",
    "IGST Input Tax Credit", "Input GST", "GST Input Tax Credit", "Tax Receivable".
  - These MUST be "Current Asset" (or "Asset") accounts with DEBIT balances.
  - NEVER create liability tax accounts such as "Sales Tax Payable",
    "GST Payable", "Output GST", "Output CGST/SGST/IGST".
- For each invoice, the main pattern is:
  - Dr Expense/Asset accounts for taxable value (e.g. Office Expenses, Furniture, etc.)
  - Dr Input GST (CGST + SGST or IGST) for tax amount
  - Cr Accounts Payable / Vendor Name for total invoice amount
- "suggested_journal_entries" MUST be consistent with
  "double_entry_bookkeeping.journal_entry_set" in accounts and amounts.
- In every journal entry line:
  - EITHER debit_amount > 0 and credit_amount = 0
  - OR credit_amount > 0 and debit_amount = 0
  - NEVER have both > 0, and never both non-zero.
- For each journal_entry_set:
  - total_debit = sum of all debit_amount in entries
  - total_credit = sum of all credit_amount in entries
  - total_debit MUST EQUAL total_credit
  - is_balanced MUST be true
- The total invoice logic must be consistent:
  taxable_amount + total_gst = total_amount (when tax is present).

GENERAL
- Focus only on the current invoice image.
- Be conservative: do not invent extra taxes or charges not visible.
- If something is unclear, use your best accounting judgment but keep
  double-entry balanced and consistent with total_amount.

OUTPUT FORMAT
- Return ONLY the JSON object.
- No explanations, no comments, no trailing commas."""
        
        logger.info("OpenAI Processor initialized")

    def process_image(self, bucket_path: str) -> Dict[str, Any]:
        """
        Process a single image with OpenAI Vision API
        Returns: {"success": bool, "data": dict, "error": str}
        """
        bucket_name = None
        blob_path = None
        
        try:
            # Parse bucket and path from bucket_path
            logger.info(f"Received bucket_path: {bucket_path}")
            if '/' in bucket_path:
                # Format: bucket_name/path/to/file
                parts = bucket_path.split('/', 1)
                bucket_name = parts[0]
                blob_path = parts[1]
                logger.info(f"Parsed bucket_name: {bucket_name}, blob_path: {blob_path}")
            else:
                # Fallback to hardcoded bucket (this should not happen with proper setup)
                bucket_name = 'watch-mail-trial-invoice-raw-files'  # Use correct bucket name
                blob_path = bucket_path
                logger.warning(f"No '/' found in bucket_path, using fallback bucket: {bucket_name}")
            
            logger.info(f"Processing file: bucket={bucket_name}, path={blob_path}")
            
            # Get file from Cloud Storage
            bucket = self.storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            if not blob.exists():
                return {
                    "success": False,
                    "error": f"File not found: {bucket_name}/{blob_path}",
                    "data": None
                }
            
            # Download file content and encode as base64 for OpenAI
            try:
                logger.info(f"Downloading file content from {bucket_name}/{blob_path}")
                file_content = blob.download_as_bytes()
                
                # Determine the MIME type based on file extension
                blob_name_lower = blob_path.lower()
                if blob_name_lower.endswith('.pdf'):
                    # Handle PDF files - convert to image
                    logger.info(f"Processing PDF file: {blob_path}")
                    base64_content = self._process_pdf_to_base64(file_content)
                    mime_type = 'image/png'  # PDF converted to PNG
                elif blob_name_lower.endswith(('.jpg', '.jpeg')):
                    mime_type = 'image/jpeg'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                elif blob_name_lower.endswith('.png'):
                    mime_type = 'image/png'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                elif blob_name_lower.endswith('.gif'):
                    mime_type = 'image/gif'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                elif blob_name_lower.endswith('.webp'):
                    mime_type = 'image/webp'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                else:
                    # Fallback: try to detect if it's a PDF by content
                    if file_content.startswith(b'%PDF'):
                        logger.info(f"Detected PDF file by content: {blob_path}")
                        base64_content = self._process_pdf_to_base64(file_content)
                        mime_type = 'image/png'
                    else:
                        mime_type = 'image/jpeg'  # Default fallback
                        base64_content = base64.b64encode(file_content).decode('utf-8')
                
                # Create data URL
                data_url = f"data:{mime_type};base64,{base64_content}"
                
                logger.info(f"Successfully processed file as {mime_type}, size: {len(file_content)} bytes")
                
            except Exception as e:
                logger.error(f"Could not download file content: {e}")
                return {
                    "success": False,
                    "error": f"Could not access file for processing: {str(e)}",
                    "data": None
                }
            
            # Call OpenAI Vision API
            logger.info(f"Calling OpenAI Vision API with model gpt-4o")
            response = self.client.chat.completions.create(
                model="gpt-4o",  # Updated to current vision model
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": self.invoice_prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": data_url}
                            }
                        ]
                    }
                ],
                max_tokens=2000
            )
            
            logger.info(f"OpenAI API call successful, extracting response content")
            
            # Extract and parse response
            content = response.choices[0].message.content
            logger.info(f"OpenAI response content length: {len(content)} characters")
            logger.info(f"RAW OpenAI response content: {content}")
            
            parsed_data = self._parse_openai_response(content)
            logger.info(f"Parsed data type: {type(parsed_data)}")
            logger.info(f"Parsed data: {parsed_data}")
            
            result_data = {
                "extracted_data": parsed_data,
                "processing_time": datetime.now().isoformat(),
                "model_used": "gpt-4o"
            }
            
            logger.info(f"Final result data structure before return: {result_data}")
            
            return {
                "success": True,
                "data": result_data,
                "error": None
            }
            
        except Exception as e:
            logger.error(f"Error processing image {bucket_name}/{blob_path}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "data": None
            }

    def _parse_openai_response(self, content: str) -> Dict[str, Any]:
        """Parse OpenAI response and extract JSON"""
        try:
            # Clean up the response to extract JSON
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1]
            
            content = content.strip()
            
            # Try to parse as JSON
            parsed_data = json.loads(content)
            return parsed_data
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            # Return structured error with raw content
            return {
                "error": "Failed to parse JSON response",
                "raw_response": content,
                "extracted_table": [],
                "vendor_name": "Parse Error",
                "invoice_number": "Unknown",
                "total_amount": "0.00"
            }
        
        except Exception as e:
            logger.error(f"Unexpected error parsing response: {e}")
            return {
                "error": f"Unexpected parsing error: {str(e)}",
                "raw_response": content,
                "extracted_table": []
            }

    def _process_pdf_to_base64(self, pdf_content: bytes) -> str:
        """Convert PDF to PNG image and return base64 string"""
        try:
            # Convert PDF to images using pdf2image (first page only)
            images = convert_from_bytes(
                pdf_content,
                first_page=1,  # Only convert first page
                last_page=1,
                dpi=200,  # High DPI for better text recognition
                fmt='PNG'
            )
            
            if not images:
                raise ValueError("No images generated from PDF")
            
            # Get the first (and only) image
            image = images[0]
            
            # Optimize image size if too large (OpenAI has limits)
            max_size = 2048  # Maximum width/height
            if image.width > max_size or image.height > max_size:
                logger.info(f"Resizing PDF image from {image.width}x{image.height}")
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                logger.info(f"Resized to {image.width}x{image.height}")
            
            # Convert to base64
            buffer = io.BytesIO()
            image.save(buffer, format='PNG', optimize=True)
            buffer.seek(0)
            base64_content = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            logger.info(f"Successfully converted PDF to PNG image: {image.width}x{image.height}")
            return base64_content
            
        except Exception as e:
            logger.error(f"Error converting PDF to image: {e}")
            raise ValueError(f"Failed to process PDF file: {str(e)}")