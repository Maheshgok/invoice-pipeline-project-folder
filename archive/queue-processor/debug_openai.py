#!/usr/bin/env python3
"""
Simple OpenAI debug script to run inside Cloud Run container
"""
import os
import sys
import traceback
from openai import OpenAI

def main():
    print("🔍 Simple OpenAI Debug Script")
    print("="*50)
    
    # Check environment
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        # Try Secret Manager
        try:
            from google.cloud import secretmanager
            secret_name = os.environ.get('OPENAI_API_KEY_SECRET', 'openai-api-key-secret')
            project_id = os.environ.get('PROJECT_ID', 'watch-mail-trial')
            
            client = secretmanager.SecretManagerServiceClient()
            secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
            
            response = client.access_secret_version(request={"name": secret_path})
            api_key = response.payload.data.decode("UTF-8").strip()  # Strip whitespace!
            print(f"✅ API key loaded from Secret Manager, length: {len(api_key)}")
        except Exception as e:
            print(f"❌ Failed to load API key: {e}")
            return False
    else:
        print(f"✅ API key from env var, length: {len(api_key)}")

    # Test basic connectivity
    print("\n🌐 Testing basic connectivity...")
    try:
        import urllib3
        http = urllib3.PoolManager()
        response = http.request('GET', 'https://api.openai.com')
        print(f"✅ Basic HTTP to api.openai.com: {response.status}")
    except Exception as e:
        print(f"❌ Basic connectivity failed: {e}")
        traceback.print_exc()
        return False

    # Test OpenAI client
    print("\n🤖 Testing OpenAI client...")
    try:
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.openai.com/v1",
            timeout=30.0,
            max_retries=1
        )
        print("✅ OpenAI client initialized")
        
        # Test API call
        print("📞 Testing API call...")
        models = client.models.list()
        print(f"🎉 SUCCESS! Found {len(models.data)} models")
        return True
        
    except Exception as e:
        print(f"❌ OpenAI test failed: {e}")
        print(f"❌ Error type: {type(e).__name__}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)