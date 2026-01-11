# 🚀 Quick API Reference Card

## 📋 **Available Services**

| Service | Base URL | Purpose |
|---------|----------|---------|
| **Queue Processor** | `queue-processor-545188726513.asia-south1.run.app` | Rate-limited queue processing |
| **Invoice Processor Async** | `invoice-processor-async-545188726513.asia-south1.run.app` | Direct invoice processing |
| **Initial API** | `initial-api-545188726513.asia-south1.run.app` | File upload & management |
| **Netlify Functions** | `invoiceparse.netlify.app/.netlify/functions/` | Frontend integration |

---

## 🎯 **Quick Actions**

### Upload & Process (Recommended Flow)
```bash
# 1. Upload file
POST /.netlify/functions/upload-invoice
Authorization: Bearer {google_id_token}
Body: form-data with file

# 2. Check status
GET /.netlify/functions/api-status-queue?job_id={uuid}
Authorization: Bearer {google_id_token}
```

### Health Checks
```bash
# Queue Processor
GET /health → queue-processor-545188726513.asia-south1.run.app

# Initial API  
GET /health → initial-api-545188726513.asia-south1.run.app
```

### Direct Processing (Legacy)
```bash
# Upload
POST /upload_invoice → initial-api-545188726513.asia-south1.run.app

# Process
POST /process-invoice → invoice-processor-async-545188726513.asia-south1.run.app

# Status
GET /status/{job_id} → invoice-processor-async-545188726513.asia-south1.run.app
```

---

## 🔐 **Authentication**

All endpoints require Google ID token:
```
Authorization: Bearer {google_id_token}
```

---

## 📊 **Status Responses**

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `pending` | Job queued | Keep polling |
| `processing` | Being processed | Keep polling |
| `completed` | Success | Get results |
| `failed` | Error occurred | Check error message |

---

## ⚡ **Rate Limits**

- **Queue Processor**: 1000 requests/minute
- **Global Processing**: 1 concurrent OpenAI call
- **Per User**: FIFO queue processing

---

*🔗 See [API_ENDPOINTS_REFERENCE.md](./API_ENDPOINTS_REFERENCE.md) for complete documentation*