// Service client configuration for new tenant-isolated pipeline architecture

export interface ServiceEndpoints {
  orchestrator: string
  dataExtractor: string
  chunkDispatcher: string
  fieldStandardizer: string
  dataCombiner: string
  // Legacy services for backward compatibility
  superadmin?: string
  admin?: string
  core?: string
}

// Environment-based configuration
export const SERVICE_URLS: ServiceEndpoints = {
  // New pipeline services
  orchestrator: import.meta.env.VITE_ORCHESTRATOR_SERVICE_URL || 'https://orchestrator-service-812016027146.asia-south1.run.app',
  dataExtractor: import.meta.env.VITE_DATA_EXTRACTOR_SERVICE_URL || 'https://data-extractor-v2-812016027146.asia-south1.run.app',
  chunkDispatcher: import.meta.env.VITE_CHUNK_DISPATCHER_SERVICE_URL || 'https://chunk-dispatcher-812016027146.asia-south1.run.app',
  fieldStandardizer: import.meta.env.VITE_FIELD_STANDARDIZER_SERVICE_URL || 'https://field-standardizer-v2-812016027146.asia-south1.run.app',
  dataCombiner: import.meta.env.VITE_DATA_COMBINER_SERVICE_URL || 'https://data-combiner-v2-812016027146.asia-south1.run.app',
  
  // Legacy services (optional for gradual migration)
  superadmin: import.meta.env.VITE_SUPERADMIN_SERVICE_URL || undefined,
  admin: import.meta.env.VITE_ADMIN_SERVICE_URL || undefined, 
  core: import.meta.env.VITE_CORE_SERVICE_URL || undefined
}

// API endpoint builders for each service
export const getServiceUrl = {
  // New Pipeline Services
  orchestrator: {
    processInvoice: () => `${SERVICE_URLS.orchestrator}/process-invoice`,
    jobStatus: (jobId: string) => `${SERVICE_URLS.orchestrator}/jobs/${jobId}/status`,
    jobProgress: (jobId: string) => `${SERVICE_URLS.orchestrator}/jobs/${jobId}/progress`,
    health: () => `${SERVICE_URLS.orchestrator}/health`
  },

  dataExtractor: {
    extract: () => `${SERVICE_URLS.dataExtractor}/extract`,
    extractionResult: (jobId: string) => `${SERVICE_URLS.dataExtractor}/jobs/${jobId}/extraction-result`,
    health: () => `${SERVICE_URLS.dataExtractor}/health`
  },

  chunkDispatcher: {
    dispatch: () => `${SERVICE_URLS.chunkDispatcher}/dispatch`,
    jobChunks: (jobId: string) => `${SERVICE_URLS.chunkDispatcher}/jobs/${jobId}/chunks`,
    health: () => `${SERVICE_URLS.chunkDispatcher}/health`
  },

  fieldStandardizer: {
    standardize: () => `${SERVICE_URLS.fieldStandardizer}/standardize`,
    standardizedResult: (jobId: string) => `${SERVICE_URLS.fieldStandardizer}/jobs/${jobId}/standardized-result`,
    health: () => `${SERVICE_URLS.fieldStandardizer}/health`
  },

  // Legacy SuperAdmin Service Endpoints (backward compatibility)
  superAdmin: SERVICE_URLS.superadmin ? {
    users: () => `${SERVICE_URLS.superadmin}/api/users`,
    userApprove: (uid: string) => `${SERVICE_URLS.superadmin}/api/users/${uid}/approve`,
    userUpdate: (uid: string) => `${SERVICE_URLS.superadmin}/api/users/${uid}`,
    userDelete: (uid: string) => `${SERVICE_URLS.superadmin}/api/users/${uid}`,
    packages: () => `${SERVICE_URLS.superadmin}/api/packages`,
    analytics: () => `${SERVICE_URLS.superadmin}/api/analytics`,
    system: () => `${SERVICE_URLS.superadmin}/api/system`
  } : undefined,
  
  // Legacy Admin Service Endpoints (backward compatibility)
  admin: SERVICE_URLS.admin ? {
    organization: () => `${SERVICE_URLS.admin}/api/organizations`,
    organizationStats: () => `${SERVICE_URLS.admin}/api/organizations/stats`,
    users: () => `${SERVICE_URLS.admin}/api/users`,
    userInvite: () => `${SERVICE_URLS.admin}/api/invites`,
    packages: () => `${SERVICE_URLS.admin}/api/packages`,
    billing: () => `${SERVICE_URLS.admin}/api/billing`,
    userUpdate: (uid: string) => `${SERVICE_URLS.admin}/api/users/${uid}`
  } : undefined,
  
  // Legacy Core Service Endpoints (backward compatibility) 
  core: SERVICE_URLS.core ? {
    upload: () => `${SERVICE_URLS.core}/api/upload`,
    uploadSignedUrl: () => `${SERVICE_URLS.core}/api/upload/signed-url`,
    uploadBatch: () => `${SERVICE_URLS.core}/api/upload/batch`,
    process: (jobId: string) => `${SERVICE_URLS.core}/api/process/${jobId}`,
    results: (jobId: string) => `${SERVICE_URLS.core}/api/results/${jobId}`,
    resultsStream: (jobId: string) => `${SERVICE_URLS.core}/api/results/${jobId}/stream`,
    archive: () => `${SERVICE_URLS.core}/api/archive`,
    health: () => `${SERVICE_URLS.core}/health`
  } : undefined
}

