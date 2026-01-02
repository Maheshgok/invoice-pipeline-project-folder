"""
OpenAI Processing Module
Handles image analysis with OpenAI Vision API

Latest Deployment: 2025-11-20 09:52 UTC
OpenAI Library: ≥1.50.0 (latest compatible version)
Key Improvements: Enhanced error handling, timeout configuration, retry logic, external prompts
Docker Image: queue-processor@sha256:fe48a8dac90b5ef3e824bbc32d2a4b00d81c349250e16e1f5453820f6c319ab3
"""
import os
import json
import base64
import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from openai import OpenAI
from google.cloud import storage
from pdf2image import convert_from_bytes
from PIL import Image
import io

# Import prompts from external files
from prompts import get_invoice_prompt, get_system_prompt, prompt_config

logger = logging.getLogger(__name__)

class OpenAIProcessor:
    """
    Handles OpenAI Vision API processing for invoice images
    """
    
    def __init__(self):
        # Try to get API key directly from environment first
        self.api_key = os.environ.get('OPENAI_API_KEY')
        
        # If not found, try to get from Secret Manager
        if not self.api_key:
            secret_name = os.environ.get('OPENAI_API_KEY_SECRET')
            if secret_name:
                try:
                    from google.cloud import secretmanager
                    client = secretmanager.SecretManagerServiceClient()
                    project_id = os.environ.get('PROJECT_ID', 'watch-mail-trial')
                    secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
                    
                    response = client.access_secret_version(request={"name": secret_path})
                    self.api_key = response.payload.data.decode("UTF-8").strip()  # Strip whitespace!
                    logger.info("OpenAI API key loaded from Secret Manager")
                except Exception as e:
                    logger.error(f"Failed to load API key from Secret Manager: {e}")
        
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable or OPENAI_API_KEY_SECRET not set")
        
        # Initialize OpenAI client with configuration from external config
        try:
            self.client = OpenAI(
                api_key=self.api_key,
                base_url="https://api.openai.com/v1",  # Explicit base URL
                timeout=prompt_config.get('timeout', 300.0),  # Increased from 120 to 300 seconds
                max_retries=prompt_config.get('max_retries', 5)  # Increased from 3 to 5 retries
            )
            logger.info("OpenAI client initialized successfully with explicit base URL")
        except Exception as e:
            logger.exception("Failed to initialize OpenAI client with full stacktrace:")
            raise
        
        # Initialize storage client with explicit project ID
        project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.storage_client = storage.Client(project=project_id)
        
        # Get prompt configuration
        self.prompt_version = prompt_config.get('prompt_version', 'default')
        self.system_prompt_version = prompt_config.get('system_prompt_version', 'default')
        self.model = prompt_config.get('model', 'gpt-4o')
        self.max_tokens = prompt_config.get('max_tokens', 2000)
        self.temperature = prompt_config.get('temperature', 0.1)
        
        logger.info(f"OpenAI Processor initialized for project: {project_id}")
        logger.info(f"Using prompt version: {self.prompt_version}")
        logger.info(f"Using system prompt version: {self.system_prompt_version}")
        logger.info(f"Using model: {self.model} with max_tokens: {self.max_tokens}, temperature: {self.temperature}")
        logger.info("OpenAI Processor initialized with external prompt configuration")
        
        # Test OpenAI connection during initialization
        self._test_openai_connection()
        
    def _test_openai_connection(self):
        """Test OpenAI API connectivity during initialization"""
        try:
            logger.info("🔍 Testing OpenAI API connection...")
            # Simple API test - list models
            models = self.client.models.list()
            logger.info(f"✅ OpenAI API connection successful. Available models: {len(models.data)}")
        except Exception as e:
            logger.exception("❌ OpenAI API connection test failed during initialization (full stacktrace):")
            logger.error(f"❌ Error type: {type(e).__name__}")
            logger.error(f"❌ Error message: {str(e)}")
            if hasattr(e, 'response'):
                logger.error(f"❌ Response: {e.response}")
            if hasattr(e, 'status_code'):
                logger.error(f"❌ HTTP status: {e.status_code}")
            logger.error(f"❌ This may cause processing failures later")
            # Don't raise the error to avoid service startup failure
        
    def get_user_bucket_name(self, user_uid):
        """Generate user-specific bucket name matching initial-api logic"""
        # Convert to lowercase to match GCS bucket naming requirements
        user_id_short = user_uid[:8].lower() if len(user_uid) >= 8 else user_uid.lower()
        return f"watch_mail_trial_invoice_{user_id_short}"
        
    def parse_bucket_path(self, bucket_path, user_uid):
        """Parse bucket path and return bucket name and blob path"""
        logger.info(f"Received bucket_path: {bucket_path} for user: {user_uid}")
        
        # Check if this is a user-isolated bucket path (new format)
        if "/" in bucket_path and bucket_path.count("/") > 1:
            # Format: user-bucket-name/path/to/file
            parts = bucket_path.split("/", 1)
            potential_bucket = parts[0]
            # Handle both old format (with hyphens) and new format (with underscores)
            if potential_bucket.startswith("watch-mail-trial-invoice-") or potential_bucket.startswith("watch_mail_trial_invoice_"):
                logger.info(f"Using user bucket format - bucket: {potential_bucket}, blob: {parts[1]}")
                return potential_bucket, parts[1]
        
        # Check if this is a normalized path from old system
        if bucket_path.startswith('users/'):
            # Old normalized format - convert to user-isolated bucket
            user_bucket = self.get_user_bucket_name(user_uid)
            # Remove users/uid_short/raw/ prefix and use just the file path
            path_parts = bucket_path.split('/')
            if len(path_parts) >= 4 and path_parts[2] == 'raw':
                blob_path = '/'.join(path_parts[3:])  # Everything after raw/
                logger.info(f"Converting old format - bucket: {user_bucket}, blob: raw/{blob_path}")
                return user_bucket, f"raw/{blob_path}"
            else:
                logger.info(f"Using old format as-is - bucket: {user_bucket}, blob: {bucket_path}")
                return user_bucket, bucket_path
        
        # Fallback: assume it's already a proper path for user bucket
        user_bucket = self.get_user_bucket_name(user_uid)
        logger.info(f"Using fallback - bucket: {user_bucket}, blob: {bucket_path}")
        return user_bucket, bucket_path
        
        logger.info("OpenAI Processor initialized with external prompt configuration")

    def process_image(self, bucket_path: str, user_uid: str) -> Dict[str, Any]:
        """
        Process a single image with OpenAI Vision API
        Returns: {"success": bool, "data": dict, "error": str}
        """
        bucket_name = None
        blob_path = None
        
        try:
            # Parse bucket and path from bucket_path
            logger.info(f"Received bucket_path: {bucket_path}")
            
            # Check if bucket_path starts with known bucket prefixes or is a normalized path
            if bucket_path.startswith('users/'):
                # This is a normalized path from cloud_tasks_handler - use hardcoded bucket
                bucket_name = 'watch-mail-trial-invoice-processing'
                blob_path = bucket_path
                logger.info(f"Using normalized path - bucket: {bucket_name}, blob: {blob_path}")
            elif '/' in bucket_path and not bucket_path.startswith('users/'):
                # This might be a full path: bucket_name/users/...
                parts = bucket_path.split('/', 1)
                bucket_name = parts[0]
                blob_path = parts[1]
                logger.info(f"Parsed full path - bucket: {bucket_name}, blob: {blob_path}")
            else:
                # Fallback to hardcoded bucket
                bucket_name = 'watch-mail-trial-invoice-processing'
                blob_path = bucket_path
                logger.warning(f"Using fallback bucket: {bucket_name}, blob: {blob_path}")
            
            logger.info(f"Processing file: bucket={bucket_name}, path={blob_path}")
            
            # Get file from Cloud Storage
            bucket = self.storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            if not blob.exists():
                return {
                    "success": False,
                    "error": f"File not found: {bucket_name}/{blob_path}",
                    "data": None
                }
            
            # Download file content and encode as base64 for OpenAI
            try:
                logger.info(f"Downloading file content from {bucket_name}/{blob_path}")
                file_content = blob.download_as_bytes()
                
                # Determine the MIME type based on file extension
                blob_name_lower = blob_path.lower()
                if blob_name_lower.endswith('.pdf'):
                    # Handle PDF files - convert to image
                    logger.info(f"Processing PDF file: {blob_path}")
                    base64_content = self._process_pdf_to_base64(file_content)
                    mime_type = 'image/png'  # PDF converted to PNG
                elif blob_name_lower.endswith(('.jpg', '.jpeg')):
                    mime_type = 'image/jpeg'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                elif blob_name_lower.endswith('.png'):
                    mime_type = 'image/png'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                elif blob_name_lower.endswith('.gif'):
                    mime_type = 'image/gif'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                elif blob_name_lower.endswith('.webp'):
                    mime_type = 'image/webp'
                    base64_content = base64.b64encode(file_content).decode('utf-8')
                else:
                    # Fallback: try to detect if it's a PDF by content
                    if file_content.startswith(b'%PDF'):
                        logger.info(f"Detected PDF file by content: {blob_path}")
                        base64_content = self._process_pdf_to_base64(file_content)
                        mime_type = 'image/png'
                    else:
                        mime_type = 'image/jpeg'  # Default fallback
                        base64_content = base64.b64encode(file_content).decode('utf-8')
                
                # Create data URL
                data_url = f"data:{mime_type};base64,{base64_content}"
                
                logger.info(f"Successfully processed file as {mime_type}, size: {len(file_content)} bytes")
                
            except Exception as e:
                logger.error(f"Could not download file content: {e}")
                return {
                    "success": False,
                    "error": f"Could not access file for processing: {str(e)}",
                    "data": None
                }
            
            # Call OpenAI Vision API with external prompts and configuration
            invoice_prompt = get_invoice_prompt(self.prompt_version)
            system_prompt = get_system_prompt(self.system_prompt_version)
            
            logger.info(f"Calling OpenAI Vision API with model {self.model}")
            logger.info(f"Using prompt version: {self.prompt_version}")
            logger.info(f"Using system prompt version: {self.system_prompt_version}")
            
            try:
                # Prepare messages with system prompt if provided
                messages = []
                
                # Add system message if system prompt is available
                if system_prompt and system_prompt.strip():
                    messages.append({
                        "role": "system", 
                        "content": system_prompt
                    })
                
                # Add user message with invoice prompt and image
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": invoice_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        }
                    ]
                })
                
                # Make API call with configuration parameters
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_tokens=self.max_tokens,
                    temperature=self.temperature
                )
                logger.info(f"OpenAI API call successful, extracting response content")
            except Exception as api_error:
                # Full exception logging for detailed debugging
                logger.exception("❌ OpenAI API call failed with full stacktrace:")
                
                error_msg = f"OpenAI API connection failed: {str(api_error)}"
                
                if hasattr(api_error, '__class__'):
                    error_type = api_error.__class__.__name__
                    logger.error(f"❌ OpenAI Error Type: {error_type}")
                
                # Check for specific OpenAI error types
                if hasattr(api_error, 'code'):
                    logger.error(f"❌ OpenAI Error Code: {api_error.code}")
                    
                if hasattr(api_error, 'response'):
                    logger.error(f"❌ OpenAI Response: {api_error.response}")
                
                if hasattr(api_error, 'status_code'):
                    logger.error(f"❌ HTTP Status Code: {api_error.status_code}")
                    
                if hasattr(api_error, 'body'):
                    logger.error(f"❌ Response Body: {api_error.body}")
                
                # Log additional debugging info
                logger.error(f"❌ Full error details: {repr(api_error)}")
                logger.error(f"❌ Using model: {self.model}")
                logger.error(f"❌ API key length: {len(self.api_key) if self.api_key else 0}")
                logger.error(f"❌ Max tokens: {self.max_tokens}, Temperature: {self.temperature}")
                
                return {
                    "success": False,
                    "error": error_msg,
                    "data": None
                }
            
            # Extract and parse response
            content = response.choices[0].message.content
            logger.info(f"📊 OpenAI response content length: {len(content)} characters")
            logger.info(f"📋 RAW OpenAI response content START:")
            logger.info(f"{content}")
            logger.info(f"📋 RAW OpenAI response content END")
            
            parsed_data = self._parse_openai_response(content)
            logger.info(f"🔍 Parsed data type: {type(parsed_data)}")
            logger.info(f"🔍 Parsed data keys: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'Not a dict'}")
            logger.info(f"📋 Full parsed data: {parsed_data}")
            
            # Check specifically for journal entries
            if isinstance(parsed_data, dict):
                journal_entries = parsed_data.get('journal_entries', [])
                logger.info(f"💰 Journal entries found: {len(journal_entries) if isinstance(journal_entries, list) else 'Not a list'}")
                if journal_entries:
                    logger.info(f"💰 First journal entry: {journal_entries[0] if journal_entries else 'None'}")
                else:
                    logger.warning(f"⚠️ NO JOURNAL ENTRIES FOUND in parsed data!")
                    logger.warning(f"⚠️ Available keys: {list(parsed_data.keys())}")
            
            result_data = {
                "extracted_data": parsed_data,
                "processing_time": datetime.now().isoformat(),
                "model_used": "gpt-4o"
            }
            
            logger.info(f"📊 Final result data structure before return:")
            logger.info(f"📊 - extracted_data type: {type(parsed_data)}")
            logger.info(f"📊 - extracted_data keys: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'Not a dict'}")
            logger.info(f"📊 - processing_time: {result_data['processing_time']}")
            logger.info(f"📊 - model_used: {result_data['model_used']}")
            
            return {
                "success": True,
                "data": result_data,
                "error": None
            }
            
        except Exception as e:
            logger.error(f"Error processing image {bucket_name}/{blob_path}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "data": None
            }

    def _parse_openai_response(self, content: str) -> Dict[str, Any]:
        """Parse OpenAI response and extract JSON"""
        logger.info(f"🔧 Starting to parse OpenAI response...")
        logger.info(f"🔧 Original content length: {len(content)}")
        
        try:
            original_content = content
            
            # Clean up the response to extract JSON
            if '```json' in content:
                logger.info(f"🔧 Found ```json marker, extracting...")
                content = content.split('```json')[1].split('```')[0]
                logger.info(f"🔧 After json extraction: {content[:200]}...")
            elif '```' in content:
                logger.info(f"🔧 Found ``` marker, extracting...")
                content = content.split('```')[1]
                logger.info(f"🔧 After generic extraction: {content[:200]}...")
            
            content = content.strip()
            logger.info(f"🔧 Final content to parse (first 300 chars): {content[:300]}")
            
            # Try to parse as JSON
            parsed_data = json.loads(content)
            logger.info(f"✅ JSON parsing successful")
            logger.info(f"📊 Parsed data type: {type(parsed_data)}")
            if isinstance(parsed_data, dict):
                logger.info(f"📊 Top-level keys: {list(parsed_data.keys())}")
            return parsed_data
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parsing failed: {e}")
            logger.error(f"❌ Content that failed to parse: {content}")
            logger.error(f"❌ Original content: {original_content}")
            # Return structured error with raw content
            return {
                "error": "Failed to parse JSON response",
                "raw_response": original_content,
                "extracted_table": [],
                "vendor_name": "Parse Error",
                "invoice_number": "Unknown",
                "total_amount": "0.00"
            }
        
        except Exception as e:
            logger.error(f"Unexpected error parsing response: {e}")
            return {
                "error": f"Unexpected parsing error: {str(e)}",
                "raw_response": content,
                "extracted_table": []
            }

    def _process_pdf_to_base64(self, pdf_content: bytes) -> str:
        """Convert PDF to PNG image and return base64 string"""
        try:
            # Convert PDF to images using pdf2image (first page only)
            images = convert_from_bytes(
                pdf_content,
                first_page=1,  # Only convert first page
                last_page=1,
                dpi=200,  # High DPI for better text recognition
                fmt='PNG'
            )
            
            if not images:
                raise ValueError("No images generated from PDF")
            
            # Get the first (and only) image
            image = images[0]
            
            # Optimize image size if too large (OpenAI has limits)
            max_size = 2048  # Maximum width/height
            if image.width > max_size or image.height > max_size:
                logger.info(f"Resizing PDF image from {image.width}x{image.height}")
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                logger.info(f"Resized to {image.width}x{image.height}")
            
            # Convert to base64
            buffer = io.BytesIO()
            image.save(buffer, format='PNG', optimize=True)
            buffer.seek(0)
            base64_content = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            logger.info(f"Successfully converted PDF to PNG image: {image.width}x{image.height}")
            return base64_content
            
        except Exception as e:
            logger.error(f"Error converting PDF to image: {e}")
            raise ValueError(f"Failed to process PDF file: {str(e)}")