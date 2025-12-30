import { Request, Response, NextFunction } from 'express'
import { auth, db } from '../index'
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
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' })
      return
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
    return
  }
}

export function requireValidUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  // Check if user is approved (for regular users)
  if (req.user.role === 'user') {
    // In a real implementation, check user approval status from database
    // For now, assume all authenticated users are valid
  }

  next()
}