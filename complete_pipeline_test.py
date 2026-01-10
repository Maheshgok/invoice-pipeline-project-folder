"""
Complete Local Pipeline Test with Full JSON Processing
Tests the full 3-phase pipeline with detailed output and proper JSON parsing
"""

import os
import sys
import json
import time
import base64
import re
from datetime import datetime

# Add shared directory to path  
sys.path.append('shared')
from functional_openai_handler import (
    create_extraction_function,
    create_enrichment_function,
    create_analysis_function
)

def print_separator(title: str, char: str = "="):
    """Print formatted separator"""
    print("\n" + char * 80)
    print(f"  {title}")
    print(char * 80)

def extract_json_from_response(content: str) -> dict:
    """Extract JSON from response that might be wrapped in markdown"""
    try:
        # First try direct parsing
        return json.loads(content)
    except json.JSONDecodeError:
        # Look for JSON wrapped in markdown code blocks
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Look for any JSON-like structure
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass
        
        # Return raw content if no JSON found
        return {"raw_content": content}

def print_json_pretty(data, title: str = None):
    """Print JSON data in pretty format"""
    if title:
        print(f"\n📋 {title}:")
        print("-" * (len(title) + 4))
    
    print(json.dumps(data, indent=2, ensure_ascii=False))

def create_final_tabulation(extracted_data: dict, enriched_data: dict, validation_data: dict) -> dict:
    """Create final tabulated summary combining header info with enriched line items"""
    
    # Extract header information
    header_info = {}
    if 'invoice_header' in extracted_data:
        header_info.update(extracted_data['invoice_header'])
    if 'vendor_details' in extracted_data:
        header_info['vendor'] = extracted_data['vendor_details']
    if 'totals' in extracted_data:
        header_info['totals'] = extracted_data['totals']
    
    # Create enriched line items table
    enriched_line_items = []
    line_items = extracted_data.get('line_items', [])
    
    # Get business intelligence mapping
    item_categories = {}
    if 'business_intelligence' in enriched_data and 'line_item_categories' in enriched_data['business_intelligence']:
        for item in enriched_data['business_intelligence']['line_item_categories']:
            item_categories[item.get('item', '')] = {
                'category': item.get('category', ''),
                'business_use': item.get('business_use', ''),
                'account_code': item.get('account_code', '')
            }
    
    # Combine line items with enrichment data
    for item in line_items:
        description = item.get('description', '')
        enrichment = item_categories.get(description, {})
        
        enriched_item = {
            'sr_no': item.get('sr_no', ''),
            'description': description,
            'hsn_code': item.get('hsn', ''),
            'quantity': item.get('quantity', ''),
            'rate': item.get('rate', 0),
            'taxable_amount': item.get('taxable', 0),
            'gst_rate': item.get('gst_rate', ''),
            'gst_amount': item.get('gst_amount', 0),
            'total_amount': item.get('total', 0),
            # Enriched fields
            'business_category': enrichment.get('category', 'Uncategorized'),
            'business_use': enrichment.get('business_use', 'General'),
            'account_code': enrichment.get('account_code', '5000'),
            'expense_type': 'Operational'
        }
        enriched_line_items.append(enriched_item)
    
    # Calculate summary totals
    total_taxable = sum(item.get('taxable_amount', 0) for item in enriched_line_items)
    total_gst = sum(item.get('gst_amount', 0) for item in enriched_line_items)
    total_amount = sum(item.get('total_amount', 0) for item in enriched_line_items)
    
    # Get validation summary
    validation_summary = validation_data.get('validation_summary', {}) if validation_data else {}
    
    return {
        "tabulation_summary": {
            "document_type": "GST Invoice - Tabulated",
            "processing_status": "Complete with Business Intelligence",
            "validation_score": validation_summary.get('overall_score', 'N/A'),
            "ready_for_accounting": validation_summary.get('ready_for_accounting', True)
        },
        "invoice_header": header_info,
        "enriched_line_items": enriched_line_items,
        "tabulated_totals": {
            "line_items_count": len(enriched_line_items),
            "total_taxable_amount": total_taxable,
            "total_gst_amount": total_gst,
            "grand_total": total_amount,
            "currency": "INR"
        },
        "business_summary": {
            "categories_identified": len(set(item['business_category'] for item in enriched_line_items)),
            "account_codes_used": list(set(item['account_code'] for item in enriched_line_items)),
            "expense_classification": enriched_data.get('business_intelligence', {}).get('expense_classification', 'Mixed'),
            "compliance_status": validation_summary.get('compliance_status', 'Pending Review')
        }
    }

