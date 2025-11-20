# Complete Deployment Guide: Signed URL Invoice Processing

This guide will walk you through deploying the complete signed URL architecture where frontend uploads images directly to Cloud Storage, which triggers invoice processing.

## 🏗️ Architecture Overview

```
Frontend → Cloud Run (/generate-upload-url) → Returns Signed URL + request_id
Frontend → Direct upload to GCS using signed URL
Cloud Storage → Triggers Cloud Function (OBJECT_FINALIZE)
Cloud Function → Processes image with OpenAI → Stores in Firestore
Frontend → Polls Firestore using request_id for results
```

## 📋 Complete Deployment Steps

### **Step 1: Deploy Cloud Function (Invoice Processor)**

```bash
# Navigate to Cloud Function folder
cd initial-analysis

# Set environment variables
export GOOGLE_CLOUD_PROJECT="your-actual-project-id"
export OPENAI_API_KEY="sk-your-actual-openai-api-key"

# Authenticate and set project
gcloud auth login
gcloud config set project $GOOGLE_CLOUD_PROJECT

# Deploy the Cloud Function
chmod +x deploy.sh
./deploy.sh
```

**Expected Output:**
```
✅ Cloud Function deployed successfully!
• Function Name: invoice-processor
• Trigger: Cloud Storage (OBJECT_FINALIZE)
• Bucket: gs://ocr-invoice-raw-files-bucket
```

### **Step 2: Update Cloud Run Service**

#### **A. Add Required Dependencies to Cloud Run**

Update `initial-api/requirements.txt`:
```
Flask
gunicorn
google-cloud-storage
google-cloud-pubsub
google-cloud-firestore
Flask-Cors
google-auth
```

#### **B. Add IAM Permissions for Cloud Run**

```bash
# Get your Cloud Run service account (replace with actual service account)
PROJECT_ID="your-project-id"
SERVICE_ACCOUNT="your-cloudrun-sa@$PROJECT_ID.iam.gserviceaccount.com"

# Grant storage permissions for signed URL generation
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.objectCreator"

# Grant Firestore permissions  
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/datastore.user"
```

#### **C. Deploy Updated Cloud Run Service**

```bash
# Navigate to Cloud Run folder
cd initial-api

# Deploy with environment variables
gcloud run deploy your-service-name \
    --source . \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars "BUCKET_NAME=ocr-invoice-raw-files-bucket,PROJECT_ID=$PROJECT_ID"
```

### **Step 3: Frontend Integration**

#### **JavaScript Frontend Code**

```javascript
class InvoiceUploader {
    constructor(cloudRunUrl) {
        this.cloudRunUrl = cloudRunUrl;
    }

    async uploadInvoice(file) {
        try {
            // Step 1: Get signed URL
            const uploadUrlResponse = await fetch(`${this.cloudRunUrl}/generate-upload-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content_type: file.type,
                    file_size: file.size
                })
            });

            if (!uploadUrlResponse.ok) {
                throw new Error('Failed to get upload URL');
            }

            const { signed_url, request_id, content_type } = await uploadUrlResponse.json();
            
            // Step 2: Upload file directly to Google Cloud Storage
            const uploadResponse = await fetch(signed_url, {
                method: 'PUT',
                headers: {
                    'Content-Type': content_type,
                },
                body: file
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload file');
            }

            console.log('File uploaded successfully, request_id:', request_id);
            
            // Step 3: Poll for processing results
            return await this.pollForResults(request_id);
            
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }

    async pollForResults(requestId, maxAttempts = 30) {
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                const response = await fetch(`${this.cloudRunUrl}/check-status/${requestId}`);
                
                if (response.ok) {
                    const result = await response.json();
                    
                    if (result.status === 'success') {
                        console.log('Processing completed:', result);
                        return result;
                    } else if (result.status === 'error') {
                        throw new Error(`Processing failed: ${result.error_message}`);
                    }
                    // Still processing, continue polling
                }
                
            } catch (error) {
                console.error('Error checking status:', error);
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
        
        throw new Error('Processing timeout - please check manually');
    }
}

// Usage Example
const uploader = new InvoiceUploader('https://your-cloudrun-service-url');

// HTML file input handler
document.getElementById('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        console.log('Uploading file:', file.name);
        const result = await uploader.uploadInvoice(file);
        
        // Display results
        console.log('Invoice processed:', result.extracted_data);
        displayInvoiceData(result.extracted_data);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Upload failed: ' + error.message);
    }
});

