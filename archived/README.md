# Archived Components

This folder contains deprecated and unused components that have been archived for historical reference.

## Archived Directories

### `invoice-bolt/`
**Status**: Deprecated frontend implementation
**Reason**: Replaced by `invoice-app-v2` which is the active Netlify deployment
**Last Used**: November 2025
**Contents**: 
- Simplified React frontend with basic dependencies
- Missing key features like file dropzone, state management
- Contains outdated Firebase configuration

### `invoice-processor/`
**Status**: Deprecated backend service
**Reason**: Replaced by `queue-processor` architecture
**Last Used**: November 2025
**Contents**:
- Legacy invoice processing service
- Older OpenAI integration patterns
- Cloud Function deployment configurations

### `Cloudfunction_backup/`
**Status**: Deprecated deployment method
**Reason**: Replaced by Cloud Run deployment (`initial-api/Cloudrun_version`)
**Last Used**: November 2025
**Contents**:
- Cloud Functions implementation of initial API
- Legacy deployment scripts
- Older Flask configurations

## Active Project Structure

The current active components are:

```
invoice-pipeline-project-folder/
├── invoice-app-v2/              # ACTIVE frontend (Netlify deployment)
├── initial-api/Cloudrun_version/ # ACTIVE backend API (Cloud Run)  
├── queue-processor/             # ACTIVE processing service (Cloud Run)
├── shared/                      # Shared configurations
└── archived/                    # This archive folder
```

## Migration Notes

- All environment variables and configurations have been migrated to active components
- No dependencies exist between archived and active components
- Archived components can be safely removed if storage space is needed

## Restoration

To restore any archived component:
1. Move from `archived/` back to project root
2. Check for dependency conflicts with active components
3. Update configurations to match current project standards

---
**Archive Date**: November 20, 2025
**Archived By**: System cleanup and consolidation