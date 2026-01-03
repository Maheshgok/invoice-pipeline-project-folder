# Phase 1: Strict Data Extraction from Invoice Image
# NO IMAGINATION - Only extract what is clearly visible on the image

PHASE1_DATA_EXTRACTION_PROMPT = """You are an expert OCR data extractor. Extract MAXIMUM possible data from this invoice image.

EXTRACTION RULES:
1. Extract ALL visible text fields, even if they seem minor
2. Capture ALL line items with complete details
3. Extract vendor/buyer information comprehensively
4. Identify ALL tax-related information (GST rates, amounts, exemptions)
5. Capture payment terms, due dates, reference numbers
6. Extract bank details, contact information, addresses
7. Identify any transport/shipping information
8. Note any discounts, charges, or additional fees
9. Extract table headers and organize data systematically
10. Include any handwritten notes or stamps if visible

COMPREHENSIVE DATA CAPTURE:
- Company names, addresses, contact details (phone, email, website)
- GSTIN, PAN numbers, registration details
- Invoice numbers, dates, reference numbers, PO numbers
- ALL item descriptions (even brief ones)
- Quantities, units, rates, amounts
- ALL tax information (CGST, SGST, IGST rates and amounts)
- Discounts, charges, transport costs
- Payment terms, due dates, bank details
- Any certifications, compliance notes
- Delivery addresses, shipping details
- Terms and conditions text

OUTPUT FORMAT:
{
  "document_type": "",
  "vendor_details": {
    "name": "",
    "address": "",
    "gstin": "",
    "pan": "",
    "contact_number": "",
    "email": "",
    "website": ""
  },
  "buyer_details": {
    "name": "",
    "address": "",
    "gstin": "",
    "contact_number": "",
    "email": ""
  },
  "invoice_details": {
    "invoice_number": "",
    "invoice_date": "",
    "due_date": "",
    "po_number": "",
    "challan_number": "",
    "dispatch_doc_no": "",
    "dispatched_through": "",
    "destination": "",
    "terms_of_delivery": ""
  },
  "line_items": [
    {
      "serial_no": "",
      "item_description": "",
      "hsn_sac_code": "",
      "quantity": 0,
      "unit": "",
      "rate": 0,
      "per": "",
      "discount_percent": 0,
      "discount_amount": 0,
      "taxable_value": 0,
      "cgst_rate": 0,
      "cgst_amount": 0,
      "sgst_rate": 0,
      "sgst_amount": 0,
      "igst_rate": 0,
      "igst_amount": 0,
      "total_amount": 0
    }
  ],
  "additional_charges": [
    {
      "description": "",
      "amount": 0,
      "tax_applicable": false
    }
  ],
  "tax_summary": {
    "total_taxable_value": 0,
    "total_cgst": 0,
    "total_sgst": 0,
    "total_igst": 0,
    "total_tax_amount": 0,
    "round_off": 0,
    "grand_total": 0
  },
  "payment_details": {
    "bank_name": "",
    "account_number": "",
    "ifsc_code": "",
    "branch": "",
    "upi_id": ""
  },
  "transport_details": {
    "transport_mode": "",
    "vehicle_number": "",
    "lr_rr_number": "",
    "lr_rr_date": "",
    "freight_charges": 0
  },
  "additional_info": {
    "terms_and_conditions": "",
    "payment_terms": "",
    "delivery_terms": "",
    "warranty_terms": "",
    "notes": "",
    "certifications": ""
  }
}

EXTRACTION GUIDELINES:
1. If a field is not visible, use "" for strings and 0 for numbers
2. Extract exact text as visible on the invoice
3. Don't interpret or modify the extracted data
4. Preserve formatting of numbers and dates as shown
5. Include ALL line items, even if incomplete
6. Extract partial information rather than omit entirely
7. Note any unclear or partially visible text
8. Capture table structures and relationships accurately

Return ONLY the JSON object with maximum extracted data."""