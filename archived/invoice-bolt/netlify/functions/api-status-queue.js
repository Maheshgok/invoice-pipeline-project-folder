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
const QUEUE_PROCESSOR_URL = 'https://queue-processor-812016027146.asia-south1.run.app';

exports.handler = async (event, context) => {
  console.log('=== API STATUS FUNCTION ===');
  console.log('Request received:', {
    method: event.httpMethod,
    path: event.path,
    hasAuthHeader: !!(event.headers.authorization || event.headers.Authorization)
  });
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://invoiceparse.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
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

    // 2. Extract job_id from query parameters
    const jobId = event.queryStringParameters?.job_id;
    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing job_id parameter' }),
      };
    }

    console.log(`Getting status for job ${jobId}`);

    // 3. Call queue processor for job status
    const statusResponse = await fetch(`${QUEUE_PROCESSOR_URL}/job-status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Queue processor response status:', statusResponse.status);
    
    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Job not found' })
        };
      }
      
      const errorText = await statusResponse.text();
      console.error('Queue processor error:', errorText);
      throw new Error(`Queue processor error: ${statusResponse.status} - ${errorText}`);
    }
    
    const statusResult = await statusResponse.json();
    console.log('Job status retrieved:', statusResult);

    // 4. Transform response to match expected format
    const response = {
      job_id: statusResult.job_id,
      status: statusResult.status,
      progress: statusResult.progress || 0.0,
      created_at: statusResult.created_at,
      updated_at: statusResult.updated_at,
      error_message: statusResult.error_message,
      result: statusResult.result
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('API status function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to get job status',
        details: error.message
      })
    };
  }
};