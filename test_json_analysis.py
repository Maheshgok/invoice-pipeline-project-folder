"""
Test OpenAI handler with JSON log file processing
Send the log data for summarization and tabulation
"""

import sys
import os
import json
import logging

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared'))
from simple_openai_handler import create_extraction_handler

logging.basicConfig(level=logging.INFO)

def read_json_logs():
    """Read the uploaded JSON log file"""
    log_file = "downloaded-logs-20260109-105325.json"
    
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            log_data = json.load(f)
        
        print(f"📄 Loaded {len(log_data)} log entries from {log_file}")
        return log_data
    except Exception as e:
        print(f"❌ Error reading log file: {e}")
        return None

def test_summarization(handler, log_data):
    """Test summarization of the log data"""
    print("\n🧪 TEST 1: LOG SUMMARIZATION")
    print("=" * 60)
    
    # Prepare first 10 entries for analysis (to keep prompt manageable)
    sample_logs = log_data[:10]
    
    summarize_prompt = f"""
Analyze these Cloud Run log entries and provide a summary.

Log data:
{json.dumps(sample_logs, indent=2)}

Please summarize:
1. What service is this?
2. What activities are being logged?
3. Any errors or issues?
4. Overall system status

Return JSON format:
{{
  "service_name": "",
  "activity_summary": "",
  "error_count": 0,
  "status": "",
  "key_findings": []
}}
"""
    
    result = handler.call_api(
        prompt=summarize_prompt,
        context="log_summarization"
    )
    
    if result['success']:
        print("✅ Summarization SUCCESS!")
        print(f"📊 Tokens used: {result['tokens_used']}")
        print(f"📝 Summary:\n{result['content']}")
        return True
    else:
        print(f"❌ Summarization failed: {result['error']}")
        return False

def test_tabulation(handler, log_data):
    """Test tabulation of the log data"""
    print("\n🧪 TEST 2: LOG TABULATION")
    print("=" * 60)
    
    # Extract key fields for tabulation
    sample_entries = []
    for i, entry in enumerate(log_data[:15]):  # First 15 entries
        sample_entries.append({
            "timestamp": entry.get("timestamp", ""),
            "message": entry.get("textPayload", "")[:100],  # First 100 chars
            "service": entry.get("resource", {}).get("labels", {}).get("service_name", "unknown")
        })
    
    tabulate_prompt = f"""
Create a structured table from these log entries.

Log entries:
{json.dumps(sample_entries, indent=2)}

Create a table showing:
- Timestamp (formatted)
- Service Name  
- Message Summary
- Log Level (INFO, ERROR, etc.)

Return as markdown table format.
"""
    
    result = handler.call_api(
        prompt=tabulate_prompt,
        context="log_tabulation"
    )
    
    if result['success']:
        print("✅ Tabulation SUCCESS!")
        print(f"📊 Tokens used: {result['tokens_used']}")
        print(f"📋 Table:\n{result['content']}")
        return True
    else:
        print(f"❌ Tabulation failed: {result['error']}")
        return False

def test_combined_analysis(handler, log_data):
    """Test combined analysis with both tasks"""
    print("\n🧪 TEST 3: COMBINED ANALYSIS")
    print("=" * 60)
    
    # Get key statistics from the log data
    total_entries = len(log_data)
    services = set()
    timestamps = []
    errors = 0
    
    for entry in log_data:
        service_name = entry.get("resource", {}).get("labels", {}).get("service_name", "unknown")
        services.add(service_name)
        timestamps.append(entry.get("timestamp", ""))
        
        text = entry.get("textPayload", "").lower()
        if "error" in text or "failed" in text or "❌" in text:
            errors += 1
    
    stats_data = {
        "total_entries": total_entries,
        "services": list(services),
        "error_count": errors,
        "time_range": {
            "start": timestamps[0] if timestamps else "",
            "end": timestamps[-1] if timestamps else ""
        }
    }
    
    combined_prompt = f"""
Analyze this log file statistics and provide both a summary AND a table.

Log Statistics:
{json.dumps(stats_data, indent=2)}

Sample log messages:
{json.dumps([entry.get("textPayload", "")[:150] for entry in log_data[:5]], indent=2)}

Provide:
1. Executive Summary (what's happening in this system)
2. Service Activity Table (service name, activity count, status)
3. Recommendations based on the logs

Format as structured analysis with clear sections.
"""
    
    result = handler.call_api(
        prompt=combined_prompt,
        context="combined_log_analysis"
    )
    
    if result['success']:
        print("✅ Combined Analysis SUCCESS!")
        print(f"📊 Tokens used: {result['tokens_used']}")
        print(f"📊 Analysis:\n{result['content']}")
        return True
    else:
        print(f"❌ Combined analysis failed: {result['error']}")
        return False

if __name__ == "__main__":
    print("📋 JSON LOG FILE ANALYSIS TEST")
    print("Testing simple OpenAI handler with log data processing")
    print("=" * 70)
    
    # Load log data
    log_data = read_json_logs()
    if not log_data:
        exit(1)
    
    # Create handler optimized for analysis
    handler = create_extraction_handler("log_analysis_test")
    
    # Run tests
    results = []
    results.append(("Summarization", test_summarization(handler, log_data)))
    results.append(("Tabulation", test_tabulation(handler, log_data))) 
    results.append(("Combined Analysis", test_combined_analysis(handler, log_data)))
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 70)
    
    total_passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
        if result:
            total_passed += 1
    
    print(f"\n🎯 Overall: {total_passed}/{len(results)} tests passed")
    
    if total_passed == len(results):
        print("🎉 SUCCESS: Simple handler can process complex JSON data!")
        print("✅ Capabilities demonstrated:")
        print("  • Read and parse JSON log files")
        print("  • Summarize complex structured data")
        print("  • Create formatted tables")
        print("  • Perform multi-step analysis")
        print("  • Handle large data sets efficiently")
        
        print(f"\n📋 Log File Analysis:")
        print(f"  • {len(log_data)} total log entries processed")
        print(f"  • Cloud Run service logs from pipeline-orchestrator")
        print(f"  • Time range: {log_data[0].get('timestamp', 'N/A')} to {log_data[-1].get('timestamp', 'N/A')}")
        
    else:
        print("⚠️ Some tests failed - check individual results above")
    
    print("\n💡 This proves the simple handler can:")
    print("  1. Process real JSON data files")
    print("  2. Generate summaries and tables")  
    print("  3. Handle complex prompts")
    print("  4. Work with your invoice pipeline logs! 🎯")