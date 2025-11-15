import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class Config:
    """Configuration management for the invoice processor."""
    
    REQUIRED_ENV_VARS = {
        'OPENAI_API_KEY': 'API key for OpenAI services',
        'GOOGLE_CLOUD_PROJECT': 'Google Cloud project ID',
        'PUBSUB_TOPIC_STEP_1': 'Pub/Sub topic for step 1 processing (step-1-process-output-dev)',
    }
    
    @classmethod
    def validate_environment(cls) -> None:
        """
        Validate all required environment variables are set.
        Raises ValueError if any required variable is missing.
        """
        missing_vars = []
        
        for var, description in cls.REQUIRED_ENV_VARS.items():
            if not os.getenv(var):
                missing_vars.append(f"{var} ({description})")
        
        if missing_vars:
            error_msg = "Missing required environment variables:\n- " + "\n- ".join(missing_vars)
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        logger.info("All required environment variables are set")
    
    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """
        Get the current configuration.
        Validates environment variables before returning.
        """
        cls.validate_environment()
        
        return {
            'project_id': os.getenv('GOOGLE_CLOUD_PROJECT'),
            'openai_key': os.getenv('OPENAI_API_KEY')
        }