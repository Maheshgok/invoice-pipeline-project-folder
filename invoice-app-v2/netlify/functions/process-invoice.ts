import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
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
    // Verify Firebase token from Authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Process invoice based on HTTP method
    switch (event.httpMethod) {
      case 'POST':
        return await processInvoice(event, decodedToken, headers);
      case 'GET':
        return await getInvoice(event, decodedToken, headers);
      default:
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

async function processInvoice(event: any, user: admin.auth.DecodedIdToken, headers: any) {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' })
    };
  }

  const { fileUrl, fileName } = JSON.parse(event.body);
  
  if (!fileUrl || !fileName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'fileUrl and fileName are required' })
    };
  }

  // TODO: Integrate with your invoice processing service
  // For now, return mock processed data
  const mockProcessedData = {
    id: `invoice_${Date.now()}`,
    fileName,
    fileUrl,
    processedAt: new Date().toISOString(),
    userEmail: user.email,
    status: 'completed',
    confidence: 0.95,
    extractedData: {
      vendorName: 'Sample Vendor Inc.',
      invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
      invoiceDate: new Date().toISOString().split('T')[0],
      totalAmount: 1250.00,
      taxAmount: 125.00,
      currency: 'USD',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }
  };

  // TODO: Save to Firestore
  try {
    const db = admin.firestore();
    await db.collection('invoices').add({
      ...mockProcessedData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      userId: user.uid
    });
  } catch (error) {
    console.error('Error saving to Firestore:', error);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(mockProcessedData)
  };
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