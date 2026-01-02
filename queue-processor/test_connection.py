"""
Test connection to OpenAI API from Cloud Run environment
"""
import os
import logging
import requests
from openai import OpenAI
from google.cloud import secretmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_openai_connection():
    """Test OpenAI API connection with detailed debugging"""
    logger.info("🔍 Starting OpenAI connection test...")
    
    try:
        # Get API key from Secret Manager
        secret_name = os.environ.get('OPENAI_API_KEY_SECRET', 'openai-api-key-secret')
        project_id = os.environ.get('PROJECT_ID', 'watch-mail-trial')
        
        client = secretmanager.SecretManagerServiceClient()
        secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        
        response = client.access_secret_version(request={"name": secret_path})
        api_key = response.payload.data.decode("UTF-8").strip()  # Strip whitespace!
        
        logger.info(f"✅ API key loaded, length: {len(api_key)}")
        
        # Test basic HTTP connectivity to OpenAI
        logger.info("🌐 Testing basic HTTP connectivity to api.openai.com...")
        try:
            response = requests.get("https://api.openai.com", timeout=30)
            logger.info(f"✅ HTTP response status: {response.status_code}")
            logger.info(f"✅ HTTP response headers: {dict(response.headers)}")
        except Exception as e:
            logger.error(f"❌ HTTP connectivity failed: {e}")
            logger.error(f"❌ Exception type: {type(e).__name__}")
            # Continue anyway to test OpenAI client
        
        # Test direct curl to OpenAI API
        logger.info("🔑 Testing API key with direct curl...")
        try:
            import subprocess
            result = subprocess.run([
                'curl', '-s', '-w', '%{http_code}',
                'https://api.openai.com/v1/models',
                '-H', f'Authorization: Bearer {api_key}'
            ], capture_output=True, text=True, timeout=30)
            logger.info(f"✅ Curl result: status={result.stdout[-3:]}, output_length={len(result.stdout)}")
            if result.stderr:
                logger.info(f"📝 Curl stderr: {result.stderr}")
        except Exception as e:
            logger.error(f"❌ Curl test failed: {e}")
            
        # Test OpenAI client initialization
        logger.info("🤖 Initializing OpenAI client...")
        openai_client = OpenAI(
            api_key=api_key,
            base_url="https://api.openai.com/v1",  # Explicit base URL
            timeout=30.0,
            max_retries=2
        )
        logger.info("✅ OpenAI client initialized")
        
        # Test simple API call
        logger.info("📞 Testing simple API call (list models)...")
        try:
            models = openai_client.models.list()
            logger.info(f"✅ API call successful, models available: {len(models.data)}")
            return True
        except Exception as e:
            logger.exception("❌ API call failed with full stacktrace:")
            logger.error(f"❌ Error type: {type(e).__name__}")
            logger.error(f"❌ Error message: {str(e)}")
            
            # Additional debugging
            if hasattr(e, 'response'):
                logger.error(f"❌ Response: {e.response}")
            if hasattr(e, 'code'):
                logger.error(f"❌ Error code: {e.code}")
            if hasattr(e, 'body'):
                logger.error(f"❌ Error body: {e.body}")
            if hasattr(e, 'status_code'):
                logger.error(f"❌ HTTP status: {e.status_code}")
            
            # Try alternative approach with explicit HTTP adapter
            logger.info("🔄 Trying alternative HTTP configuration...")
            try:
                import urllib3
                from openai import OpenAI
                
                # Disable HTTP/2 and force HTTP/1.1
                alt_client = OpenAI(
                    api_key=api_key,
                    timeout=30.0,
                    max_retries=1,
                    http_client=urllib3.PoolManager(
                        ssl_context=None,
                        retries=urllib3.util.retry.Retry(total=1)
                    )
                )
                
                models = alt_client.models.list()
                logger.info(f"✅ Alternative HTTP config worked! Models: {len(models.data)}")
                return True
                
            except Exception as alt_e:
                logger.error(f"❌ Alternative approach also failed: {alt_e}")
                return False
            
    except Exception as e:
        logger.error(f"❌ Test failed with exception: {e}")
        return False

if __name__ == "__main__":
    success = test_openai_connection()
    if success:
        logger.info("🎉 OpenAI connection test PASSED")
    else:
        logger.error("💥 OpenAI connection test FAILED")