// Service availability checker
export async function checkServiceHealth() {
  const healthChecks = await Promise.allSettled([
    // New pipeline services
    fetch(getServiceUrl.orchestrator.health()).then(r => r.json()),
    fetch(getServiceUrl.dataExtractor.health()).then(r => r.json()),
    fetch(getServiceUrl.chunkDispatcher.health()).then(r => r.json()),
    fetch(getServiceUrl.fieldStandardizer.health()).then(r => r.json()),
    
    // Legacy services (only if configured)
    ...(SERVICE_URLS.superadmin ? [fetch(`${SERVICE_URLS.superadmin}/health`).then(r => r.json())] : []),
    ...(SERVICE_URLS.admin ? [fetch(`${SERVICE_URLS.admin}/health`).then(r => r.json())] : []),
    ...(SERVICE_URLS.core ? [fetch(`${SERVICE_URLS.core}/health`).then(r => r.json())] : [])
  ])

  return {
    // New pipeline service health
    orchestrator: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : null,
    dataExtractor: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : null,
    chunkDispatcher: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : null,
    fieldStandardizer: healthChecks[3].status === 'fulfilled' ? healthChecks[3].value : null,
    
    // Legacy service health (if available)
    ...(SERVICE_URLS.superadmin ? { superadmin: healthChecks[4]?.status === 'fulfilled' ? healthChecks[4].value : null } : {}),
    ...(SERVICE_URLS.admin ? { admin: healthChecks[5]?.status === 'fulfilled' ? healthChecks[5].value : null } : {}),
    ...(SERVICE_URLS.core ? { core: healthChecks[6]?.status === 'fulfilled' ? healthChecks[6].value : null } : {})
  }
}

// New pipeline processing workflow
export const processInvoiceWorkflow = {
  // Step 1: Create job and trigger extraction
  initiateProcessing: (gcsPath: string, filename: string, fileSize: number) => ({
    url: getServiceUrl.orchestrator.processInvoice(),
    payload: {
      gcs_input_path: gcsPath,
      original_filename: filename,
      file_size_bytes: fileSize
    }
  }),
  
  // Step 2: Monitor job progress
  checkProgress: (jobId: string) => getServiceUrl.orchestrator.jobProgress(jobId),
  
  // Step 3: Get final status
  getFinalStatus: (jobId: string) => getServiceUrl.orchestrator.jobStatus(jobId),
  
  // Get detailed extraction results
  getExtractionResult: (jobId: string) => getServiceUrl.dataExtractor.extractionResult(jobId),
  
  // Get chunk processing status
  getChunkStatus: (jobId: string) => getServiceUrl.chunkDispatcher.jobChunks(jobId),
  
  // Get standardized results
  getStandardizedResult: (jobId: string) => getServiceUrl.fieldStandardizer.standardizedResult(jobId)
}

// Legacy API compatibility (for gradual migration)
export const getApiUrl = {
  // Map old endpoints to new orchestrator-based workflow
  signedUrl: (_encodedPath: string) => getServiceUrl.orchestrator.processInvoice(),
  archiveCompleted: () => getServiceUrl.orchestrator.jobStatus(''),  // Generic endpoint
  
  // New service-based endpoints
  ...getServiceUrl
}