const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'watch-mail-trial'
  });
}

// Configuration  
const INITIAL_API_URL = 'https://initial-api-812016027146.asia-south1.run.app';
const QUEUE_PROCESSOR_URL = 'https://queue-processor-812016027146.asia-south1.run.app';

exports.handler = async (event, context) => {
  console.log('=== UPLOAD INVOICE FUNCTION ===');
  console.log('Request received:', {
    method: event.httpMethod,
    path: event.path,
    contentType: event.headers['content-type'],
    hasAuthHeader: !!(event.headers.authorization || event.headers.Authorization)
  });
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://invoiceparse.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // 1. Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing or invalid authorization token' }),
      };
    }

    const idToken = authHeader.split(' ')[1];
    console.log('ID token extracted, length:', idToken ? idToken.length : 0);
    
    // Verify Firebase ID token
    let userEmail;
    try {
      console.log('Verifying Firebase ID token...');
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      userEmail = decodedToken.email;
      console.log(`Authenticated user: ${userEmail}`);
    } catch (verifyError) {
      console.error('Firebase token verification failed:', verifyError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Invalid authentication token',
          details: verifyError.message
        }),
      };
    }

    // 2. Forward the entire request to initial-api service
    console.log('Forwarding upload request to initial-api service...');
    
    // Create the request to initial-api with the same headers and body
    const uploadHeaders = {
      'Authorization': `Bearer ${idToken}`,
    };
    
    // Don't set Content-Type - let it be set automatically for FormData
    if (event.headers['content-type']) {
      uploadHeaders['Content-Type'] = event.headers['content-type'];
    }
    
    // Forward the request body as-is
    let requestBody;
    if (event.isBase64Encoded) {
      requestBody = Buffer.from(event.body, 'base64');
    } else {
      requestBody = event.body;
    }
    
    const uploadResponse = await fetch(`${INITIAL_API_URL}/upload_invoice`, {
      method: 'POST',
      headers: uploadHeaders,
      body: requestBody
    });
    
    console.log('Initial-api response status:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Initial-api upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload successful:', uploadResult);
    
    // 3. Extract job_id and bucket info from response
    const jobId = uploadResult.job_id || uploadResult.request_id;
    const bucketPath = uploadResult.bucket_path || uploadResult.blob_path;
    
    if (!jobId) {
      console.error('No job_id received from initial-api:', uploadResult);
      throw new Error('Invalid response from upload service - missing job_id');
    }
    
    console.log('Job created successfully:', { jobId, bucketPath });

    // 4. Process file through queue processor
    try {
      console.log('Processing file through queue processor...');
      const queueResponse = await fetch(`${QUEUE_PROCESSOR_URL}/process-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bucket_path: bucketPath
        })
      });

      console.log('Queue processor response status:', queueResponse.status);
      
      if (!queueResponse.ok) {
        const errorText = await queueResponse.text();
        console.error('Queue processor failed:', errorText);
        throw new Error(`Queue processing failed: ${queueResponse.status} - ${errorText}`);
      }
      
      const queueResult = await queueResponse.json();
      console.log('Job added to queue successfully:', queueResult);
      
      // Return the queue processor job_id for polling
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          job_id: queueResult.job_id,
          message: queueResult.message,
          queue_position: queueResult.queue_position,
          status: "queued"
        })
      };
      
    } catch (queueError) {
      console.error('Error calling queue processor:', queueError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Queue processing failed',
          details: queueError.message
        })
      };
    }

  } catch (error) {
    console.error('Upload function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Upload failed',
        details: error.message
      })
    };
  }
};