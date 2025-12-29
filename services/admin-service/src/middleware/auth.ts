import { Request, Response, NextFunction } from 'express'
import { auth } from '../index'
import logger from '../utils/logger'

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string
    email: string
    role: string
    organizationId?: string
  }
}

export async function authenticate(
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }

    const token = authHeader.substring(7)
    const decodedToken = await auth.verifyIdToken(token)
    
    // Get user custom claims for role info
    const userRecord = await auth.getUser(decodedToken.uid)
    const customClaims = userRecord.customClaims || {}

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      role: customClaims.role || 'user',
      organizationId: customClaims.organizationId
    }

    next()
  } catch (error) {
    logger.error('Authentication failed:', error)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  if (!['admin', 'superadmin'].includes(req.user.role)) {
    logger.warn(`Access denied for user ${req.user.uid} with role ${req.user.role}`)
    return res.status(403).json({ error: 'Admin access required' })
  }

  next()
}

export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Required role: ${roles.join(' or ')}` })
    }

    next()
  }
}