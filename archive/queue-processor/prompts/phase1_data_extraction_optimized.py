# Phase 1: Optimized Data Extraction (70% token reduction)

PHASE1_DATA_EXTRACTION_PROMPT = """Extract ALL visible invoice data. Return structured JSON.

EXTRACT: Vendor/buyer details, invoice info, ALL line items, taxes, payments, transport, bank details.

REQUIRED FIELDS:
- document_type, vendor_details{name,address,gstin,pan,contact,email}, buyer_details{name,address,gstin,contact}, invoice_details{number,date,due_date,po_number}
- line_items[]{description,hsn,quantity,unit,rate,discount,taxable_value,cgst_rate,cgst_amount,sgst_rate,sgst_amount,igst_rate,igst_amount,total}
- tax_summary{taxable_value,cgst,sgst,igst,total_tax,grand_total}, payment_details{bank,account,ifsc,upi}, transport_details{mode,vehicle,lr_number,freight}

RULES: Extract exact visible text. Use "" for missing strings, 0 for missing numbers. Include ALL items even if incomplete.

Return ONLY JSON object with maximum extracted data."""