# Archived Unused Code - December 24, 2025

## Overview
This archive contains code, configurations, and files that are no longer actively used in the invoice processing system as of December 24, 2025. These files have been moved here to keep the main codebase clean and focused.

## Archived Contents

### Queue Processor Legacy Files (`queue-processor-legacy/`)
- **main_cloud_tasks.py** - Legacy Cloud Tasks implementation (353 lines)
- **main_cloud_tasks_full.py** - Full Cloud Tasks implementation (353 lines)  
- **main_legacy_backup.py** - Legacy backup version (229 lines)
- **main_refactored.py** - Refactored version (256 lines)
- **main_test.py** - Test implementation (212 lines)
- **requirements_full.txt** - Full requirements file (unused)
- **requirements_test.txt** - Test requirements file (unused)
- **key.json** - Old service account key (deprecated)
- **service-account-key.json** - Duplicate service account key (deprecated)

### Debug Scripts (`debug-scripts/`)
- **debug_collections.py** - Firestore collections debugging
- **debug_document.py** - Document debugging utilities  
- **debug_firestore.py** - Firestore debugging tools
- **debug-job-flow.py** - Job flow debugging script
- **test_flow.py** - Test flow validation script

### Old Environments (`old-environments/`)
- **venv-test/** - Old test virtual environment (complete directory)

### Root Level Files
- **deploy.sh.save** - Backup deployment script from initial-api
- **config.yaml** - Old configuration file (replaced by environment variables)

## Active Files (Still in Use)
The following files remain active in the main codebase:
- `queue-processor/main.py` - Primary application entry point (284 lines)
- `queue-processor/requirements.txt` - Active requirements file
- All files in `invoice-app-v2/` - Frontend application
- All files in `archive-manager/` - Archive service
- All files in `initial-api/Cloudrun_version/` - API service

## Restoration
If any of these files need to be restored, they can be moved back to their original locations. The file structure and original paths are preserved in this archive.

## Cleanup Reason
This cleanup was performed to:
1. Reduce confusion about which files are actively used
2. Speed up deployments by removing unused files from builds
3. Make the codebase easier to navigate and understand
4. Prepare for fixing the queue-processor service issues

## Archive Date
**Created**: December 24, 2025, 15:41:37
**Archived By**: Automated cleanup process
**Total Files Archived**: 14 files and 1 directory