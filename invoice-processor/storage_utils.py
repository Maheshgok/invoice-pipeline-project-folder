import logging
from google.cloud import storage
from tenacity import retry, stop_after_attempt, wait_exponential
import os

logger = logging.getLogger(__name__)

storage_client = storage.Client(project=os.getenv('GOOGLE_CLOUD_PROJECT'))

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    reraise=True
)
def download_file(bucket_name: str, blob_name: str) -> bytes:
    """
    Download a file from Google Cloud Storage.
    
    Args:
        bucket_name: Name of the GCS bucket
        blob_name: Path to the object within the bucket
        
    Returns:
        bytes: The contents of the file
        
    Raises:
        Exception: If download fails after retries
    """
    try:
        logger.info(f"Downloading {blob_name} from bucket {bucket_name}")
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        return blob.download_as_bytes()
        
    except Exception as e:
        logger.error(f"Error downloading file from GCS: {str(e)}")
        raise
