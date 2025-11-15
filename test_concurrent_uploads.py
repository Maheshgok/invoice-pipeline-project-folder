#!/usr/bin/env python3
"""
Test script to simulate multiple simultaneous uploads to initial-api
This will help identify if the issue is with concurrent upload handling
"""

import asyncio
import aiohttp
import json
import time
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
INITIAL_API_URL = "https://initial-api-545188726513.asia-south1.run.app"
QUEUE_PROCESSOR_URL = "https://queue-processor-545188726513.asia-south1.run.app"
TEST_GOOGLE_TOKEN = "fake-token-for-testing"  # We'll test without real auth first

async def test_single_upload(session, file_index, delay=0):
    """Test a single file upload"""
    if delay > 0:
        await asyncio.sleep(delay)
    
    start_time = time.time()
    upload_id = f"test_upload_{file_index}_{int(start_time)}"
    
    try:
        # Create a fake file data (simulating multipart form data)
        fake_file_content = f"fake_invoice_content_{file_index}".encode()
        
        # Create form data
        data = aiohttp.FormData()
        data.add_field('file', 
                      fake_file_content,
                      filename=f'test_invoice_{file_index}.jpg',
                      content_type='image/jpeg')
        
        headers = {
            'Authorization': f'Bearer {TEST_GOOGLE_TOKEN}'
        }
        
        logger.info(f"🚀 Starting upload {file_index}")
        
        async with session.post(
            f"{INITIAL_API_URL}/upload_invoice",
            data=data,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30)
        ) as response:
            
            end_time = time.time()
            duration = end_time - start_time
            
            response_text = await response.text()
            
            result = {
                'upload_id': upload_id,
                'file_index': file_index,
                'status_code': response.status,
                'duration_seconds': round(duration, 2),
                'success': response.status in [200, 201],
                'response_size': len(response_text),
                'timestamp': datetime.now().isoformat()
            }
            
            if response.status in [200, 201]:
                try:
                    response_json = json.loads(response_text)
                    result['job_id'] = response_json.get('job_id', 'unknown')
                    result['bucket_path'] = response_json.get('bucket_path', 'unknown')
                    logger.info(f"✅ Upload {file_index} succeeded: {result['job_id']} ({duration:.2f}s)")
                except json.JSONDecodeError:
                    logger.warning(f"⚠️ Upload {file_index} success but invalid JSON response")
            else:
                logger.error(f"❌ Upload {file_index} failed: {response.status} - {response_text[:200]}")
                result['error_message'] = response_text[:500]
            
            return result
            
    except asyncio.TimeoutError:
        logger.error(f"⏰ Upload {file_index} timed out after 30 seconds")
        return {
            'upload_id': upload_id,
            'file_index': file_index,
            'status_code': 0,
            'duration_seconds': 30,
            'success': False,
            'error_message': 'Timeout after 30 seconds',
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"💥 Upload {file_index} exception: {str(e)}")
        return {
            'upload_id': upload_id,
            'file_index': file_index,
            'status_code': 0,
            'duration_seconds': time.time() - start_time,
            'success': False,
            'error_message': str(e),
            'timestamp': datetime.now().isoformat()
        }