def complete_pipeline_test():
    """Run complete 3-phase pipeline test with full output"""
    
    print_separator("COMPLETE LOCAL PIPELINE TEST - SUNRISE ENTERPRISE INVOICE")
    
    job_id = f"complete_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"🆔 Job ID: {job_id}")
    print(f"📅 Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Load the SUNRISE ENTERPRISE invoice
    print("\n📁 Loading SUNRISE ENTERPRISE invoice...")
    test_image_path = r"C:\Users\Dell 5330\OneDrive\Documents\InvoiceSetup\invoice-pipeline-project-folder\gst-invoice-bill-format-2.png"
    
    if not os.path.exists(test_image_path):
        print(f"❌ Invoice not found at: {test_image_path}")
        return False
    
    with open(test_image_path, 'rb') as f:
        image_content = base64.b64encode(f.read()).decode('utf-8')
    
    print(f"✅ Loaded SUNRISE ENTERPRISE invoice: {len(image_content):,} characters")
    
    # Create functional handlers
    print("\n🔧 Initializing functional OpenAI handlers...")
    extract_func = create_extraction_function("complete_test")
    enrich_func = create_enrichment_function("complete_test") 
    analyze_func = create_analysis_function("complete_test")
    print("✅ All functional handlers initialized")
    
    # Track performance
    total_tokens = 0
    phase_results = {}
    pipeline_start = time.time()
    
    try:
        # PHASE 1: DATA EXTRACTION
        print_separator("PHASE 1: INVOICE DATA EXTRACTION", "=")
        
        extraction_prompt = """
Analyze this SUNRISE ENTERPRISE invoice image and extract all data into structured JSON format.

Extract these key details:
1. Invoice header information (number, date, GSTIN)
2. Vendor/company details (name, address, contact)
3. Bill to / Ship to details  
4. All line items with HSN codes, quantities, rates, amounts
5. Tax calculations (CGST, SGST, IGST percentages and amounts)
6. Payment and delivery terms
7. Total amounts and summary

Return as clean JSON:
{
  "invoice_header": {
    "invoice_number": "",
    "invoice_date": "",
    "gstin": "",
    "original_duplicate": ""
  },
  "vendor_details": {
    "name": "",
    "address": "",
    "contact_number": "",
    "gstin": ""
  },
  "billing_details": {
    "bill_to_name": "",
    "bill_to_address": "",
    "ship_to_name": "",
    "ship_to_address": "",
    "state": "",
    "gstin": ""
  },
  "line_items": [
    {
      "sr_no": 1,
      "description": "",
      "hsn": "",
      "quantity": "",
      "rate": 0.00,
      "taxable": 0.00,
      "gst_rate": "",
      "gst_amount": 0.00,
      "total": 0.00
    }
  ],
  "tax_summary": {
    "sub_total": 0.00,
    "cgst_amount": 0.00,
    "sgst_amount": 0.00,
    "igst_amount": 0.00,
    "total_gst": 0.00
  },
  "totals": {
    "total_amount": 0.00,
    "amount_in_words": ""
  },
  "payment_details": {
    "payment_mode": "",
    "bank_details": "",
    "terms": ""
  }
}
"""
        
        print(f"🖼️ Processing invoice image ({len(image_content):,} chars)...")
        phase1_start = time.time()
        
        extraction_result = extract_func(
            prompt=extraction_prompt,
            image_content=image_content,
            context=f"extraction_{job_id}"
        )
        
        phase1_time = time.time() - phase1_start
        
        if not extraction_result['success']:
            print(f"❌ PHASE 1 FAILED: {extraction_result['error']}")
            return False
        
        print(f"✅ Extraction completed in {phase1_time:.2f} seconds")
        print(f"🔢 Tokens consumed: {extraction_result['tokens_used']:,}")
        total_tokens += extraction_result['tokens_used']
        
        # Parse extraction result
        extracted_data = extract_json_from_response(extraction_result['content'])
        print_json_pretty(extracted_data, "EXTRACTED INVOICE DATA")
        
        phase_results['phase1'] = {
            'time': phase1_time,
            'tokens': extraction_result['tokens_used'],
            'data': extracted_data
        }
        
        # PHASE 2: DATA ENRICHMENT & BUSINESS INTELLIGENCE
        print_separator("PHASE 2: DATA ENRICHMENT & BUSINESS INTELLIGENCE", "=")
        
        enrichment_prompt = f"""
Enhance this extracted SUNRISE ENTERPRISE invoice data with business intelligence and validation.

Extracted Invoice Data:
{json.dumps(extracted_data, indent=2)}

Add these business enrichments:
1. Data quality assessment (completeness, accuracy score)
2. Business categorization for each line item
3. Expense classification and accounting codes
4. GST compliance verification
5. Supplier risk assessment
6. Journal entry suggestions for Indian accounting
7. Purchase pattern analysis

Return structured JSON:
{{
  "data_quality": {{
    "completeness_score": 0,
    "accuracy_assessment": "",
    "missing_fields": [],
    "validation_notes": []
  }},
  "business_intelligence": {{
    "line_item_categories": [
      {{"item": "", "category": "", "business_use": "", "account_code": ""}}
    ],
    "expense_classification": "",
    "purchase_type": "",
    "supplier_analysis": {{
      "risk_level": "",
      "business_relationship": "",
      "compliance_status": ""
    }}
  }},
  "accounting_suggestions": {{
    "chart_of_accounts": [
      {{"description": "", "account_code": "", "debit": 0.00, "credit": 0.00}}
    ],
    "gst_treatment": "",
    "journal_entries": [
      {{"date": "", "particulars": "", "debit": 0.00, "credit": 0.00}}
    ]
  }},
  "compliance_check": {{
    "gst_validation": true,
    "hsn_code_accuracy": true,
    "tax_calculation_correct": true,
    "regulatory_compliance": "",
    "issues_identified": []
  }}
}}
"""
        
        print("💡 Enriching data with business intelligence...")
        phase2_start = time.time()
        
        enrichment_result = enrich_func(
            prompt=enrichment_prompt,
            context=f"enrichment_{job_id}"
        )
        
        phase2_time = time.time() - phase2_start
        
        if not enrichment_result['success']:
            print(f"❌ PHASE 2 FAILED: {enrichment_result['error']}")
            return False
        
        print(f"✅ Enrichment completed in {phase2_time:.2f} seconds")
        print(f"🔢 Tokens consumed: {enrichment_result['tokens_used']:,}")
        total_tokens += enrichment_result['tokens_used']
        
        # Parse enrichment result
        enriched_data = extract_json_from_response(enrichment_result['content'])
        print_json_pretty(enriched_data, "BUSINESS INTELLIGENCE & ENRICHMENT")
        
        phase_results['phase2'] = {
            'time': phase2_time,
            'tokens': enrichment_result['tokens_used'],
            'data': enriched_data
        }
        
        # PHASE 3: FINAL VALIDATION & INTEGRATION
        print_separator("PHASE 3: FINAL VALIDATION & INTEGRATION", "=")
        
        # Combine all data
        combined_data = {
            "job_id": job_id,
            "processing_timestamp": datetime.now().isoformat(),
            "extracted_data": extracted_data,
            "enriched_data": enriched_data,
            "source_document": "SUNRISE_ENTERPRISE_Invoice_Inv-5"
        }
        
        validation_prompt = f"""
Perform final validation and integration of this complete SUNRISE ENTERPRISE invoice processing result.

Complete Processing Data:
{json.dumps(combined_data, indent=2)}

Provide comprehensive final validation:
1. Cross-verify all calculations (line totals, tax calculations, grand total)
2. Validate business logic consistency
3. Check compliance with Indian GST regulations
4. Assess data integrity and completeness
5. Generate final processing summary
6. Recommend next steps for accounting integration

Return final validation JSON:
{{
  "validation_summary": {{
    "overall_score": 0,
    "processing_quality": "",
    "data_integrity": true,
    "calculation_accuracy": true,
    "compliance_status": "",
    "ready_for_accounting": true
  }},
  "calculation_verification": {{
    "line_items_total": 0.00,
    "tax_calculations": {{
      "cgst_verified": true,
      "sgst_verified": true,
      "total_tax_correct": true
    }},
    "grand_total_verified": true,
    "discrepancies_found": []
  }},
  "recommendations": {{
    "accounting_actions": [],
    "approval_required": false,
    "priority_level": "",
    "next_steps": []
  }},
  "integration_readiness": {{
    "erp_ready": true,
    "accounting_system_ready": true,
    "required_approvals": [],
    "estimated_processing_time": ""
  }}
}}
"""
        
        print("🔍 Performing final validation and integration check...")
        phase3_start = time.time()
        
        validation_result = analyze_func(
            prompt=validation_prompt,
            context=f"validation_{job_id}"
        )
        
        phase3_time = time.time() - phase3_start
        
        if not validation_result['success']:
            print(f"❌ PHASE 3 FAILED: {validation_result['error']}")
            return False
        
        print(f"✅ Final validation completed in {phase3_time:.2f} seconds")
        print(f"🔢 Tokens consumed: {validation_result['tokens_used']:,}")
        total_tokens += validation_result['tokens_used']
        
        # Parse validation result
        validation_data = extract_json_from_response(validation_result['content'])
        print_json_pretty(validation_data, "FINAL VALIDATION & INTEGRATION REPORT")
        
        phase_results['phase3'] = {
            'time': phase3_time,
            'tokens': validation_result['tokens_used'],
            'data': validation_data
        }
        
        # FINAL TABULATION: Header + Enriched Line Items
        print_separator("FINAL TABULATION: HEADER + ENRICHED LINE ITEMS", "=")
        
        final_tabulation = create_final_tabulation(extracted_data, enriched_data, validation_data)
        print_json_pretty(final_tabulation, "COMPLETE TABULATED INVOICE DATA")
        
        # PIPELINE COMPLETION SUMMARY
        total_pipeline_time = time.time() - pipeline_start
        
        print_separator("PIPELINE COMPLETION SUMMARY", "=")
        
        final_complete_result = {
            "job_id": job_id,
            "status": "COMPLETED_SUCCESSFULLY",
            "processing_timestamp": datetime.now().isoformat(),
            "source_document": "SUNRISE_ENTERPRISE_GST_Invoice_Inv-5",
            "extracted_data": extracted_data,
            "enriched_data": enriched_data,
            "validation_data": validation_data,
            "combined_data": combined_data,
            "final_tabulation": final_tabulation,
            "performance_metrics": {
                "total_processing_time": total_pipeline_time,
                "phase_breakdown": {
                    "phase1_extraction": {"time": phase1_time, "tokens": extraction_result['tokens_used']},
                    "phase2_enrichment": {"time": phase2_time, "tokens": enrichment_result['tokens_used']},
                    "phase3_validation": {"time": phase3_time, "tokens": validation_result['tokens_used']}
                },
                "total_tokens_consumed": total_tokens,
                "average_time_per_phase": total_pipeline_time / 3,
                "tokens_per_second": total_tokens / total_pipeline_time if total_pipeline_time > 0 else 0
            }
        }
        
        # Display summary
        print(f"\n🎉 PIPELINE COMPLETED SUCCESSFULLY!")
        print(f"📊 PERFORMANCE SUMMARY:")
        print(f"   ⏱️  Total Processing Time: {total_pipeline_time:.2f} seconds")
        print(f"   🔢 Total Tokens Consumed: {total_tokens:,}")
        print(f"   📈 Processing Efficiency: {total_tokens/total_pipeline_time:.1f} tokens/second")
        print(f"\n📋 PHASE BREAKDOWN:")
        print(f"   🔍 Phase 1 (Extraction):  {phase1_time:6.2f}s | {extraction_result['tokens_used']:4,} tokens")
        print(f"   💡 Phase 2 (Enrichment):  {phase2_time:6.2f}s | {enrichment_result['tokens_used']:4,} tokens")  
        print(f"   ✅ Phase 3 (Validation):  {phase3_time:6.2f}s | {validation_result['tokens_used']:4,} tokens")
        
        # Save complete result
        result_filename = f"complete_pipeline_result_{job_id}.json"
        with open(result_filename, 'w', encoding='utf-8') as f:
            json.dump(final_complete_result, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Complete result saved to: {result_filename}")
        print(f"📁 File size: {os.path.getsize(result_filename):,} bytes")
        
        # Quick summary of key findings
        if 'invoice_header' in extracted_data:
            invoice_info = extracted_data['invoice_header']
            print(f"\n📋 INVOICE SUMMARY:")
            print(f"   📄 Invoice Number: {invoice_info.get('invoice_number', 'N/A')}")
            print(f"   📅 Invoice Date: {invoice_info.get('invoice_date', 'N/A')}")
            print(f"   🏢 Vendor: SUNRISE ENTERPRISE")
            
        if 'totals' in extracted_data:
            totals_info = extracted_data['totals']
            print(f"   💰 Total Amount: ₹{totals_info.get('total_amount', 'N/A')}")
        
        print(f"\n🎯 PROCESSING STATUS: READY FOR DEPLOYMENT TO CLOUD SERVICES")
        
        return True
        
    except Exception as e:
        print(f"\n💥 PIPELINE ERROR: {str(e)}")
        import traceback
        print("\n📋 DETAILED ERROR TRACE:")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🚀 Starting Complete Local Pipeline Test...")
    success = complete_pipeline_test()
    
    if success:
        print("\n✅ Complete pipeline test PASSED!")
        print("🚀 Ready for Cloud Run deployment!")
        exit(0)
    else:
        print("\n❌ Complete pipeline test FAILED!")
        print("🔧 Please check errors above and fix before deployment.")
        exit(1)