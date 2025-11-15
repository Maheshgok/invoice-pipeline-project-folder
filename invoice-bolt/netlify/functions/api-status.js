// Netlify function to handle /api/status endpoint
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
const NEW_CLOUD_RUN_URL = 'https://queue-processor-812016027146.asia-south1.run.app';

exports.handler = async function(event, context) {
  console.log('=== STATUS CHECK FUNCTION ===');
  console.log('Request received:', {
    method: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters
  });

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://invoiceparse.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Content-Type': 'application/json'
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
    console.log('ID token received, length:', idToken.length);
    
    // Verify Firebase ID token
    try {
      console.log('Verifying Firebase ID token...');
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log(`Authenticated user: ${decodedToken.email}`);
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
    
    // 2. Extract jobId from path or query parameters
    const params = event.queryStringParameters || {};
    let jobId = params.jobId;
    
    // Also check if jobId is in the path (e.g., /api/status/job-123)
    if (!jobId && event.path) {
      const pathParts = event.path.split('/');
      const statusIndex = pathParts.findIndex(part => part === 'status');
      if (statusIndex !== -1 && pathParts[statusIndex + 1]) {
        jobId = pathParts[statusIndex + 1];
      }
    }
    
    if (!jobId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Job ID is required' })
      };
    }
    
    console.log('Checking status for job ID:', jobId);
    
    // 3. Call new Cloud Run service for status
    const statusUrl = `${NEW_CLOUD_RUN_URL}/status/${encodeURIComponent(jobId)}`;
    console.log('Calling new processing service:', statusUrl);
    
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Processing service response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Processing service error:', errorText);
      
      // Handle common error cases
      if (response.status === 404) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            status: 'not_found',
            message: 'Job not found or not yet started'
          })
        };
      } else if (response.status === 401) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication failed with processing service' })
        };
      } else {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Processing service error',
            details: errorText
          })
        };
      }
    }
    
    // 4. Get and transform the response
    const responseData = await response.json();
    console.log('Processing service response:', responseData);
    
    // Transform response to match frontend expectations if needed
    // The frontend expects: { status: string, result?: any }
    let transformedResponse = {
      status: responseData.status || 'unknown'
    };
    
    // Add result data if available
    if (responseData.result) {
      transformedResponse.result = responseData.result;
    }
    
    // Add any additional fields that might be useful
    if (responseData.message) {
      transformedResponse.message = responseData.message;
    }
    
    if (responseData.error) {
      transformedResponse.error = responseData.error;
    }
    
    // 5. Return the transformed response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(transformedResponse)
    };
    
  } catch (error) {
    console.error('Status check function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal Server Error",
        details: error.message
      })
    };
  }
};