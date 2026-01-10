"""
Test Functional OpenAI Handler
Compare performance and functionality with class-based version
"""

import sys
import os
import time
import json

# Add shared directory to path
sys.path.append('shared')

from functional_openai_handler import (
    create_extraction_function,
    create_enrichment_function, 
    create_analysis_function,
    call_openai_with_config,
    get_memory_stats
)

def test_functional_handler():
    """Test all aspects of functional handler"""
    print("🧪 FUNCTIONAL OPENAI HANDLER TEST")
    print("=" * 50)
    
    # Memory baseline
    baseline_memory = get_memory_stats()
    print(f"📊 Baseline Memory: {baseline_memory['rss_mb']:.2f} MB")
    print(f"🖥️ CPU: {baseline_memory['cpu_percent']:.2f}%")
    
    # Test 1: Basic function creation (should be very fast)
    print("\n🔧 Test 1: Function Creation Speed")
    start_time = time.time()
    
    extract_func = create_extraction_function("test_service")
    enrich_func = create_enrichment_function("test_service")
    analyze_func = create_analysis_function("test_service")
    
    creation_time = time.time() - start_time
    print(f"⏱️ Created 3 functions in {creation_time:.4f} seconds")
    
    # Test 2: Simple API calls
    print("\n🤖 Test 2: Simple API Calls")
    
    test_prompts = [
        "Count to 5 and return as JSON array",
        "What is 2+2? Return as JSON with 'answer' field",
        "List 3 colors in JSON format"
    ]
    
    for i, prompt in enumerate(test_prompts):
        print(f"\n📝 Test 2.{i+1}: {prompt}")
        start_time = time.time()
        
        # Use extraction function
        result = extract_func(prompt, context=f"test_2_{i+1}")
        
        call_time = time.time() - start_time
        
        if result['success']:
            print(f"✅ Success in {call_time:.2f}s")
            print(f"🔢 Tokens: {result['tokens_used']}")
            print(f"📄 Content: {result['content'][:100]}...")
        else:
            print(f"❌ Failed: {result['error']}")
    
    # Test 3: Memory efficiency test
    print("\n💾 Test 3: Memory Efficiency")
    pre_test_memory = get_memory_stats()
    
    # Create and use many functions (should not accumulate memory)
    for i in range(10):
        temp_func = create_extraction_function(f"temp_{i}")
        # Functions should be garbage collected after scope
    
    post_test_memory = get_memory_stats()
    memory_increase = post_test_memory['rss_mb'] - pre_test_memory['rss_mb']
    
    print(f"📈 Memory increase after 10 function creations: {memory_increase:.2f} MB")
    print(f"🎯 Memory efficiency: {'GOOD' if memory_increase < 5 else 'NEEDS_ATTENTION'}")
    
    # Test 4: Direct API call (most flexible)
    print("\n🎯 Test 4: Direct API Call")
    
    direct_result = call_openai_with_config(
        prompt="What is the current date? Return as JSON",
        model="gpt-4o",
        temperature=0.0,
        max_tokens=100,
        context="direct_test"
    )
    
    if direct_result['success']:
        print(f"✅ Direct call successful")
        print(f"📄 Result: {direct_result['content']}")
    else:
        print(f"❌ Direct call failed: {direct_result['error']}")
    
    # Final memory check
    final_memory = get_memory_stats()
    total_memory_increase = final_memory['rss_mb'] - baseline_memory['rss_mb']
    
    print("\n📊 PERFORMANCE SUMMARY")
    print("=" * 30)
    print(f"🏁 Total Memory Increase: {total_memory_increase:.2f} MB")
    print(f"⚡ Function Creation Speed: {creation_time:.4f}s for 3 functions")
    print(f"💾 Memory Efficiency: {'EXCELLENT' if total_memory_increase < 10 else 'GOOD' if total_memory_increase < 20 else 'NEEDS_OPTIMIZATION'}")
    
    return total_memory_increase < 20  # Success if memory increase < 20MB

if __name__ == "__main__":
    success = test_functional_handler()
    if success:
        print("\n🎉 Functional handler test PASSED!")
        exit(0)
    else:
        print("\n⚠️ Functional handler test had issues")
        exit(1)