import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if environment variables are available
let firebaseInitialized = false;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  if (!admin.apps.length) {
    try {
      const serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      firebaseInitialized = true;
    } catch (error) {
      console.error('Firebase initialization failed:', error);
    }
  } else {
    firebaseInitialized = true;
  }
}

export const handler: Handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    console.log('Processing request:', event.httpMethod, event.path);
    
    // For now, let's skip Firebase auth verification to test the upload flow
    // Later we can add it back once we confirm the basic flow works
    
    if (event.httpMethod === 'POST') {
      return await processInvoice(event, null, headers);
    } else if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Invoice API is working' })
      };
    } else {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
  } catch (error) {
    console.error('Invoice processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function processInvoice(event: any, user: any, headers: any) {
  console.log('Processing invoice, event body:', event.body);
  
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' })
    };
  }

  try {
    const { fileName, fileSize, fileType } = JSON.parse(event.body);
    
    if (!fileName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'fileName is required' })
      };
    }

    console.log('Processing file:', fileName, 'Size:', fileSize, 'Type:', fileType);

    // For now, we'll simulate file processing with mock data
    const mockProcessedData = {
      id: `invoice_${Date.now()}`,
      fileName: fileName,
      fileSize: fileSize || Math.floor(Math.random() * 1000000),
      processedAt: new Date().toISOString(),
      userEmail: 'test@example.com', // Mock user for now
      status: 'completed',
      confidence: 0.95,
      extractedData: {
        vendorName: `${fileName.split('.')[0]} Vendor Inc.`,
        invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
        invoiceDate: new Date().toISOString().split('T')[0],
        totalAmount: parseFloat((Math.random() * 2000 + 500).toFixed(2)),
        taxAmount: parseFloat((Math.random() * 200 + 50).toFixed(2)),
        currency: 'USD',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    };

    console.log('Mock data generated:', mockProcessedData);

    // Save to Firestore only if Firebase is initialized
    if (firebaseInitialized) {
      try {
        const db = admin.firestore();
        await db.collection('invoices').add({
          ...mockProcessedData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          userId: user?.uid || 'anonymous'
        });
        console.log('Data saved to Firestore');
      } catch (firestoreError) {
        console.error('Firestore save failed:', firestoreError);
        // Continue without Firestore
      }
    } else {
      console.log('Firebase not initialized, skipping Firestore save');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(mockProcessedData)
    };

  } catch (error) {
    console.error('Error saving to Firestore:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error processing file upload' })
    };
  }
}

async function getInvoice(event: any, user: admin.auth.DecodedIdToken, headers: any) {
  const invoiceId = event.queryStringParameters?.id;
  
  if (!invoiceId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invoice ID is required' })
    };
  }

  try {
    const db = admin.firestore();
    const doc = await db.collection('invoices').doc(invoiceId).get();
    
    if (!doc.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Invoice not found' })
      };
    }

    const invoice = doc.data();
    
    // Ensure user owns this invoice
    if (invoice?.userId !== user.uid) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Forbidden: Access denied' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: doc.id, ...invoice })
    };
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error fetching invoice' })
    };
  }
}