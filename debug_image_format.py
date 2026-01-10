"""
Test different image formats and sizes with OpenAI Vision API
Debug the image format issues
"""

import sys
import os
import base64
import logging

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from simple_openai_handler import create_extraction_handler

logging.basicConfig(level=logging.INFO)

def create_test_images():
    """Create different test images to see what works"""
    
    # 1. Larger PNG (3x3 pixels, red square)
    larger_png = """iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAAySURBVAiZY/z//z8DAwMDIyMjAzYwiqmBgYGBkZGBgYGRkYGBkZGBgYGRkYGBkZGBgQEAHgAHAGm7HBUAAAAASUVORK5CYII="""
    
    # 2. JPEG equivalent (small test JPEG)
    small_jpeg = """/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="""
    
    return {
        "tiny_png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9aIGzKwAAAABJRU5ErkJggg==",
        "larger_png": larger_png,
        "small_jpeg": small_jpeg
    }

def test_image_format_detection(image_data, name):
    """Test what format OpenAI thinks our image is"""
    print(f"\n🔍 Testing {name}:")
    
    try:
        # Decode and check the first bytes
        decoded = base64.b64decode(image_data)
        print(f"  📏 Size: {len(decoded)} bytes")
        
        # Check magic numbers
        if decoded.startswith(b'\x89PNG'):
            print("  🖼️ Format: PNG (detected by magic number)")
        elif decoded.startswith(b'\xFF\xD8\xFF'):
            print("  🖼️ Format: JPEG (detected by magic number)")
        else:
            print(f"  ❓ Format: Unknown (starts with {decoded[:4]})")
            
    except Exception as e:
        print(f"  ❌ Error decoding: {e}")

def test_image_with_proper_mime_type():
    """Test with proper MIME type detection"""
    
    handler = create_extraction_handler("mime_test")
    test_images = create_test_images()
    
    # Test each image format
    for name, image_data in test_images.items():
        print(f"\n🧪 Testing {name} with OpenAI API:")
        test_image_format_detection(image_data, name)
        
        # Detect format from magic numbers
        try:
            decoded = base64.b64decode(image_data)
            if decoded.startswith(b'\x89PNG'):
                mime_type = 'image/png'
            elif decoded.startswith(b'\xFF\xD8\xFF'):
                mime_type = 'image/jpeg'
            else:
                mime_type = 'image/png'  # Default
            
            print(f"  🎯 Using MIME type: {mime_type}")
            
        except Exception as e:
            print(f"  ⚠️ Format detection failed: {e}")
            continue

def test_with_corrected_handler():
    """Test with corrected image format handling"""
    
    print("\n🔧 Testing with format-aware handler:")
    
    # Create a corrected handler call
    handler = create_extraction_handler("format_test")
    
    # Test with the larger PNG
    test_images = create_test_images()
    larger_png = test_images['larger_png']
    
    # Manual test: modify the call_api method temporarily to use PNG
    import json
    from simple_openai_handler import OpenAI
    
    # Create a test that manually sets the MIME type
    client = OpenAI(api_key=handler.api_key)
    
    try:
        print("  📤 Sending request with proper PNG MIME type...")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this image briefly."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{larger_png}"  # Use PNG MIME type
                        }
                    }
                ]
            }],
            temperature=0.1,
            max_tokens=50
        )
        
        content = response.choices[0].message.content
        tokens = response.usage.total_tokens
        
        print(f"  ✅ Success with PNG!")
        print(f"  📝 Response: {content}")
        print(f"  📊 Tokens: {tokens}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Failed with PNG: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Image Format Investigation")
    print("Debugging OpenAI Vision API image support")
    print("=" * 60)
    
    # Test 1: Analyze our test images
    test_images = create_test_images()
    for name, data in test_images.items():
        test_image_format_detection(data, name)
    
    # Test 2: Try with proper MIME types
    print("\n" + "=" * 60)
    success = test_with_corrected_handler()
    
    print("\n" + "=" * 60)
    print("📊 DIAGNOSIS:")
    
    if success:
        print("✅ PNG format works fine!")
        print("🔧 Issue was likely:")
        print("  • Image too small (1x1 pixel)")
        print("  • Wrong MIME type in data URL")
    else:
        print("❌ PNG format issues detected")
        print("🔧 Possible fixes:")
        print("  • Use larger images (minimum 3x3 pixels)")
        print("  • Ensure proper MIME type (image/png vs image/jpeg)")
        print("  • Try JPEG format instead")
        
    print("\n💡 RECOMMENDED FIX:")
    print("  1. Auto-detect image format from base64 data")
    print("  2. Use correct MIME type in data URL")
    print("  3. Ensure minimum image size for OpenAI Vision API")