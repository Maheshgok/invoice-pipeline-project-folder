"""
Test script for the get_signed_url Cloud Function
"""
import os
import json
import requests
from unittest.mock import patch, MagicMock

def test_function_locally():
    """Test the function locally using Functions Framework"""
    
    # Set test environment variables
    os.environ['BUCKET_NAME'] = 'test-bucket-name'
    
    # Import the function
    from main import get_signed_url
    
    print("=== Testing Cloud Function Locally ===\n")
    
    # Test 1: OPTIONS request (CORS preflight)
    print("1. Testing OPTIONS request (CORS preflight)...")
    
    class MockRequest:
        def __init__(self, method, is_json=False, json_data=None, headers=None):
            self.method = method
            self.is_json = is_json
            self._json_data = json_data
            self.headers = headers or {}
            self.url = "http://localhost:8080"
            
        def get_json(self):
            return self._json_data
    
    # Mock OPTIONS request
    options_request = MockRequest('OPTIONS')
    
    try:
        response_body, status_code, headers = get_signed_url(options_request)
        print(f"✓ OPTIONS Status: {status_code}")
        print(f"✓ CORS Headers: {headers}")
        assert status_code == 200
        assert headers['Access-Control-Allow-Origin'] == '*'
        print("✓ OPTIONS test passed\n")
    except Exception as e:
        print(f"✗ OPTIONS test failed: {e}\n")
    
    # Test 2: Invalid method
    print("2. Testing invalid method (GET)...")
    get_request = MockRequest('GET')
    
    try:
        response_body, status_code, headers = get_signed_url(get_request)
        print(f"✓ Invalid method status: {status_code}")
        assert status_code == 400
        print("✓ Invalid method test passed\n")
    except Exception as e:
        print(f"✗ Invalid method test failed: {e}\n")
    
    # Test 3: Missing JSON body
    print("3. Testing missing JSON body...")
    post_request_no_json = MockRequest('POST', is_json=False)
    
    try:
        response_body, status_code, headers = get_signed_url(post_request_no_json)
        print(f"✓ No JSON status: {status_code}")
        assert status_code == 400
        print("✓ Missing JSON test passed\n")
    except Exception as e:
        print(f"✗ Missing JSON test failed: {e}\n")
    
    # Test 4: Missing required fields
    print("4. Testing missing required fields...")
    post_request_incomplete = MockRequest('POST', is_json=True, json_data={})
    
    try:
        response_body, status_code, headers = get_signed_url(post_request_incomplete)
        print(f"✓ Incomplete data status: {status_code}")
        assert status_code == 400
        print("✓ Missing fields test passed\n")
    except Exception as e:
        print(f"✗ Missing fields test failed: {e}\n")
    
    # Test 5: Invalid content type
    print("5. Testing invalid content type...")
    post_request_invalid_content = MockRequest(
        'POST', 
        is_json=True, 
        json_data={
            'fileName': 'test.exe',
            'contentType': 'application/x-executable'
        }
    )
    
    try:
        response_body, status_code, headers = get_signed_url(post_request_invalid_content)
        print(f"✓ Invalid content type status: {status_code}")
        assert status_code == 400
        print("✓ Invalid content type test passed\n")
    except Exception as e:
        print(f"✗ Invalid content type test failed: {e}\n")
    
    # Test 6: Valid request (with mocked storage client)
    print("6. Testing valid request with mocked storage...")
    
    with patch('main.storage_client') as mock_storage_client:
        # Mock the storage client and blob
        mock_bucket = MagicMock()
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = 'https://storage.googleapis.com/test-bucket/uploads/2024/01/01/test.jpg?signature=abc123'
        
        mock_bucket.blob.return_value = mock_blob
        mock_storage_client.bucket.return_value = mock_bucket
        
        post_request_valid = MockRequest(
            'POST',
            is_json=True,
            json_data={
                'fileName': 'test-image.jpg',
                'contentType': 'image/jpeg'
            }
        )
        
        try:
            response_body, status_code, headers = get_signed_url(post_request_valid)
            print(f"✓ Valid request status: {status_code}")
            
            # Parse response
            response_data = json.loads(response_body)
            print(f"✓ Response data: {json.dumps(response_data, indent=2)}")
            
            assert status_code == 200
            assert 'signedUrl' in response_data
            assert 'fileName' in response_data
            assert 'bucket' in response_data
            assert response_data['fileName'] == 'test-image.jpg'
            assert response_data['bucket'] == 'test-bucket-name'
            
            print("✓ Valid request test passed\n")
            
        except Exception as e:
            print(f"✗ Valid request test failed: {e}\n")
    
    print("=== All Tests Completed ===")

if __name__ == "__main__":
    test_function_locally()