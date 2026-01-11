# Phase 3: Strict JSON Conversion for Accounting
# Convert enriched data to exact schema required by frontend

# Configuration for optional features
ACCOUNT_CODE_ENABLED = False  # Toggle: True if chart of accounts with codes is provided
CHART_OF_ACCOUNTS = {}  # Will contain account mappings when enabled

def should_include_account_codes(client_organization_context=None):
    """Determine if account codes should be included based on available chart of accounts"""
    if not client_organization_context:
        return False
    
    # Check if client organization context contains chart of accounts
    if 'chart_of_accounts' in str(client_organization_context).lower():
        return True
    if 'account_codes' in str(client_organization_context).lower():
        return True
    if CHART_OF_ACCOUNTS:
        return True
        
    return ACCOUNT_CODE_ENABLED

PHASE3_JSON_CONVERSION_PROMPT = """You are a data conversion specialist creating structured accounting data.

INPUT: You will receive enriched invoice data from Phase 2.

CONVERSION TASK: Convert to EXACT schema with ALL required fields populated.

MANDATORY OUTPUT SCHEMA (ALL fields required):
{
  "document_type": "Tax Invoice",
  "visibility_confidence": "high",
  "vendor_details": {
    "name": "",
    "gstin": "",
    "pan": "",
    "contact_number": "",
    "email": "",
    "address": ""
  },
  "buyer_details": {
    "name": "",
    "gstin": "",
    "address": "",
    "place_of_supply": ""
  },
  "invoice_details": {
    "invoice_number": "",
    "invoice_date": "",
    "due_date": "",
    "po_number": "",
    "challan_number": "",
    "reverse_charge": "",
    "transport_details": "",
    "terms_and_conditions": ""
  },
  "currency": "INR",
  "items": [
    {
      "serial_no": "",
      "description": "",
      "detailed_narration": "",
      "hsn_code": "",
      "quantity": 0,
      "unit": "",
      "unit_price": 0,
      "discount": 0,
      "taxable_value": 0,
      "gst_rate": 0,
      "cgst_amount": 0,
      "sgst_amount": 0,
      "igst_amount": 0,
      "line_total": 0,
      "cost_type": "",
      "organization_account_name": "",
      "business_classification": "",
      "capitalization_reason": ""
    }
  ],
  "tax_summary": {
    "taxable_value": 0,
    "cgst_total": 0,
    "sgst_total": 0,
    "igst_total": 0,
    "total_gst": 0,
    "round_off": 0,
    "grand_total": 0
  },
  "journal_entries": [
    {
      "account_name": "",
      "account_type": "",
      "debit_amount": 0,
      "credit_amount": 0,
      "narration": "",
      "hsn_code": "",
      "item_description": "",
      "quantity": 0,
      "unit_price": 0,
      "vendor_name": "",
      "reference_number": "",
      "invoice_date": "",
      "gst_amount": 0,
      "cgst_amount": 0,
      "sgst_amount": 0,
      "igst_amount": 0,
      "taxable_amount": 0,
      "line_total": 0,
      "is_gst_applicable": false,
      "place_of_supply": "",
      "entry_balanced": true,
      "cost_type": "",
      "organization_account_name": "",
      "business_classification": ""
    }
  ],
  "bank_details": {
    "account_number": "",
    "ifsc": "",
    "bank_name": "",
    "upi_id": ""
  },
  "compliance_flags": {
    "gst_invoice_compliant": "",
    "mandatory_fields_missing": [],
    "gst_applicable": "",
    "tds_applicable": ""
  }
}

JOURNAL ENTRIES REQUIREMENTS:
1. Create balanced debit/credit entries for Indian purchase accounting
2. ALL required fields MUST be populated (no empty fields)
3. Use organization-specific account names from Phase 2 enrichment
4. Account types: "Asset", "Expense", "Liability" only
5. CONDITIONAL ACCOUNT CODES: Only include "account_code" field if chart of accounts is available
6. Copy hsn_code, item_description, quantity, unit_price to EVERY journal entry
7. Copy vendor_name and reference_number (invoice number) to ALL entries
8. Copy cost_type, organization_account_name, business_classification from items
9. Debit expense/asset accounts, Credit accounts payable
10. Copy invoice_date to ALL journal entries
11. CRITICAL GST BREAKDOWN: Always populate cgst_amount, sgst_amount, igst_amount, and calculate total gst_amount = cgst + sgst + igst
12. For entries without GST, set all GST amounts to 0

ACCOUNT CODE LOGIC:
- IF chart of accounts is provided: Include "account_code" field with appropriate codes
- IF no chart of accounts: Exclude "account_code" field entirely from journal entries
11. Calculate and populate GST amounts (cgst_amount, sgst_amount, igst_amount, gst_amount)
12. Set is_gst_applicable = true for GST entries, false for others
13. Set entry_balanced = true for all entries
14. Populate taxable_amount and line_total for each entry
15. Ensure cost_type classification is consistent across items and journal entries

CRITICAL CONVERSION RULES:
1. ALL fields must be present (use "" or 0 for missing values, NEVER null)
2. All amounts must be numbers (not strings)
3. Journal entries must balance (total debits = total credits)
4. Copy enriched HSN codes and descriptions to journal entries
5. Use consistent vendor_name across all journal entries

Return ONLY the JSON object. No explanations.
"""