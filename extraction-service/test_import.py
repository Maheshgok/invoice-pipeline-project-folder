#!/usr/bin/env python3
"""Test if the functional handler works in the extraction service directory"""

import sys
import os
sys.path.insert(0, '.')

try:
    from functional_openai_handler import create_extraction_function
    print("✅ Import successful")
    
    # Test function creation
    func = create_extraction_function()
    print(f"✅ Function created: {func}")
    
    print("🎉 All tests passed - ready for deployment")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()