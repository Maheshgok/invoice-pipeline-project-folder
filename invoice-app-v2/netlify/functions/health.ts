import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      firebase: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'not configured',
      functions: 'active'
    },
    environment: {
      nodeVersion: process.version,
      netlifyRegion: context.clientContext?.netlifyRegion || 'unknown'
    }
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(healthStatus)
  };
};