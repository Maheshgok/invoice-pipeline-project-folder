#!/usr/bin/env python3
"""
Test actual OpenAI processor initialization and processing
"""
import os
import sys
import traceback

def main():
    print("🔍 Testing Actual OpenAI Processor")
    print("="*50)
    
    try:
        # Set environment variables
        os.environ['PROJECT_ID'] = 'watch-mail-trial'
        os.environ['OPENAI_API_KEY_SECRET'] = 'openai-api-key-secret'
        
        # Import and test actual processor
        from openai_processor import OpenAIProcessor
        
        print("🤖 Creating OpenAI Processor instance...")
        processor = OpenAIProcessor()
        print("✅ OpenAI Processor created successfully")
        
        # Test a simple models call using the same client
        print("📞 Testing models.list() with processor client...")
        models = processor.client.models.list()
        print(f"🎉 SUCCESS! Found {len(models.data)} models using processor client")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        print(f"❌ Error type: {type(e).__name__}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)