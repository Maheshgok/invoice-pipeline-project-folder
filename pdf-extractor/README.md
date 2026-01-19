# PDF Extractor Service

Native PDF processing service for multi-page invoice extraction. This service handles PDF files directly without converting them to images (for text-based PDFs), resulting in:

- **Better accuracy**: Text extraction preserves original formatting
- **Lower latency**: No image conversion overhead
- **Multi-page support**: Consolidates all pages into single extraction
- **Lower cost**: Text analysis uses fewer tokens than Vision API

## Architecture

```
                    ┌─────────────────┐
                    │   initial-api   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   orchestrator  │
                    └────────┬────────┘
                             │
           ┌─────────────────┴─────────────────┐
           │ File Type Detection               │
           │                                   │
    ┌──────▼──────┐                   ┌───────▼───────┐
    │ PDF files   │                   │ Image files   │
    │             │                   │ (JPG/PNG)     │
    └──────┬──────┘                   └───────┬───────┘
           │                                   │
    ┌──────▼──────┐                   ┌───────▼───────┐
    │ pdf-        │                   │ data-         │
    │ extractor   │                   │ extractor-v2  │
    └──────┬──────┘                   └───────┬───────┘
           │                                   │
           └─────────────────┬─────────────────┘
                             │
                    ┌────────▼────────┐
                    │ enrichment-     │
                    │ worker          │
                    └─────────────────┘
```

## Extraction Strategy

### 1. Text-based PDFs (Most Common)
For PDFs with extractable text (created by software):
- Uses PyMuPDF to extract text from all pages
- Sends consolidated text to OpenAI GPT-4o for structured extraction
- **Faster and cheaper** than Vision API

### 2. Scanned PDFs (Fallback)
For scanned PDFs without extractable text:
- Converts pages to images using PyMuPDF
- Uses OpenAI Vision API for OCR
- Handles up to 10 pages per invoice

## API Endpoints

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "pdf-extractor",
  "version": "1.0.0",
  "features": ["native-pdf", "multi-page", "vision-fallback"]
}
```

### Extract PDF
```
POST /extract
Content-Type: application/json
X-Tenant-ID: {tenant_id}

{
  "job_id": "string",
  "gcs_input_path": "gs://bucket/path/file.pdf",
  "client_id": "optional-for-coa-matching"
}
```

Response:
```json
{
  "success": true,
  "job_id": "string",
  "line_items_count": 5,
  "pages_processed": 3,
  "extraction_method": "text_analysis",
  "enrichment_triggered": true
}
```

## Output Schema

Same as `data-extractor-v2` for pipeline compatibility:

```json
{
  "headers_raw": {
    "invoice_number": "INV-2024-001",
    "invoice_date": "15/01/2024",
    "vendor_name": "Vendor Ltd",
    "vendor_gstin": "29ABCDE1234F1Z5",
    "buyer_name": "Buyer Ltd",
    "buyer_gstin": "27FGHIJ5678K1Z9",
    "total_amount": 11800,
    "tax_amount": 1800
  },
  "line_items_raw": [
    {
      "description": "Product A",
      "hsn_code": "84719000",
      "quantity": 10,
      "unit_price": 1000,
      "amount": 10000,
      "tax_rate": 18,
      "tax_amount": 1800
    }
  ]
}
```

## Deployment

```bash
# From pdf-extractor directory
./deploy.sh
```

Or manually:
```bash
gcloud builds submit --tag gcr.io/papertoproper/pdf-extractor --project=papertoproper

gcloud run deploy pdf-extractor \
  --image gcr.io/papertoproper/pdf-extractor \
  --platform managed \
  --region asia-south1 \
  --project papertoproper \
  --memory 2Gi \
  --timeout 600 \
  --allow-unauthenticated
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ID` | `watch-mail-trial` | GCP project for Secret Manager |
| `ENRICHMENT_WORKER_URL` | (Cloud Run URL) | URL of enrichment-worker service |
| `OPENAI_API_KEY` | Secret Manager | OpenAI API key (fallback to env) |

## Dependencies

- **PyMuPDF**: Fast PDF text extraction and rendering
- **OpenAI**: GPT-4o for text analysis, Vision for scanned PDFs
- **Flask**: Web framework
- **Google Cloud**: Firestore, Storage, Secret Manager
