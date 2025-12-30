"""
Prompts Package
Centralized prompt management for OpenAI invoice processing
"""

from .invoice_processing_prompt import (
    INVOICE_PROCESSING_PROMPT,
    get_invoice_prompt,
    get_system_prompt
)
from .prompt_config import prompt_config

__all__ = [
    'INVOICE_PROCESSING_PROMPT',
    'get_invoice_prompt', 
    'get_system_prompt',
    'prompt_config'
]