import os
import logging
import argparse
from openai_client import extract_invoice_from_image

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_local_file_read(file_path):
    """Test reading a local file"""
    try:
        # Convert Windows path to proper format if needed
        file_path = os.path.abspath(file_path)
        logger.info(f"Testing local file read from {file_path}")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        with open(file_path, 'rb') as f:
            file_bytes = f.read()
        logger.info("✓ Local file read successful")
        return file_bytes
    except Exception as e:
        logger.error(f"✗ Local file read failed: {str(e)}")
        raise

# Removed cloud storage test for offline testing

def test_openai_extraction(file_bytes):
    """Test OpenAI invoice extraction"""
    try:
        logger.info("Testing OpenAI extraction")
        extracted_data = extract_invoice_from_image(file_bytes)
        logger.info("✓ OpenAI extraction successful")
        logger.info(f"Extracted data: {extracted_data}")
        return extracted_data
    except Exception as e:
        logger.error(f"✗ OpenAI extraction failed: {str(e)}")
        raise

def test_openai_with_local_file(file_path):
    """Test OpenAI extraction with a local file"""
    try:
        logger.info("=== Testing OpenAI with Local File ===")
        file_bytes = test_local_file_read(file_path)
        extracted_data = test_openai_extraction(file_bytes)
        logger.info("=== OpenAI Local File Test Completed Successfully ===")
        return extracted_data
    except Exception as e:
        logger.error(f"OpenAI local file test failed: {str(e)}")
        raise

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Test invoice processing components')
    parser.add_argument('--test-type', choices=['openai', 'gcs'], required=True,
                      help='Component to test')
    parser.add_argument('--local-file', help='Path to local file for testing')
    parser.add_argument('--signed-url', help='Signed URL for direct download')
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    
    # Verify environment variables
    if not os.getenv('OPENAI_KEY_INVOICE'):
        logger.error("Missing OPENAI_KEY_INVOICE environment variable")
        exit(1)
    
    try:
        logger.info(f"=== Starting {args.test_type.upper()} Test ===")
        
        if args.test_type == 'openai':
            if not args.local_file and not args.signed_url:
                raise ValueError("Either --local-file or --signed-url is required for OpenAI testing")
            
            # Get file bytes either from local file or signed URL
            if args.local_file:
                result = test_openai_with_local_file(args.local_file)
            else:
                logger.info(f"Downloading from signed URL: {args.signed_url}")
                import requests
                response = requests.get(args.signed_url)
                response.raise_for_status()
                file_bytes = response.content
                logger.info("✓ Signed URL download successful")
                result = test_openai_extraction(file_bytes)
            
            logger.info("=== Test Completed Successfully ===")
            logger.info("Extracted Data:")
            logger.info(result)
            
        elif args.test_type == 'gcs':
            # Extract bucket and blob path from signed URL
            from urllib.parse import urlparse
            if not args.signed_url:
                raise ValueError("--signed-url is required for GCS testing")
            
            parsed_url = urlparse(args.signed_url)
            path_parts = parsed_url.path.strip('/').split('/')
            bucket_name = path_parts[0]
            blob_path = '/'.join(path_parts[1:])
            
            logger.info(f"Testing GCS access for bucket: {bucket_name}")
            logger.info(f"Blob path: {blob_path}")
            
            file_bytes = test_gcs_download(bucket_name, blob_path)
            logger.info(f"Successfully downloaded {len(file_bytes)} bytes")
            
    except Exception as e:
        logger.error(f"Test failed: {str(e)}")
        exit(1)