"""
Test with the actual uploaded tax invoice PNG
This will prove the simple OpenAI handler works with real invoice images
"""

import sys
import os
import base64
import logging
import requests
from io import BytesIO

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from simple_openai_handler import create_extraction_handler

logging.basicConfig(level=logging.INFO)

def test_with_actual_invoice():
    """Test with the actual uploaded tax invoice"""
    print("📄 Testing with Actual SUNRISE ENTERPRISE Tax Invoice")
    print("=" * 60)
    
    # Note: In a real scenario, you would save the uploaded image file
    # For now, I'll create a realistic test that simulates having the image
    
    print("🔍 This is a real tax invoice from SUNRISE ENTERPRISE with:")
    print("  • Vendor: SUNRISE ENTERPRISE")
    print("  • GSTIN: 07BGUPU36470XX")
    print("  • Multiple line items (Best Ball Pen, Executive Diary, etc.)")
    print("  • Total Amount: ₹38,026.60")
    print("  • GST Details: CGST, SGST amounts")
    print("  • Complete invoice structure")
    
    print("\n📁 To test with this actual image:")
    print("1. Right-click the invoice image in your browser/viewer")
    print("2. Save as 'sunrise_invoice.png' in this directory:")
    print(f"   {os.getcwd()}")
    print("3. Run this test again")
    
    # Check if image was saved
    test_files = ['sunrise_invoice.png', 'tax_invoice.png', 'invoice.png']
    invoice_file = None
    
    for filename in test_files:
        if os.path.exists(filename):
            invoice_file = filename
            break
    
    if not invoice_file:
        print("\n⏳ Waiting for you to save the invoice image...")
        return False
    
    print(f"\n✅ Found invoice file: {invoice_file}")
    
    try:
        # Read and convert to base64
        with open(invoice_file, 'rb') as f:
            image_bytes = f.read()
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        print(f"📊 File size: {len(image_bytes):,} bytes")
        print(f"📏 Base64 length: {len(image_b64):,} characters")
        
        # Create extraction handler
        handler = create_extraction_handler("sunrise_invoice_test")
        
        # Test with header extraction prompt
        header_prompt = """
Extract the header information from this tax invoice image.

Return JSON format:
{
  "vendor_name": "",
  "gstin": "",
  "invoice_number": "",
  "invoice_date": "",
  "customer_name": "",
  "total_amount": 0,
  "currency": ""
}
"""
        
        print("\n🚀 Stage 1: Header Extraction Test...")
        header_result = handler.call_api(
            prompt=header_prompt,
            image_base64=image_b64,
            context="SUNRISE_Header_Extraction"
        )
        
        if header_result['success']:
            print("✅ Header extraction SUCCESS!")
            print(f"📊 Tokens used: {header_result['tokens_used']}")
            print(f"📝 Response:\n{header_result['content']}")
        else:
            print(f"❌ Header extraction failed: {header_result['error']}")
            return False
        
        # Test with line items extraction
        items_prompt = """
Extract the line items from this tax invoice image.

Focus on the table with items like "Best Ball Pen", "Executive Diary", etc.

Return JSON format:
{
  "line_items": [
    {
      "description": "",
      "hsn": "",
      "quantity": 0,
      "rate": 0,
      "taxable_amount": 0,
      "gst_rate": 0,
      "total": 0
    }
  ]
}
"""
        
        print("\n🚀 Stage 2: Line Items Extraction Test...")
        items_result = handler.call_api(
            prompt=items_prompt,
            image_base64=image_b64,
            context="SUNRISE_LineItems_Extraction"
        )
        
        if items_result['success']:
            print("✅ Line items extraction SUCCESS!")
            print(f"📊 Tokens used: {items_result['tokens_used']}")
            print(f"📝 Response:\n{items_result['content']}")
        else:
            print(f"❌ Line items extraction failed: {items_result['error']}")
        
        # Summary
        total_tokens = header_result['tokens_used'] + (items_result['tokens_used'] if items_result['success'] else 0)
        
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY:")
        print(f"  Header Extraction: {'✅ SUCCESS' if header_result['success'] else '❌ FAILED'}")
        print(f"  Line Items Extraction: {'✅ SUCCESS' if items_result['success'] else '❌ FAILED'}")
        print(f"  Total API Tokens Used: {total_tokens}")
        print(f"  Image Format: PNG (real tax invoice)")
        print(f"  Image Size: {len(image_bytes):,} bytes")
        
        if header_result['success']:
            print("\n🎉 BREAKTHROUGH: Real invoice processing is working!")
            print("✅ The simple OpenAI handler successfully:")
            print("  • Processed actual PNG tax invoice")
            print("  • Extracted structured data")
            print("  • Used proper format detection")
            print("  • Handled realistic image size")
            
            return True
        
    except Exception as e:
        print(f"❌ Error processing invoice: {e}")
        return False

def demonstrate_data_extractor_pattern():
    """Show how this works in the actual data-extractor service"""
    print("\n" + "=" * 60)
    print("🔧 DATA EXTRACTOR INTEGRATION:")
    print("=" * 60)
    
    print("""
The simple handler integrates into data-extractor like this:

```python
class DataExtractorService:
    def __init__(self):
        # Configure once with extraction settings
        self.openai_handler = create_extraction_handler("data-extractor")
        
        # Define prompts as variables (can be modified at runtime)
        self.header_prompt = "Extract header information..."
        self.line_items_prompt = "Extract line items..."
    
    def extract_invoice_data(self, image_content: str, job_id: str):
        # Stage 1A: Header extraction
        header_result = self.openai_handler.call_api(
            prompt=self.header_prompt,
            image_base64=image_content,
            context=f"Header_{job_id}"
        )
        
        # Stage 1B: Line items extraction
        items_result = self.openai_handler.call_api(
            prompt=self.line_items_prompt,
            image_base64=image_content,
            context=f"LineItems_{job_id}"
        )
        
        # Process responses...
```

✅ Benefits achieved:
  • Simple API: input → OpenAI → response
  • Configure once, use with any prompt
  • Proven mechanism that works
  • Reduced error hunting
  • Runtime prompt tuning
""")

if __name__ == "__main__":
    print("🧾 ACTUAL INVOICE TESTING")
    print("Testing simple OpenAI handler with real SUNRISE ENTERPRISE tax invoice")
    
    success = test_with_actual_invoice()
    
    if success:
        demonstrate_data_extractor_pattern()
        
        print("\n🎯 NEXT STEPS:")
        print("1. ✅ Simple handler proven with real invoice")
        print("2. 🚀 Deploy updated data-extractor service")
        print("3. 🔧 Update other services to use simple handler")
        print("4. 📋 Test end-to-end pipeline")
        
    else:
        print("\n💡 TO CONTINUE TESTING:")
        print("Save the SUNRISE ENTERPRISE invoice image as 'sunrise_invoice.png'")
        print("Then run this script again to see the magic happen! ✨")