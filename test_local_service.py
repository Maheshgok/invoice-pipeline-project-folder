#!/usr/bin/env python3
"""Local test for extraction service with environment variables"""

import os
import sys

# Set environment variables for local testing
os.environ['GOOGLE_CLOUD_PROJECT'] = 'watch-mail-trial'
os.environ['OPENAI_SECRET_NAME'] = 'extraction-service-openai-key'

# Test the service locally
sys.path.insert(0, 'extraction-service')

try:
    from main import app
    
    # Test health endpoint
    with app.test_client() as client:
        response = client.get('/health')
        print(f"Health check status: {response.status_code}")
        print(f"Response: {response.get_json()}")
        
    print("✅ Local service test passed")
    
except Exception as e:
    print(f"❌ Local service test failed: {e}")
    import traceback
    traceback.print_exc()