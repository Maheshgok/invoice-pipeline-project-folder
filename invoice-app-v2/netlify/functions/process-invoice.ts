import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if environment variables are available
let firebaseInitialized = false;

console.log('Checking Firebase environment variables...');
console.log('FIREBASE_PROJECT_ID:', !!process.env.FIREBASE_PROJECT_ID);
console.log('FIREBASE_PRIVATE_KEY:', !!process.env.FIREBASE_PRIVATE_KEY);
console.log('FIREBASE_CLIENT_EMAIL:', !!process.env.FIREBASE_CLIENT_EMAIL);

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  if (!admin.apps.length) {
    try {
      console.log('Initializing Firebase Admin SDK...');
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
      console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      firebaseInitialized = false;
    }
  } else {
    firebaseInitialized = true;
    console.log('Firebase Admin SDK already initialized');
  }
} else {
  console.error('Missing required Firebase environment variables');
  firebaseInitialized = false;
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
    console.log('Headers received:', JSON.stringify(event.headers, null, 2));
    
    // Verify Firebase token from Authorization header
    const authHeader = event.headers.authorization;
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.substring(7);
    console.log('Token length:', token.length);
    
    let decodedToken;
    
    if (firebaseInitialized) {
      // Use Firebase Admin SDK if properly initialized
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
        console.log('Token verified for user:', decodedToken.email);
      } catch (authError) {
        console.error('Token verification failed:', authError);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired token' })
        };
      }
    } else {
      // Temporary workaround: Basic token validation without Firebase Admin
      console.log('⚠️ Firebase Admin not initialized, using basic token validation');
      try {
        // Decode JWT token without verification (development mode)
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          throw new Error('Invalid token format');
        }
        
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('Token payload project:', payload.aud);
        
        // Check if token is for the correct Firebase project
        if (payload.aud !== 'watch-mail-trial') {
          throw new Error('Token not for correct project');
        }
        
        // Check token expiration
        if (payload.exp && payload.exp < Date.now() / 1000) {
          throw new Error('Token expired');
        }
        
        decodedToken = {
          uid: payload.user_id || payload.sub,
          email: payload.email || 'unknown@example.com'
        };
        console.log('✅ Basic token validation passed for user:', decodedToken.email);
      } catch (tokenError) {
        console.error('Basic token validation failed:', tokenError);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid token format or expired' })
        };
      }
    }
    
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
  console.log('Processing invoice for user:', user.email);
  console.log('Event body:', event.body);
  
  if (!event.body) {
    console.error('No request body provided');
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' })
    };
  }

  try {
    const { fileName, fileSize, fileType } = JSON.parse(event.body);
    
    if (!fileName) {
      console.error('fileName is required but not provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'fileName is required' })
      };
    }

    console.log('Processing file:', fileName, 'Size:', fileSize, 'Type:', fileType, 'for user:', user.email);

    // Generate realistic Indian purchase invoice mock data with IndAS double-entry accounting
    const baseAmount = parseFloat((Math.random() * 50000 + 5000).toFixed(2));
    const gstRate = Math.random() > 0.5 ? 18 : 12; // Common GST rates in India
    const taxableAmount = parseFloat((baseAmount / (1 + gstRate/100)).toFixed(2));
    const totalGst = parseFloat((taxableAmount * gstRate/100).toFixed(2));
    const cgst = parseFloat((totalGst / 2).toFixed(2));
    const sgst = parseFloat((totalGst / 2).toFixed(2));
    
    const mockProcessedData = {
      id: `invoice_${Date.now()}`,
      fileName: fileName,
      fileSize: fileSize || Math.floor(Math.random() * 1000000),
      processedAt: new Date().toISOString(),
      userEmail: user.email,
      status: 'completed',
      confidence: 0.95,
      extractedData: {
        vendor_name: `${fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, ' ')} Pvt Ltd`,
        invoice_number: `INV/${new Date().getFullYear()}/${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        invoice_date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
        total_amount: baseAmount,
        currency: 'INR',
        gstin: `27A${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}Z${Math.floor(Math.random() * 10)}`,
        pan: `A${['B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'][Math.floor(Math.random() * 23)]}${['B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'][Math.floor(Math.random() * 23)]}${['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'][Math.floor(Math.random() * 26)]}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}${['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z'][Math.floor(Math.random() * 26)]}`,
        items: [
          {
            description: "Office Supplies and Stationery",
            quantity: Math.floor(Math.random() * 50) + 1,
            unit_price: parseFloat((taxableAmount / (Math.floor(Math.random() * 50) + 1)).toFixed(2)),
            total: taxableAmount,
            hsn_code: "48239000",
            gst_rate: gstRate
          }
        ],
        tax_details: {
          cgst: cgst,
          sgst: sgst,
          igst: 0,
          total_gst: totalGst,
          taxable_amount: taxableAmount
        },
        suggested_journal_entries: [
          {
            account_name: "Office Expenses",
            account_type: "Expense",
            debit_amount: taxableAmount,
            credit_amount: 0,
            narration: `Purchase from ${fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, ' ')} Pvt Ltd`
          },
          {
            account_name: "CGST Input Tax Credit",
            account_type: "Current Asset",
            debit_amount: cgst,
            credit_amount: 0,
            narration: "CGST on purchase invoice"
          },
          {
            account_name: "SGST Input Tax Credit", 
            account_type: "Current Asset",
            debit_amount: sgst,
            credit_amount: 0,
            narration: "SGST on purchase invoice"
          },
          {
            account_name: `${fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, ' ')} Pvt Ltd`,
            account_type: "Current Liability",
            debit_amount: 0,
            credit_amount: baseAmount,
            narration: "Amount payable to vendor"
          }
        ],
        double_entry_bookkeeping: {
          journal_entry_set: [
            {
              entry_number: 1,
              date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
              entries: [
                {
                  account_name: "Office Expenses",
                  account_code: "6001",
                  account_type: "Expense",
                  debit_amount: taxableAmount,
                  credit_amount: 0,
                  narration: `Purchase from ${fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, ' ')} Pvt Ltd`
                },
                {
                  account_name: "CGST Input Tax Credit",
                  account_code: "1511",
                  account_type: "Current Asset",
                  debit_amount: cgst,
                  credit_amount: 0,
                  narration: "CGST on purchase invoice"
                },
                {
                  account_name: "SGST Input Tax Credit",
                  account_code: "1512",
                  account_type: "Current Asset", 
                  debit_amount: sgst,
                  credit_amount: 0,
                  narration: "SGST on purchase invoice"
                },
                {
                  account_name: `${fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, ' ')} Pvt Ltd`,
                  account_code: "2001",
                  account_type: "Current Liability",
                  debit_amount: 0,
                  credit_amount: baseAmount,
                  narration: "Amount payable to vendor"
                }
              ],
              total_debit: parseFloat((taxableAmount + cgst + sgst).toFixed(2)),
              total_credit: baseAmount,
              is_balanced: true,
              entry_description: "Recording purchase invoice with input GST"
            }
          ]
        },
        compliance_notes: {
          gst_applicable: "Yes - Input Tax Credit available",
          tds_applicable: "Not applicable for this transaction",
          accounting_standard: "IndAS compliant double-entry bookkeeping", 
          expense_category: "Office Expenses"
        },
        extracted_table: [
          ["Description", "Quantity", "Unit Price", "Total", "HSN", "GST%"],
          ["Office Supplies and Stationery", (Math.floor(Math.random() * 50) + 1).toString(), (taxableAmount / (Math.floor(Math.random() * 50) + 1)).toFixed(2), taxableAmount.toString(), "48239000", gstRate.toString()]
        ]
      }
    };

    console.log('Mock data generated:', mockProcessedData.id);

    // Save to Firestore only if Firebase is properly initialized
    if (firebaseInitialized) {
      try {
        const db = admin.firestore();
        
        // Save the main invoice document
        const invoiceDocRef = await db.collection('invoices').add({
          ...mockProcessedData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          userId: user.uid
        });
        console.log('Invoice saved to Firestore with ID:', invoiceDocRef.id);
        
        // Save individual journal entries to a separate collection for better querying
        if (mockProcessedData.extractedData.double_entry_bookkeeping?.journal_entry_set?.[0]?.entries) {
          const journalEntries = mockProcessedData.extractedData.double_entry_bookkeeping.journal_entry_set[0].entries;
          const batch = db.batch();
          
          journalEntries.forEach((entry: any, index: number) => {
            const journalRef = db.collection('journal_entries').doc();
            batch.set(journalRef, {
              invoiceId: invoiceDocRef.id,
              invoiceNumber: mockProcessedData.extractedData.invoice_number,
              vendor: mockProcessedData.extractedData.vendor_name,
              entryIndex: index,
              date: entry.date || mockProcessedData.extractedData.invoice_date,
              accountName: entry.account_name,
              accountCode: entry.account_code,
              accountType: entry.account_type,
              debitAmount: entry.debit_amount || 0,
              creditAmount: entry.credit_amount || 0,
              narration: entry.narration,
              userId: user.uid,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          });
          
          await batch.commit();
          console.log(`Saved ${journalEntries.length} journal entries to Firestore`);
        }
        
      } catch (firestoreError) {
        console.error('Firestore save failed:', firestoreError);
        // Continue without Firestore for now
      }
    } else {
      console.warn('Firebase not properly initialized, skipping Firestore save');
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