function displayInvoiceData(invoiceData) {
    // Display the extracted invoice data in your UI
    const details = invoiceData.InvoiceDetails;
    console.log('Invoice Number:', details.InvoiceNumber);
    console.log('Invoice Date:', details.InvoiceDate);
    console.log('Grand Total:', details.Totals.GrandTotal);
    
    // Update your UI with the extracted data
    document.getElementById('invoiceNumber').textContent = details.InvoiceNumber;
    document.getElementById('invoiceDate').textContent = details.InvoiceDate;
    document.getElementById('grandTotal').textContent = details.Totals.GrandTotal;
}
```

#### **HTML Example**

```html
<!DOCTYPE html>
<html>
<head>
    <title>Invoice Processor</title>
</head>
<body>
    <div>
        <h2>Upload Invoice</h2>
        <input type="file" id="fileInput" accept="image/*,.pdf" />
        <div id="status"></div>
        
        <h3>Results</h3>
        <div>
            <p>Invoice Number: <span id="invoiceNumber">-</span></p>
            <p>Invoice Date: <span id="invoiceDate">-</span></p>
            <p>Grand Total: <span id="grandTotal">-</span></p>
        </div>
    </div>
    
    <script>
        // Add the JavaScript code from above here
    </script>
</body>
</html>
```

## 🧪 Testing the Complete Flow

### **Step 1: Test Cloud Function Deployment**

```bash
# Test by uploading a file manually
gsutil cp test-invoice.png gs://ocr-invoice-raw-files-bucket/invoices/$(date +%Y/%m/%d)/test-$(date +%s).png

# Check if function was triggered
gcloud functions logs read invoice-processor --limit 10
```

### **Step 2: Test Signed URL Generation**

```bash
# Test the signed URL endpoint
curl -X POST https://your-cloudrun-url/generate-upload-url \
  -H "Content-Type: application/json" \
  -d '{"content_type": "image/png", "file_size": 100000}'
```

**Expected Response:**
```json
{
  "signed_url": "https://storage.googleapis.com/...",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "object_path": "invoices/2024/01/15/550e8400-e29b-41d4-a716-446655440000.png",
  "expires_in": 600
}
```

### **Step 3: Test Complete Upload Flow**

```bash
# 1. Get signed URL
RESPONSE=$(curl -s -X POST https://your-cloudrun-url/generate-upload-url \
  -H "Content-Type: application/json" \
  -d '{"content_type": "image/png", "file_size": 100000}')

# 2. Extract signed URL and request ID
SIGNED_URL=$(echo $RESPONSE | jq -r '.signed_url')
REQUEST_ID=$(echo $RESPONSE | jq -r '.request_id')

# 3. Upload file
curl -X PUT "$SIGNED_URL" \
  -H "Content-Type: image/png" \
  --data-binary @test-invoice.png

# 4. Check processing status
curl https://your-cloudrun-url/check-status/$REQUEST_ID
```

## 🔍 Monitoring and Debugging

### **Check Cloud Function Logs**
```bash
gcloud functions logs read invoice-processor --region us-central1 --limit 20
```

### **Check Firestore Data**
```bash
# List collections
gcloud firestore collections list

# List documents in processing_results
gcloud firestore documents list processing_results --limit 5
```

### **Check Cloud Storage Events**
```bash
# List recent files in bucket
gsutil ls -l gs://ocr-invoice-raw-files-bucket/invoices/
```

## 🚨 Troubleshooting

### **Common Issues:**

1. **CORS Errors**: Make sure CORS headers are properly set in Cloud Run
2. **Upload Failures**: Check signed URL expiration and file size limits
3. **Processing Failures**: Verify OpenAI API key in Secret Manager
4. **Permission Denied**: Ensure proper IAM roles for service accounts

### **Debug Commands:**
```bash
# Check Cloud Run service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=your-service-name" --limit=20

# Check Cloud Function execution
gcloud functions logs read invoice-processor --execution-id=EXECUTION_ID

# Test Firestore connectivity
gcloud firestore documents create --collection=test --document-id=test --data='{"test": "value"}'
```

## ✅ Success Checklist

- [ ] Cloud Function deployed with Cloud Storage trigger
- [ ] Cloud Run service deployed with signed URL endpoints
- [ ] IAM permissions configured for both services
- [ ] OpenAI API key stored in Secret Manager
- [ ] Frontend can get signed URLs
- [ ] Frontend can upload files directly to GCS
- [ ] Cloud Function processes uploaded files
- [ ] Results are stored in Firestore
- [ ] Frontend can retrieve processing results

Once all steps are complete, your frontend will be able to upload invoice images and get processed results through the signed URL architecture!