async def test_health_endpoint(session):
    """Test the health endpoint"""
    try:
        async with session.get(f"{INITIAL_API_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as response:
            health_data = await response.text()
            logger.info(f"🏥 Health check: {response.status} - {health_data}")
            return response.status == 200
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return False

async def run_concurrent_upload_test(num_uploads=5, batch_delay=0.5):
    """Run concurrent upload test"""
    logger.info(f"🧪 Starting concurrent upload test with {num_uploads} uploads")
    
    async with aiohttp.ClientSession() as session:
        # First test health
        logger.info("🏥 Testing health endpoint...")
        health_ok = await test_health_endpoint(session)
        if not health_ok:
            logger.error("❌ Health check failed - aborting test")
            return
        
        # Test single upload first
        logger.info("🔍 Testing single upload...")
        single_result = await test_single_upload(session, 0)
        if not single_result['success']:
            logger.error(f"❌ Single upload failed: {single_result.get('error_message', 'Unknown error')}")
            logger.info("Continuing with concurrent test to see if it's an auth issue...")
        
        # Run concurrent uploads
        logger.info(f"🚀 Starting {num_uploads} concurrent uploads...")
        start_time = time.time()
        
        # Create tasks for concurrent uploads
        tasks = []
        for i in range(1, num_uploads + 1):
            delay = i * batch_delay  # Stagger uploads slightly
            task = test_single_upload(session, i, delay)
            tasks.append(task)
        
        # Wait for all uploads to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        total_time = time.time() - start_time
        
        # Analyze results
        successful_uploads = []
        failed_uploads = []
        exceptions = []
        
        for result in results:
            if isinstance(result, Exception):
                exceptions.append(str(result))
            elif result.get('success', False):
                successful_uploads.append(result)
            else:
                failed_uploads.append(result)
        
        # Print summary
        logger.info("=" * 60)
        logger.info("📊 CONCURRENT UPLOAD TEST RESULTS")
        logger.info("=" * 60)
        logger.info(f"Total uploads attempted: {num_uploads}")
        logger.info(f"Successful uploads: {len(successful_uploads)}")
        logger.info(f"Failed uploads: {len(failed_uploads)}")
        logger.info(f"Exceptions: {len(exceptions)}")
        logger.info(f"Total test time: {total_time:.2f} seconds")
        
        if successful_uploads:
            durations = [r['duration_seconds'] for r in successful_uploads]
            logger.info(f"Average upload time: {sum(durations)/len(durations):.2f} seconds")
            logger.info(f"Fastest upload: {min(durations):.2f} seconds")
            logger.info(f"Slowest upload: {max(durations):.2f} seconds")
        
        # Show failed uploads
        if failed_uploads:
            logger.info("\n❌ Failed uploads:")
            for failure in failed_uploads:
                logger.info(f"  Upload {failure['file_index']}: {failure.get('error_message', 'Unknown error')}")
        
        # Show exceptions
        if exceptions:
            logger.info("\n💥 Exceptions:")
            for exc in exceptions:
                logger.info(f"  {exc}")
        
        # Test queue processor health
        logger.info("\n🔍 Testing queue processor health...")
        try:
            async with session.get(f"{QUEUE_PROCESSOR_URL}/health", timeout=aiohttp.ClientTimeout(total=10)) as response:
                queue_health = await response.text()
                logger.info(f"🏥 Queue processor health: {response.status} - {queue_health}")
        except Exception as e:
            logger.error(f"❌ Queue processor health check failed: {e}")
        
        return {
            'total_uploads': num_uploads,
            'successful': len(successful_uploads),
            'failed': len(failed_uploads),
            'exceptions': len(exceptions),
            'total_time': total_time,
            'success_rate': len(successful_uploads) / num_uploads * 100
        }

async def main():
    """Main test function"""
    logger.info("🧪 Initial API Concurrent Upload Test")
    logger.info("=" * 60)
    
    # Test scenarios
    scenarios = [
        {'uploads': 2, 'delay': 0.1, 'name': '2 uploads (0.1s delay)'},
        {'uploads': 5, 'delay': 0.2, 'name': '5 uploads (0.2s delay)'},
        {'uploads': 5, 'delay': 0, 'name': '5 uploads (simultaneous)'},
    ]
    
    all_results = []
    
    for scenario in scenarios:
        logger.info(f"\n🎯 Testing scenario: {scenario['name']}")
        result = await run_concurrent_upload_test(
            num_uploads=scenario['uploads'],
            batch_delay=scenario['delay']
        )
        result['scenario'] = scenario['name']
        all_results.append(result)
        
        # Wait between scenarios
        logger.info("⏳ Waiting 10 seconds before next scenario...")
        await asyncio.sleep(10)
    
    # Final summary
    logger.info("\n" + "=" * 60)
    logger.info("📈 FINAL TEST SUMMARY")
    logger.info("=" * 60)
    
    for result in all_results:
        logger.info(f"{result['scenario']}: {result['successful']}/{result['total_uploads']} "
                   f"({result['success_rate']:.1f}%) in {result['total_time']:.2f}s")

if __name__ == "__main__":
    asyncio.run(main())