// Shared API client utilities

export interface ServiceConfig {
  baseUrl: string
  timeout: number
  retries: number
}

export class ApiClient {
  private baseUrl: string
  private timeout: number
  private retries: number
  private authToken?: string

  constructor(config: ServiceConfig) {
    this.baseUrl = config.baseUrl
    this.timeout = config.timeout
    this.retries = config.retries
  }

  setAuthToken(token: string) {
    this.authToken = token
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    
    return headers
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint)
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>('POST', endpoint, data)
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>('PUT', endpoint, data)
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint)
  }

  private async request<T>(
    method: string, 
    endpoint: string, 
    data?: any,
    attempt: number = 1
  ): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: this.getHeaders(),
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (attempt < this.retries) {
        console.warn(`API request failed, retrying (${attempt}/${this.retries})...`)
        return this.request<T>(method, endpoint, data, attempt + 1)
      }
      throw error
    }
  }
}

// Service-specific client factories
export const createCoreServiceClient = (baseUrl: string) => 
  new ApiClient({ baseUrl, timeout: 30000, retries: 3 })

export const createAdminServiceClient = (baseUrl: string) => 
  new ApiClient({ baseUrl, timeout: 15000, retries: 2 })

export const createSuperAdminServiceClient = (baseUrl: string) => 
  new ApiClient({ baseUrl, timeout: 15000, retries: 2 })