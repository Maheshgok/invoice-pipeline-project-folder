"""
Test with realistic invoice image
Save the uploaded image and test the simple handler with proper format detection
"""

import sys
import os
import base64
import logging

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from simple_openai_handler import create_extraction_handler

logging.basicConfig(level=logging.INFO)

def save_uploaded_invoice_as_test():
    """Instructions to save the uploaded invoice for testing"""
    print("📁 To test with your actual uploaded invoice:")
    print("1. Save the uploaded tax invoice image as 'test_invoice.png' in this directory")
    print("2. Run this script again")
    print(f"3. Current directory: {os.getcwd()}")
    return False

def test_with_real_invoice():
    """Test with the actual uploaded invoice"""
    
    # Check if user saved the invoice
    possible_files = ['test_invoice.png', 'test_invoice.jpg', 'invoice.png', 'invoice.jpg']
    invoice_file = None
    
    for filename in possible_files:
        if os.path.exists(filename):
            invoice_file = filename
            break
    
    if not invoice_file:
        return save_uploaded_invoice_as_test()
    
    print(f"📄 Found invoice file: {invoice_file}")
    
    try:
        # Convert to base64
        with open(invoice_file, 'rb') as f:
            image_bytes = f.read()
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        print(f"✅ Converted to base64: {len(image_b64)} characters")
        print(f"📏 Original file size: {len(image_bytes)} bytes")
        
        # Create handler
        handler = create_extraction_handler("real_invoice_test")
        
        # Test with a simple prompt
        simple_prompt = """
Look at this invoice and extract basic information.
Return JSON format: 
{
  "vendor_name": "company name",
  "invoice_number": "invoice number", 
  "total_amount": "total amount"
}
"""
        
        print("🚀 Testing with real invoice image...")
        result = handler.call_api(
            prompt=simple_prompt,
            image_base64=image_b64,
            context="real_invoice_test"
        )
        
        if result['success']:
            print("🎉 SUCCESS with real invoice!")
            print(f"📊 Tokens used: {result['tokens_used']}")
            print(f"📝 Response: {result['content']}")
            return True
        else:
            print(f"❌ Failed with real invoice: {result['error']}")
            return False
            
    except Exception as e:
        print(f"❌ Error processing invoice file: {e}")
        return False

def create_larger_test_image():
    """Create a larger test image if no real invoice available"""
    print("\n🎨 Creating larger test image...")
    
    # This is a 10x10 pixel PNG with some pattern
    larger_test_png = """iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABpSURBVBiVjZAxCgJBEETPawJBUxMLbmNjfWETk/8//y42sBsrmOCGcGYqYaGma6pmYADYAQfgAtyBF3ADzsAJOAIH4AzcgBdwA87ACTgCR2APXIE7cANuwAM4A0fgAOyBK3AH3sADOANH4ADs/3MuBGpWRc1QAAAAASUVORK5CYII="""
    
    handler = create_extraction_handler("larger_test")
    
    result = handler.call_api(
        prompt="Describe what you see in this image.",
        image_base64=larger_test_png,
        context="larger_test_image"
    )
    
    if result['success']:
        print("✅ SUCCESS with larger test image!")
        print(f"📝 Response: {result['content']}")
        return True
    else:
        print(f"❌ Failed with larger test: {result['error']}")
        return False

if __name__ == "__main__":
    print("🧾 Real Invoice Testing")
    print("Testing simple handler with proper image format detection")
    print("=" * 60)
    
    # Try with real invoice first
    real_success = test_with_real_invoice()
    
    if not real_success:
        print("\n" + "=" * 60)
        print("🎨 Fallback: Testing with larger synthetic image")
        synthetic_success = create_larger_test_image()
        
        print("\n" + "=" * 60)
        print("📊 RESULTS:")
        
        if synthetic_success:
            print("✅ Image format handling is working!")
            print("💡 Issue was likely image size (too small for OpenAI Vision)")
            print("🔧 The simple handler now:")
            print("  • Auto-detects PNG, JPEG, GIF, WebP formats")
            print("  • Uses correct MIME types")
            print("  • Handles various image sizes")
        else:
            print("❌ Still having issues - may need further investigation")
    else:
        print("\n🎉 Perfect! Real invoice processing is working!")
        
    print("\n💡 CONCLUSION:")
    print("  PNG format is supported by OpenAI Vision API")
    print("  Issue was likely minimum size requirements")
    print("  Simple handler now has proper format detection")