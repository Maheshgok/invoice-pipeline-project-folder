import { Request, Response, NextFunction } from 'express'
import logger from '../utils/logger'

export interface AppError extends Error {
  statusCode?: number
  isOperational?: boolean
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = error.statusCode || 500
  const message = error.message || 'Internal Server Error'

  logger.error('API Error:', {
    error: message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    statusCode
  })

  // Don't expose stack traces in production
  const response: any = {
    error: message,
    timestamp: new Date().toISOString(),
    path: req.path
  }

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack
  }

  res.status(statusCode).json(response)
}

export class ValidationError extends Error {
  statusCode = 400
  isOperational = true

  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  statusCode = 404
  isOperational = true

  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class QuotaExceededError extends Error {
  statusCode = 429
  isOperational = true

  constructor(message: string = 'Usage quota exceeded') {
    super(message)
    this.name = 'QuotaExceededError'
  }
}