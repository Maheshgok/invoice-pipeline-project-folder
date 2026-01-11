# Phase 3: Optimized JSON Conversion (70% token reduction)

PHASE3_JSON_CONVERSION_PROMPT = """Convert enriched data to final accounting schema.

REQUIRED OUTPUT STRUCTURE:
{document_type, visibility_confidence, vendor_details, buyer_details, invoice_details, currency, items[], tax_summary, journal_entries[], bank_details, compliance_flags}

JOURNAL ENTRY REQUIREMENTS:
- Balanced debits=credits, ALL fields populated
- Copy hsn_code, item_description, quantity, unit_price, vendor_name, invoice_date to ALL entries
- Include cgst_amount, sgst_amount, igst_amount, gst_amount(=cgst+sgst+igst)
- Set is_gst_applicable, entry_balanced=true, cost_type, organization_account_name, business_classification
- Account types: Asset/Expense/Liability only

CONVERSION RULES:
- All fields required (use "" or 0, never null)
- Numbers only for amounts
- Consistent vendor_name across entries
- Copy enriched data from Phase 2

Return ONLY final JSON object."""