"""
Prompt Configuration Settings
Centralized configuration for OpenAI prompt selection and parameters
"""

import os
from typing import Dict, Any

# Default prompt configuration
DEFAULT_PROMPT_CONFIG = {
    "prompt_version": "default",  # Options: "default", "v2", "service", "product"
    "system_prompt_version": "default",  # Options: "default", "detailed", "conservative"
    "model": "gpt-4o",  # OpenAI model to use
    "max_tokens": 2000,  # Maximum tokens in response
    "temperature": 0.1,  # Low temperature for consistent accounting output
    "timeout": 120.0,  # Request timeout in seconds
    "max_retries": 3,  # Maximum retry attempts
}


class PromptConfig:
    """Manages prompt configuration with environment variable overrides"""
    
    def __init__(self):
        self.config = DEFAULT_PROMPT_CONFIG.copy()
        self._load_from_environment()
    
    def _load_from_environment(self):
        """Load configuration from environment variables"""
        
        # Prompt version selection
        if os.getenv('INVOICE_PROMPT_VERSION'):
            self.config['prompt_version'] = os.getenv('INVOICE_PROMPT_VERSION')
        
        if os.getenv('SYSTEM_PROMPT_VERSION'):
            self.config['system_prompt_version'] = os.getenv('SYSTEM_PROMPT_VERSION')
        
        # OpenAI model configuration
        if os.getenv('OPENAI_MODEL'):
            self.config['model'] = os.getenv('OPENAI_MODEL')
        
        if os.getenv('OPENAI_MAX_TOKENS'):
            try:
                self.config['max_tokens'] = int(os.getenv('OPENAI_MAX_TOKENS'))
            except ValueError:
                pass  # Keep default
        
        if os.getenv('OPENAI_TEMPERATURE'):
            try:
                self.config['temperature'] = float(os.getenv('OPENAI_TEMPERATURE'))
            except ValueError:
                pass  # Keep default
        
        if os.getenv('OPENAI_TIMEOUT'):
            try:
                self.config['timeout'] = float(os.getenv('OPENAI_TIMEOUT'))
            except ValueError:
                pass  # Keep default
        
        if os.getenv('OPENAI_MAX_RETRIES'):
            try:
                self.config['max_retries'] = int(os.getenv('OPENAI_MAX_RETRIES'))
            except ValueError:
                pass  # Keep default
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        return self.config.get(key, default)
    
    def get_all(self) -> Dict[str, Any]:
        """Get all configuration values"""
        return self.config.copy()
    
    def update(self, updates: Dict[str, Any]):
        """Update configuration values"""
        self.config.update(updates)
    
    def set(self, key: str, value: Any):
        """Set a single configuration value"""
        self.config[key] = value


# Global instance
prompt_config = PromptConfig()


# Environment variable documentation
ENVIRONMENT_VARIABLES = {
    'INVOICE_PROMPT_VERSION': {
        'description': 'Version of invoice processing prompt to use',
        'options': ['default', 'v2', 'service', 'product'],
        'default': 'default'
    },
    'SYSTEM_PROMPT_VERSION': {
        'description': 'Version of system prompt to use',
        'options': ['default', 'detailed', 'conservative'],
        'default': 'default'
    },
    'OPENAI_MODEL': {
        'description': 'OpenAI model to use for processing',
        'options': ['gpt-4o', 'gpt-4-vision-preview', 'gpt-4o-mini'],
        'default': 'gpt-4o'
    },
    'OPENAI_MAX_TOKENS': {
        'description': 'Maximum tokens in OpenAI response',
        'type': 'int',
        'default': 2000
    },
    'OPENAI_TEMPERATURE': {
        'description': 'OpenAI temperature (0.0-2.0, lower = more consistent)',
        'type': 'float',
        'default': 0.1
    },
    'OPENAI_TIMEOUT': {
        'description': 'Request timeout in seconds',
        'type': 'float',
        'default': 120.0
    },
    'OPENAI_MAX_RETRIES': {
        'description': 'Maximum retry attempts for failed requests',
        'type': 'int',
        'default': 3
    }
}


def print_config_help():
    """Print help information about available configuration options"""
    print("Available Environment Variables for Prompt Configuration:")
    print("=" * 60)
    
    for var_name, info in ENVIRONMENT_VARIABLES.items():
        print(f"\n{var_name}:")
        print(f"  Description: {info['description']}")
        print(f"  Default: {info['default']}")
        
        if 'options' in info:
            print(f"  Options: {', '.join(info['options'])}")
        elif 'type' in info:
            print(f"  Type: {info['type']}")
        
        print(f"  Current: {os.getenv(var_name, 'Not set (using default)')}")


if __name__ == "__main__":
    # When run directly, print configuration help
    print_config_help()
    print("\n" + "=" * 60)
    print("Current Configuration:")
    for key, value in prompt_config.get_all().items():
        print(f"  {key}: {value}")