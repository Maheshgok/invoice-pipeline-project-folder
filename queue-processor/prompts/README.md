# OpenAI Prompts Configuration

This directory contains externalized OpenAI prompts for easy fine-tuning and maintenance.

## Files

### `invoice_processing_prompt.py`
Contains the main invoice processing prompts:
- **`INVOICE_PROCESSING_PROMPT`**: Default comprehensive prompt for Indian purchase invoices
- **`get_invoice_prompt(version)`**: Function to get different prompt versions
- **`get_system_prompt(version)`**: Function to get system prompts

### `prompt_config.py`
Configuration management for prompts:
- **`PromptConfig`**: Class that manages configuration with environment variable overrides
- **`prompt_config`**: Global configuration instance
- **Environment variable documentation**

### `__init__.py`
Package initialization with convenient imports.

## Usage

### Basic Usage
```python
from prompts import get_invoice_prompt, get_system_prompt, prompt_config

# Get the default invoice processing prompt
prompt = get_invoice_prompt()

# Get a specific version
prompt_v2 = get_invoice_prompt("v2")

# Get system prompt
system_prompt = get_system_prompt("detailed")

# Access configuration
model = prompt_config.get('model', 'gpt-4o')
```

### Environment Variables for Fine-tuning

Set these environment variables to customize prompt behavior without code changes:

```bash
# Prompt Selection
export INVOICE_PROMPT_VERSION="default"     # Options: default, v2, service, product
export SYSTEM_PROMPT_VERSION="detailed"     # Options: default, detailed, conservative

# OpenAI Configuration  
export OPENAI_MODEL="gpt-4o"                # Model to use
export OPENAI_MAX_TOKENS=2000               # Maximum response tokens
export OPENAI_TEMPERATURE=0.1               # Temperature (0.0-2.0)
export OPENAI_TIMEOUT=120.0                 # Request timeout in seconds
export OPENAI_MAX_RETRIES=3                 # Maximum retry attempts
```

### Configuration Help
Run the configuration script to see all available options:
```bash
python prompts/prompt_config.py
```

## Prompt Versions

### Default (`INVOICE_PROCESSING_PROMPT`)
- Comprehensive prompt for Indian purchase invoices
- Handles GST compliance and double-entry bookkeeping  
- Conservative approach to data extraction
- Focuses on input tax treatment

### Version 2 (`INVOICE_PROCESSING_PROMPT_V2`)
- Enhanced version with more specific instructions
- Better handling of complex invoices
- *Note: Currently placeholder - add your improvements here*

### Specialized Prompts
- **`SERVICE_INVOICE_PROMPT`**: For service-based invoices
- **`PRODUCT_INVOICE_PROMPT`**: For goods/product invoices
- *Note: These are placeholders - customize as needed*

## System Prompts

### Default
Basic professional accountant context.

### Detailed  
More specific context with experience level and specializations.

### Conservative
Emphasizes only recording clearly visible information.

## Fine-tuning Guidelines

### 1. Testing Different Prompts
```bash
# Test with different prompt versions
export INVOICE_PROMPT_VERSION="v2"
# Restart your service to use the new prompt
```

### 2. A/B Testing
Deploy different versions to different instances:
```bash
# Instance A
export INVOICE_PROMPT_VERSION="default"

# Instance B  
export INVOICE_PROMPT_VERSION="v2"
```

### 3. Model Experimentation
```bash
# Try different models
export OPENAI_MODEL="gpt-4o-mini"     # Faster, cheaper
export OPENAI_MODEL="gpt-4o"          # Current default
export OPENAI_MODEL="gpt-4-vision-preview"  # Alternative
```

### 4. Response Tuning
```bash
# More detailed responses
export OPENAI_MAX_TOKENS=3000
export OPENAI_TEMPERATURE=0.2

# More conservative responses  
export OPENAI_MAX_TOKENS=1500
export OPENAI_TEMPERATURE=0.05
```

## Adding New Prompts

### 1. Add to `invoice_processing_prompt.py`
```python
NEW_SPECIALIZED_PROMPT = """Your new prompt here..."""

def get_invoice_prompt(version="default"):
    prompts = {
        "default": INVOICE_PROCESSING_PROMPT,
        "v2": INVOICE_PROCESSING_PROMPT_V2,
        "new_version": NEW_SPECIALIZED_PROMPT,  # Add your new prompt
    }
    return prompts.get(version, INVOICE_PROCESSING_PROMPT)
```

### 2. Update environment variable documentation
Add your new version to `ENVIRONMENT_VARIABLES` in `prompt_config.py`.

### 3. Test thoroughly
```bash
export INVOICE_PROMPT_VERSION="new_version"
# Test with various invoice types
```

## Best Practices

### 1. Versioning
- Keep old prompts for compatibility
- Use semantic versioning in prompt names
- Document changes in each version

### 2. Testing
- Test prompts with diverse invoice samples
- Monitor accuracy and consistency
- Compare against baseline performance

### 3. Documentation
- Document the purpose of each prompt variant
- Include examples of when to use each version
- Keep track of performance metrics

### 4. Deployment
- Use environment variables for configuration
- Test in staging before production
- Monitor logs for prompt effectiveness

## Troubleshooting

### Common Issues

**Prompt not loading:**
- Check environment variable spelling
- Verify the prompt version exists
- Check logs for import errors

**Inconsistent results:**
- Lower temperature for more consistency
- Add more specific instructions
- Test with multiple invoice samples

**Performance issues:**
- Reduce max_tokens if responses are slow
- Try a faster model (gpt-4o-mini)
- Optimize prompt length

### Logging
The system logs which prompt version is being used:
```
INFO: Using prompt version: default
INFO: Using system prompt version: detailed  
INFO: Using model: gpt-4o with max_tokens: 2000, temperature: 0.1
```

## Monitoring

Track these metrics when fine-tuning:
- **Accuracy**: Correct field extraction rate
- **Consistency**: Same invoice → same result
- **Coverage**: Handles all invoice types  
- **Performance**: Response time and cost
- **Balance**: Double-entry bookkeeping accuracy