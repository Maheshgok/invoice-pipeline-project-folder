"""
Simple OpenAI API connection test
Tests basic connectivity with the DataAnalyst1 key
"""

import sys
import os
import logging

# Add shared directory to path  
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from openai_handler import OpenAIHandler, OpenAIRequest

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_api_connection():
    """Simple API connection test"""
    print("🔌 Testing OpenAI API connection...")
    
    try:
        handler = OpenAIHandler(service_name="connection_test")
        
        # Simple text request
        request = OpenAIRequest(
            prompt="Hello! Please respond with: API connection successful",
            model="gpt-4o",
            context_name="Connection_Test",
            temperature=0.0
        )
        
        response = handler.process_request(request)
        
        if response.success:
            print("✅ API Connection Test: SUCCESS")
            print(f"📊 Tokens used: {response.tokens_used}")
            print(f"🤖 Response: {response.raw_response}")
            return True
        else:
            print(f"❌ API Connection Test: FAILED")
            print(f"🔍 Error: {response.error}")
            if response.raw_response:
                print(f"🔍 Raw response: {response.raw_response}")
            return False
            
    except Exception as e:
        print(f"❌ Critical error: {str(e)}")
        return False

def test_invoice_header_extraction():
    """Test header extraction method"""
    print("📋 Testing header extraction method...")
    
    try:
        handler = OpenAIHandler(service_name="header_test")
        
        # Use a simple base64 encoded 1x1 pixel PNG
        simple_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9aIGzKwAAAABJRU5ErkJggg=="
        
        response = handler.extract_invoice_header(simple_png_b64, "test_123")
        
        print(f"✅ Header extraction method called successfully")  
        print(f"📊 Success: {response.success}")
        print(f"🔍 Error (if any): {response.error}")
        if response.raw_response:
            print(f"🤖 Raw response: {response.raw_response[:200]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ Header extraction test failed: {str(e)}")
        return False

if __name__ == "__main__":
    print("🚀 Simple OpenAI API Tests")
    print("=" * 40)
    
    results = []
    results.append(("API Connection", test_api_connection()))
    results.append(("Header Method", test_invoice_header_extraction()))
    
    print("\n" + "=" * 40)
    print("📊 Results:")
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\n🎯 {passed}/{len(results)} tests passed")
    
    if passed > 0:
        print("🎉 OpenAI API is accessible with the DataAnalyst1 key!")
        print("📝 The shared handler is working correctly.")
    else:
        print("⚠️ API connection issues detected.")