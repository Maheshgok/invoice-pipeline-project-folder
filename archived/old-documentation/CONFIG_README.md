# Invoice Processing Pipeline Configuration

This document describes the centralized configuration system for the invoice processing pipeline project.

## Project Structure

```
invoice-pipeline-project-folder/
├── config.yaml              # Central configuration file
├── shared/                  # Shared utilities and configuration
│   ├── config.py           # Configuration management module
│   └── deploy-service.sh   # Shared deployment script
├── invoice-processor/      # Invoice processing service
└── initial-api/           # Upload API service
```

## Configuration System

### Central Configuration (config.yaml)

The `config.yaml` file at the root of the project contains all shared configuration values:
- Project settings (ID, region)
- Service configurations
- Storage settings
- Pub/Sub topics
- Environment-specific settings

### Using Configuration in Python Services

```python
from shared.config import config

# Access configuration values
project_id = config.project_id
storage_config = config.get_storage_config()
upload_topic = config.get_pubsub_topic('upload_initiated')
```

### Deployment

Use the shared deployment script:
```bash
./shared/deploy-service.sh invoice-processor dev
```

## Environment Variables

Each service should have an `.env.yaml` file for service-specific configuration:
- API keys
- Service-specific settings
- Environment-specific overrides

## Adding New Services

1. Add service configuration to `config.yaml`
2. Create service-specific `.env.yaml`
3. Use shared deployment script
4. Import configuration from `shared.config`

## Best Practices

1. Always use the central configuration for shared values
2. Use environment-specific settings where needed
3. Keep sensitive values in `.env.yaml` files
4. Use the shared deployment script for consistent deployments