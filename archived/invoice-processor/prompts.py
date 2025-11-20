INVOICE_EXTRACTION_PROMPT = """You are an expert accountant analyzing invoices. Extract the following information in JSON format:
{
    "InvoiceDetails": {
        "invoiceNumber": "string",
        "invoiceDate": "YYYY-MM-DD",
        "dueDate": "YYYY-MM-DD",
        "totalAmount": "number",
        "taxAmount": "number",
        "vendorName": "string",
        "vendorAddress": "string",
        "vendorGSTIN": "string",
        "items": [
            {
                "description": "string",
                "quantity": "number",
                "unitPrice": "number",
                "amount": "number"
            }
        ]
    },
    "SuggestedJournalEntries": [
        {
            "account": "string",
            "debit": "number",
            "credit": "number",
            "description": "string"
        }
    ]
}"""