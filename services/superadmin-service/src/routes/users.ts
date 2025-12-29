import express from 'express'
import { db, auth } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import { AuthenticatedRequest } from '../middleware/auth'
import logger from '../utils/logger'
import Joi from 'joi'

const router = express.Router()

// Validation schemas
const userApprovalSchema = Joi.object({
  uid: Joi.string().required(),
  approved: Joi.boolean().required(),
  role: Joi.string().valid('user', 'admin').optional(),
  organizationId: Joi.string().optional()
})

const userUpdateSchema = Joi.object({
  role: Joi.string().valid('user', 'admin', 'superadmin').optional(),
  organizationId: Joi.string().optional(),
  packageId: Joi.string().optional()
})

// GET /api/users - Get all users (with pagination)
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string // pending, approved, all
    
    let query = db.collection('users')
    
    if (status && status !== 'all') {
      query = query.where('approvalStatus', '==', status) as any
    }
    
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .get()
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    // Get total count for pagination
    const totalSnapshot = await query.get()
    const total = totalSnapshot.size
    
    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/users/pending - Get users pending approval
router.get('/pending', async (req: AuthenticatedRequest, res, next) => {
  try {
    const snapshot = await db.collection('users')
      .where('approvalStatus', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get()
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    res.json({
      success: true,
      data: users
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/users/:uid/approve - Approve/reject user
router.post('/:uid/approve', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { error, value } = userApprovalSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details[0].message)
    }
    
    const { uid } = req.params
    const { approved, role, organizationId } = value
    
    // Update user document
    const userRef = db.collection('users').doc(uid)
    const userDoc = await userRef.get()
    
    if (!userDoc.exists) {
      throw new NotFoundError('User not found')
    }
    
    const updateData: any = {
      approvalStatus: approved ? 'approved' : 'rejected',
      approvedAt: new Date(),
      approvedBy: req.user!.uid
    }
    
    if (approved) {
      // Set custom claims for approved user
      const customClaims: any = { role: role || 'user' }
      if (organizationId) {
        customClaims.organizationId = organizationId
        updateData.organizationId = organizationId
      }
      
      await auth.setCustomUserClaims(uid, customClaims)
      updateData.role = role || 'user'
    }
    
    await userRef.update(updateData)
    
    logger.info(`User ${uid} ${approved ? 'approved' : 'rejected'} by SuperAdmin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: `User ${approved ? 'approved' : 'rejected'} successfully`
    })
  } catch (error) {
    next(error)
  }
})

// PUT /api/users/:uid - Update user
router.put('/:uid', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { error, value } = userUpdateSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details[0].message)
    }
    
    const { uid } = req.params
    const { role, organizationId, packageId } = value
    
    const userRef = db.collection('users').doc(uid)
    const userDoc = await userRef.get()
    
    if (!userDoc.exists) {
      throw new NotFoundError('User not found')
    }
    
    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: req.user!.uid
    }
    
    // Update custom claims if role or organizationId changed
    if (role || organizationId !== undefined) {
      const currentUser = await auth.getUser(uid)
      const currentClaims = currentUser.customClaims || {}
      
      const newClaims = { ...currentClaims }
      if (role) newClaims.role = role
      if (organizationId !== undefined) newClaims.organizationId = organizationId
      
      await auth.setCustomUserClaims(uid, newClaims)
    }
    
    if (role) updateData.role = role
    if (organizationId !== undefined) updateData.organizationId = organizationId
    if (packageId) updateData.packageId = packageId
    
    await userRef.update(updateData)
    
    logger.info(`User ${uid} updated by SuperAdmin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'User updated successfully'
    })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/users/:uid - Delete user
router.delete('/:uid', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { uid } = req.params
    
    // Delete from Firebase Auth
    await auth.deleteUser(uid)
    
    // Delete from Firestore
    await db.collection('users').doc(uid).delete()
    
    logger.info(`User ${uid} deleted by SuperAdmin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error) {
    next(error)
  }
})

export default router