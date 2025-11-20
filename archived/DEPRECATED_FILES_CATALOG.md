# Deprecated Files Archive

This document catalogs all files that have been archived due to being deprecated, temporary, or no longer needed in the active project.

## Archive Structure

### 📁 `logs-and-temp/`
**Purpose**: Temporary files, logs, and configuration dumps

| File | Purpose | Date Archived | Reason |
|------|---------|---------------|--------|
| `downloaded-logs-20251120-150841.json` | Cloud Run error logs | 2025-11-20 | Debugging logs - no longer needed |
| `front_end_console.txt` | Frontend console output | 2025-11-20 | Debugging output - temporary |
| `temp-config.yaml` | Temporary Cloud Run config | 2025-11-20 | Auto-generated temp file |

### 📁 `test-files/`
**Purpose**: Test scripts and validation files

| File | Purpose | Date Archived | Reason |
|------|---------|---------------|--------|
| `test_concurrent_uploads.py` | Upload concurrency testing | 2025-11-20 | Development testing - no longer needed |
| `test_frontend_multi_upload.js` | Frontend upload testing | 2025-11-20 | Development testing - no longer needed |
| `test_job_structure.py` | Queue job testing | 2025-11-20 | Development testing - no longer needed |
| `test_upload.py` | Basic upload testing | 2025-11-20 | Development testing - no longer needed |

### 📁 `deprecated-files/`
**Purpose**: Utility scripts and files no longer in use

| File | Purpose | Date Archived | Reason |
|------|---------|---------------|--------|
| `clear_firestore.ps1` | PowerShell script to clear Firestore | 2025-11-20 | Maintenance script - use admin tools instead |
| `clear_firestore_data.py` | Python script to clear Firestore | 2025-11-20 | Maintenance script - use admin tools instead |
| `simple_cleanup.py` | Basic cleanup utility | 2025-11-20 | Replaced by better cleanup procedures |
| `env_var` | Plain text environment variables | 2025-11-20 | Security risk - use proper .env files |
| `setup-queues.sh` | Queue setup script | 2025-11-20 | Replaced by current deployment process |
| `setup-watch-mail-trial.sh` | Project setup script | 2025-11-20 | Replaced by current deployment process |
| `deploy-watch-mail-trial.sh` | Deployment script | 2025-11-20 | Replaced by gcloud commands |

### 📁 `old-documentation/`
**Purpose**: Outdated documentation and guides

| File | Purpose | Date Archived | Reason |
|------|---------|---------------|--------|
| `COMPLETE_DEPLOYMENT_GUIDE.md` | Old deployment instructions | 2025-11-20 | Superseded by TECHNICAL_SPECIFICATIONS.md |
| `CONFIG_README.md` | Configuration documentation | 2025-11-20 | Integrated into main documentation |
| `DEPLOYMENT_STATUS_COMPLETE.md` | Deployment status tracking | 2025-11-20 | Project completed - no longer needed |

## Files Remaining in Project Root

### ✅ **Active Configuration Files**
- `.env` - Environment variables for local development
- `.gitignore` - Git ignore patterns  
- `netlify.toml` - Netlify deployment configuration
- `config.yaml` - Active project configuration

### ✅ **Current Documentation**
- `TECHNICAL_SPECIFICATIONS.md` - **Primary technical documentation**
- `API_ENDPOINTS_REFERENCE.md` - API reference documentation
- `API_QUICK_REFERENCE.md` - Quick API reference
- `FIRESTORE_LISTENER_IMPLEMENTATION.md` - Firestore implementation docs
- `FRONTEND_V2_DEFINITION.md` - Frontend specifications
- `INDIVIDUAL_RESULTS_IMPLEMENTATION.md` - Results implementation
- `MULTI_UPLOAD_IMPLEMENTATION_SUMMARY.md` - Upload implementation
- `ONLINE_TESTING_GUIDE.md` - Testing procedures
- `PDF_ENHANCEMENT_COMPLETE.md` - PDF processing documentation
- `QUEUE_ARCHITECTURE_DETAILED.md` - Queue architecture
- `QUEUE_PROCESSOR_API.md` - Queue processor API docs
- `REAL_FIRESTORE_LISTENERS_IMPLEMENTATION.md` - Firestore listeners
- `SIMPLIFIED_QUEUE_ARCHITECTURE.md` - Simplified architecture
- `SYSTEM_ARCHITECTURE_TRACE.md` - System architecture
- `TESTING_CHECKLIST.md` - Testing checklist

## Security Notes

### 🚨 **Archived Security Risks**
- `env_var` - Contained plain text credentials (now archived)
- Log files may contain sensitive information (properly archived)

### ✅ **Current Security**
- `.env` file properly configured with environment variables
- Credentials managed through proper channels
- No sensitive data in version control

## Restoration Process

If any archived file needs to be restored:

1. **Locate file** in appropriate archive subdirectory
2. **Check dependencies** - ensure no conflicts with current implementation  
3. **Update configurations** - modify to match current project structure
4. **Test thoroughly** - validate compatibility with active codebase
5. **Document changes** - update relevant documentation

## Cleanup Benefits

- ✅ **Reduced clutter** - Clean project root directory
- ✅ **Improved navigation** - Easier to find active files
- ✅ **Security enhancement** - Removed potential credential leaks
- ✅ **Documentation clarity** - Current docs are prominent
- ✅ **Maintenance efficiency** - Focus on active components only

---

**Archive Date**: November 20, 2025  
**Archived By**: Project consolidation and cleanup  
**Review Date**: December 2025 (consider permanent deletion if not needed)