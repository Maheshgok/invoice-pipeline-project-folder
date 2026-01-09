/**
 * Centralized API Configuration
 * Manages all external service URLs and endpoints
 */

export const API_CONFIG = {
  // Cloud Run Services (Project ID: 812016027146 - watch-mail-trial)
  INITIAL_API_URL: import.meta.env.VITE_INITIAL_API_URL || 'https://initial-api-812016027146.asia-south1.run.app',
  ARCHIVE_API_URL: import.meta.env.VITE_ARCHIVE_API_URL || 'https://archive-manager-812016027146.asia-south1.run.app',
  QUEUE_API_URL: import.meta.env.VITE_QUEUE_API_URL || 'https://queue-processor-812016027146.asia-south1.run.app',
  
  // Endpoints
  ENDPOINTS: {
    // Initial API
    UPLOAD_INVOICE: '/upload_invoice',
    HEALTH: '/health',
    POLL_RESULT: '/poll-result',
    TRIGGER_PROCESSING: '/trigger-processing',
    CLOUD_TASKS_STATUS: '/cloud-tasks/status',
    CLOUD_TASKS_QUEUE_STATS: '/cloud-tasks/queue-stats',
    SIGNED_URL: '/signed-url',
    INITIALIZE_WORKSPACE: '/initialize-workspace',
    WORKSPACE_STATUS: '/workspace-status',
    
    // Archive API
    ARCHIVE_COMPLETED: '/archive-completed',
    ARCHIVE_DISPLAYED: '/archive-displayed', 
    ARCHIVE_ALL_OLD: '/archive-all-old',
    GET_ARCHIVED: '/get-archived',
    
    // Queue API
    PROCESS_FILE: '/process-file',
    PROCESS_FILE_CHUNKED: '/process-invoice-chunked',
    GET_RESULTS: '/get-results',
    JOB_STATUS: '/job-status',
    QUEUE_STATUS: '/queue-status'
  }
} as const

// Helper function to build full URLs
export const buildApiUrl = (service: keyof typeof API_CONFIG, endpoint?: string) => {
  const baseUrl = API_CONFIG[service]
  if (typeof baseUrl === 'string' && endpoint) {
    return `${baseUrl}${endpoint}`
  }
  return baseUrl
}

// Type-safe endpoint builders
export const getApiUrl = {
  // Initial API endpoints
  uploadInvoice: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.UPLOAD_INVOICE}`,
  health: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  pollResult: (requestId: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.POLL_RESULT}/${requestId}`,
  triggerProcessing: (requestId: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.TRIGGER_PROCESSING}/${requestId}`,
  cloudTasksStatus: (jobId: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.CLOUD_TASKS_STATUS}/${jobId}`,
  cloudTasksQueueStats: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.CLOUD_TASKS_QUEUE_STATS}`,
  signedUrl: (path?: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.SIGNED_URL}${path ? `?path=${path}` : ''}`,
  initializeWorkspace: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.INITIALIZE_WORKSPACE}`,
  workspaceStatus: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.WORKSPACE_STATUS}`,
  
  // Archive API endpoints  
  archiveCompleted: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.ARCHIVE_COMPLETED}`,
  archiveDisplayed: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.ARCHIVE_DISPLAYED}`,
  archiveAllOld: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.ARCHIVE_ALL_OLD}`,
  getArchived: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.GET_ARCHIVED}`,
  archiveHealth: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  
  // Queue API endpoints
  processFile: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.PROCESS_FILE}`,
  processFileChunked: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.PROCESS_FILE_CHUNKED}`,
  getResults: (userEmail: string) => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.GET_RESULTS}/${userEmail}`,
  jobStatus: (jobId: string) => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.JOB_STATUS}/${jobId}`,
  queueStatus: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.QUEUE_STATUS}`,
  queueHealth: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.HEALTH}`
}

export default API_CONFIG