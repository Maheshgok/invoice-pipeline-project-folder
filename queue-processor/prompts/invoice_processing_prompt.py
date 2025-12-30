"""
OpenAI Invoice Processing Prompts
Centralized prompts for easy fine-tuning and maintenance
"""

INVOICE_PROCESSING_PROMPT = """You are an accountant for an INDIAN business recording PURCHASE / VENDOR invoices
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


# Alternative prompts for different scenarios or A/B testing
INVOICE_PROCESSING_PROMPT_V2 = """Enhanced version with more specific instructions for complex invoices...
(You can add alternative prompts here for testing different approaches)"""


# Prompt variations for different invoice types
SERVICE_INVOICE_PROMPT = """Specialized prompt for service invoices...
(Add specific handling for service-based invoices)"""


PRODUCT_INVOICE_PROMPT = """Specialized prompt for product/goods invoices...
(Add specific handling for goods-based invoices with inventory considerations)"""


# System prompts for different models or use cases
SYSTEM_PROMPTS = {
    "default": "You are a professional accountant specializing in Indian accounting standards.",
    "detailed": "You are an expert Indian chartered accountant with 15+ years experience in GST compliance and double-entry bookkeeping.",
    "conservative": "You are a conservative accountant who only records what is clearly visible on invoices."
}


def get_invoice_prompt(version="default"):
    """
    Get the appropriate invoice processing prompt
    
    Args:
        version (str): Version of the prompt to use ("default", "v2", "service", "product")
    
    Returns:
        str: The selected prompt
    """
    prompts = {
        "default": INVOICE_PROCESSING_PROMPT,
        "v2": INVOICE_PROCESSING_PROMPT_V2,
        "service": SERVICE_INVOICE_PROMPT,
        "product": PRODUCT_INVOICE_PROMPT
    }
    
    return prompts.get(version, INVOICE_PROCESSING_PROMPT)


def get_system_prompt(version="default"):
    """
    Get the appropriate system prompt
    
    Args:
        version (str): Version of the system prompt to use
    
    Returns:
        str: The selected system prompt
    """
    return SYSTEM_PROMPTS.get(version, SYSTEM_PROMPTS["default"])