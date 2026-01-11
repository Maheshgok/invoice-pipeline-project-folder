"""
Real Invoice Test with Uploaded Image
Tests the shared OpenAI handler with an actual tax invoice
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

def image_to_base64(image_path: str) -> str:
    """Convert image to base64 string"""
    try:
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return encoded_string
    except Exception as e:
        print(f"❌ Error converting image to base64: {str(e)}")
        return None

def test_real_invoice_extraction(image_path: str):
    """Test invoice extraction with real invoice image"""
    print("📄 Testing Real Invoice Extraction...")
    print("=" * 60)
    
    # Convert image to base64
    print("🔄 Converting image to base64...")
    image_b64 = image_to_base64(image_path)
    
    if not image_b64:
        print("❌ Failed to convert image")
        return False
    
    print(f"✅ Image converted (size: {len(image_b64)} characters)")
    
    # Initialize handler
    handler = OpenAIHandler(service_name="real_invoice_test")
    
    print("\n" + "="*60)
    print("📋 STAGE 1A: Header Extraction")
    print("="*60)
    
    # Test header extraction
    header_response = handler.extract_invoice_header(image_b64, "real_test_001")
    
    if header_response.success:
        print("✅ Header extraction successful!")
        print(f"📊 Tokens used: {header_response.tokens_used}")
        print("\n🎯 Extracted Header Data:")
        print("-" * 40)
        
        if header_response.data:
            for key, value in header_response.data.items():
                print(f"  {key}: {value}")
        else:
            print("  No structured data returned")
            
        if header_response.raw_response:
            print(f"\n📝 Raw Response:\n{header_response.raw_response}")
            
    else:
        print("❌ Header extraction failed!")
        print(f"🔍 Error: {header_response.error}")
        if header_response.raw_response:
            print(f"📝 Raw Response: {header_response.raw_response}")
    
    print("\n" + "="*60) 
    print("📦 STAGE 1B: Line Items Extraction")
    print("="*60)
    
    # Test line items extraction
    line_items_response = handler.extract_invoice_line_items(image_b64, "real_test_001")
    
    if line_items_response.success:
        print("✅ Line items extraction successful!")
        print(f"📊 Tokens used: {line_items_response.tokens_used}")
        
        if line_items_response.data and 'line_items' in line_items_response.data:
            line_items = line_items_response.data['line_items']
            print(f"\n🎯 Extracted {len(line_items)} Line Items:")
            print("-" * 40)
            
            for i, item in enumerate(line_items, 1):
                print(f"\n  Item {i}:")
                for key, value in item.items():
                    print(f"    {key}: {value}")
        else:
            print("  No line items data returned")
            
        if line_items_response.raw_response:
            print(f"\n📝 Raw Response:\n{line_items_response.raw_response}")
            
    else:
        print("❌ Line items extraction failed!")
        print(f"🔍 Error: {line_items_response.error}")
        if line_items_response.raw_response:
            print(f"📝 Raw Response: {line_items_response.raw_response}")
    
    # Summary
    print("\n" + "="*60)
    print("📊 EXTRACTION SUMMARY")
    print("="*60)
    
    header_success = header_response.success
    line_items_success = line_items_response.success
    
    print(f"Header Extraction: {'✅ SUCCESS' if header_success else '❌ FAILED'}")
    print(f"Line Items Extraction: {'✅ SUCCESS' if line_items_success else '❌ FAILED'}")
    
    if header_success and line_items_success:
        total_tokens = (header_response.tokens_used or 0) + (line_items_response.tokens_used or 0)
        print(f"Total Tokens Used: {total_tokens}")
        print("\n🎉 Real invoice extraction completed successfully!")
        return True
    else:
        print("\n⚠️ Some extractions failed, but API connection is working!")
        return False

if __name__ == "__main__":
    print("🚀 Real Invoice Extraction Test")
    print("Testing with uploaded tax invoice image")
    
    # You'll need to save the uploaded image and provide the path
    # For now, I'll check common locations
    possible_paths = [
        "invoice_sample.png",
        "test_invoice.png", 
        "uploaded_invoice.png",
        "invoice.png"
    ]
    
    image_path = None
    for path in possible_paths:
        if os.path.exists(path):
            image_path = path
            break
    
    if not image_path:
        print("❌ Please save the uploaded invoice image as 'test_invoice.png' in the current directory")
        print("📁 Current directory:", os.getcwd())
    else:
        print(f"📁 Using image: {image_path}")
        success = test_real_invoice_extraction(image_path)
        
        if success:
            print("\n✅ The shared OpenAI handler is working perfectly with real invoice data!")
        else:
            print("\n⚠️ Check the detailed logs above for any issues.")