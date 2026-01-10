"""
Test the simple OpenAI handler approach
Configure once, use with any prompt
"""

import sys
import os
import logging

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from simple_openai_handler import SimpleOpenAIHandler, OpenAIConfig, create_extraction_handler

# Configure logging
logging.basicConfig(level=logging.INFO)

def test_simple_handler():
    """Test the simple handler approach"""
    print("🧪 Testing Simple OpenAI Handler")
    print("=" * 50)
    
    # Test 1: Create handler with custom config
    print("🔧 Test 1: Custom Configuration")
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.0,
        max_tokens=100,
        timeout=60.0
    )
    handler = SimpleOpenAIHandler(config, service_name="test_custom")
    
    # Simple text prompt
    response = handler.call_api(
        prompt="What is 2+2? Reply with just the number.",
        context="math_test"
    )
    
    print(f"✅ Custom config test: {response['success']}")
    print(f"📝 Response: {response['content']}")
    print(f"📊 Tokens: {response['tokens_used']}")
    
    # Test 2: Factory method
    print("\n🏭 Test 2: Factory Method")
    extraction_handler = create_extraction_handler("test_extraction")
    
    # Test with a simple base64 image
    test_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9aIGzKwAAAABJRU5ErkJggg=="
    
    invoice_prompt = """
Look at this image and describe what you see.
Return JSON: {"description": "what you see"}
"""
    
    response = extraction_handler.call_api(
        prompt=invoice_prompt,
        image_base64=test_image,
        context="image_test"
    )
    
    print(f"✅ Factory method test: {response['success']}")
    print(f"📝 Response: {response['content'][:100]}...")
    print(f"📊 Tokens: {response['tokens_used']}")
    
    return response['success']

def test_data_extractor_pattern():
    """Test the pattern used in data-extractor"""
    print("\n🔬 Test 3: Data Extractor Pattern")
    print("=" * 50)
    
    # Create handler like data-extractor does
    handler = create_extraction_handler("data-extractor-test")
    
    # Define prompts (like data-extractor does)
    header_prompt = """
Extract header information from this invoice.
Return JSON: {"vendor_name": "", "total_amount": 0}
"""
    
    line_items_prompt = """
Extract line items from this invoice.
Return JSON: {"line_items": []}
"""
    
    # Test image
    test_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9aIGzKwAAAABJRU5ErkJggg=="
    
    # Stage 1A: Header extraction
    header_result = handler.call_api(
        prompt=header_prompt,
        image_base64=test_image,
        context="Header_test001"
    )
    
    # Stage 1B: Line items extraction
    items_result = handler.call_api(
        prompt=line_items_prompt,
        image_base64=test_image,
        context="LineItems_test001"
    )
    
    print(f"📋 Header extraction: {header_result['success']}")
    print(f"📦 Line items extraction: {items_result['success']}")
    
    if header_result['success'] and items_result['success']:
        total_tokens = header_result['tokens_used'] + items_result['tokens_used']
        print(f"📊 Total tokens used: {total_tokens}")
    
    return header_result['success'] and items_result['success']

if __name__ == "__main__":
    print("🚀 Simple OpenAI Handler Tests")
    print("Input → OpenAI API → Response Content")
    print("")
    
    test1 = test_simple_handler()
    test2 = test_data_extractor_pattern()
    
    print("\n" + "=" * 50)
    print("📊 Results Summary:")
    print(f"  Simple Handler: {'✅ PASS' if test1 else '❌ FAIL'}")
    print(f"  Data Extractor Pattern: {'✅ PASS' if test2 else '❌ FAIL'}")
    
    if test1 and test2:
        print("\n🎉 SUCCESS: Simple handler approach is working!")
        print("💡 Benefits:")
        print("  • Configure once (model, temperature, tokens)")
        print("  • Pass any prompt at runtime") 
        print("  • Get raw response content for processing")
        print("  • Simple API: input → OpenAI → response")
        print("  • Reusable across all services")
    else:
        print("\n⚠️ Some tests failed - check logs above")
    
    print("\n🔧 Usage in services:")
    print("  1. Create handler with config")
    print("  2. Define prompts as variables")
    print("  3. Call handler.call_api(prompt, image, context)")
    print("  4. Process the response content")