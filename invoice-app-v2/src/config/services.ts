// Service client configuration for compartmentalized architecture

export interface ServiceEndpoints {
  superadmin: string
  admin: string
  core: string
}

// Environment-based configuration
export const SERVICE_URLS: ServiceEndpoints = {
  superadmin: import.meta.env.VITE_SUPERADMIN_SERVICE_URL || 'http://localhost:3001',
  admin: import.meta.env.VITE_ADMIN_SERVICE_URL || 'http://localhost:3002', 
  core: import.meta.env.VITE_CORE_SERVICE_URL || 'http://localhost:3003'
}

// API endpoint builders for each service
export const getServiceUrl = {
  // SuperAdmin Service Endpoints
  superAdmin: {
    users: () => `${SERVICE_URLS.superadmin}/api/users`,
    userApprove: (uid: string) => `${SERVICE_URLS.superadmin}/api/users/${uid}/approve`,
    userUpdate: (uid: string) => `${SERVICE_URLS.superadmin}/api/users/${uid}`,
    userDelete: (uid: string) => `${SERVICE_URLS.superadmin}/api/users/${uid}`,
    packages: () => `${SERVICE_URLS.superadmin}/api/packages`,
    analytics: () => `${SERVICE_URLS.superadmin}/api/analytics`,
    system: () => `${SERVICE_URLS.superadmin}/api/system`
  },
  
  // Admin Service Endpoints
  admin: {
    organization: () => `${SERVICE_URLS.admin}/api/organizations`,
    organizationStats: () => `${SERVICE_URLS.admin}/api/organizations/stats`,
    users: () => `${SERVICE_URLS.admin}/api/users`,
    userInvite: () => `${SERVICE_URLS.admin}/api/invites`,
    packages: () => `${SERVICE_URLS.admin}/api/packages`,
    billing: () => `${SERVICE_URLS.admin}/api/billing`,
    userUpdate: (uid: string) => `${SERVICE_URLS.admin}/api/users/${uid}`
  },
  
  // Core Service Endpoints 
  core: {
    upload: () => `${SERVICE_URLS.core}/api/upload`,
    uploadSignedUrl: () => `${SERVICE_URLS.core}/api/upload/signed-url`,
    uploadBatch: () => `${SERVICE_URLS.core}/api/upload/batch`,
    process: (jobId: string) => `${SERVICE_URLS.core}/api/process/${jobId}`,
    results: (jobId: string) => `${SERVICE_URLS.core}/api/results/${jobId}`,
    resultsStream: (jobId: string) => `${SERVICE_URLS.core}/api/results/${jobId}/stream`,
    archive: () => `${SERVICE_URLS.core}/api/archive`,
    health: () => `${SERVICE_URLS.core}/health`
  }
}

// Service availability checker
export async function checkServiceHealth() {
  const healthChecks = await Promise.allSettled([
    fetch(`${SERVICE_URLS.superadmin}/health`).then(r => r.json()),
    fetch(`${SERVICE_URLS.admin}/health`).then(r => r.json()),
    fetch(`${SERVICE_URLS.core}/health`).then(r => r.json())
  ])

  return {
    superadmin: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : null,
    admin: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : null,
    core: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : null
  }
}

// Legacy API compatibility (for gradual migration)
export const getApiUrl = {
  // Map old endpoints to new service-based ones
  signedUrl: (encodedPath: string) => getServiceUrl.core.uploadSignedUrl(),
  archiveCompleted: () => getServiceUrl.core.archive(),
  
  // New service-based endpoints
  ...getServiceUrl
}