"""
Test script for shared OpenAI handler
Tests the API connection and basic functionality
"""

import sys
import os
import base64
import logging

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from openai_handler import OpenAIHandler, OpenAIRequest

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_text_completion():
    """Test basic text completion"""
    print("🧪 Testing text completion...")
    
    handler = OpenAIHandler(service_name="test")
    
    request = OpenAIRequest(
        prompt="What is 2+2? Respond with just the number in JSON format: {'result': number}",
        model="gpt-4o",
        context_name="Text_Test",
        temperature=0.1
    )
    
    response = handler.process_request(request)
    
    if response.success:
        print(f"✅ Text test successful!")
        print(f"📊 Tokens used: {response.tokens_used}")
        print(f"🤖 Response: {response.data}")
        return True
    else:
        print(f"❌ Text test failed: {response.error}")
        return False

def test_image_processing():
    """Test image processing with a simple base64 test image"""
    print("🖼️ Testing image processing...")
    
    handler = OpenAIHandler(service_name="test")
    
    # Create a minimal PNG test image (1x1 red pixel)
    test_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\x0bIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01U\x8d\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    test_base64 = base64.b64encode(test_png).decode('utf-8')
    
    request = OpenAIRequest(
        prompt="Describe this test image in JSON format: {'description': 'what you see', 'color': 'main color'}",
        model="gpt-4o",
        image_content=test_base64,
        context_name="Image_Test",
        temperature=0.1
    )
    
    response = handler.process_request(request)
    
    if response.success:
        print(f"✅ Image test successful!")
        print(f"📊 Tokens used: {response.tokens_used}")
        print(f"🤖 Response: {response.data}")
        return True
    else:
        print(f"❌ Image test failed: {response.error}")
        if response.raw_response:
            print(f"🔍 Raw response: {response.raw_response}")
        return False

def test_convenience_methods():
    """Test the convenience methods for invoice processing"""
    print("📋 Testing invoice convenience methods...")
    
    handler = OpenAIHandler(service_name="test")
    
    # Create a minimal PNG test image
    test_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\x0bIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01U\x8d\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    test_base64 = base64.b64encode(test_png).decode('utf-8')
    
    # Test header extraction
    header_response = handler.extract_invoice_header(test_base64, "test_job_123")
    
    if header_response.success:
        print(f"✅ Header extraction test successful!")
        print(f"📊 Header tokens: {header_response.tokens_used}")
    else:
        print(f"❌ Header extraction failed: {header_response.error}")
        return False
    
    # Test line items extraction  
    line_items_response = handler.extract_invoice_line_items(test_base64, "test_job_123")
    
    if line_items_response.success:
        print(f"✅ Line items extraction test successful!")
        print(f"📊 Line items tokens: {line_items_response.tokens_used}")
        return True
    else:
        print(f"❌ Line items extraction failed: {line_items_response.error}")
        return False

if __name__ == "__main__":
    print("🚀 Starting OpenAI Handler Tests...")
    print("=" * 50)
    
    test_results = []
    
    # Run tests
    test_results.append(("Text Completion", test_text_completion()))
    test_results.append(("Image Processing", test_image_processing()))
    test_results.append(("Convenience Methods", test_convenience_methods()))
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    
    passed = 0
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{len(test_results)} tests passed")
    
    if passed == len(test_results):
        print("🎉 All tests passed! OpenAI handler is working correctly.")
    else:
        print("⚠️ Some tests failed. Check the logs above for details.")