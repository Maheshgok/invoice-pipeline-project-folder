import express from 'express'
import { db, auth } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import { AuthenticatedRequest } from '../middleware/auth'
import logger from '../utils/logger'
import Joi from 'joi'

const router = express.Router()

// Validation schemas
const userInviteSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('user', 'admin').default('user')
})

const userUpdateSchema = Joi.object({
  role: Joi.string().valid('user', 'admin').optional(),
  packageId: Joi.string().optional()
})

// GET /api/users - Get organization users
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    const { organizationId } = req.user
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    const snapshot = await db.collection('users')
      .where('organizationId', '==', organizationId)
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

// POST /api/users/invite - Invite user to organization
router.post('/invite', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user?.organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    const { organizationId } = req.user
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    const { error, value } = userInviteSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details?.[0]?.message || 'Validation failed')
    }
    
    const { email, role } = value
    
    // Check if user already exists
    const existingUserSnapshot = await db.collection('users')
      .where('email', '==', email)
      .get()
    
    if (!existingUserSnapshot.empty) {
      throw new ValidationError('User with this email already exists')
    }
    
    // Create invitation record
    const invitationData = {
      email,
      role,
      organizationId,
      invitedBy: req.user!.uid,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
    
    const inviteRef = await db.collection('invitations').add(invitationData)
    
    // TODO: Send invitation email
    logger.info(`User ${email} invited to organization ${organizationId} by admin ${req.user!.uid}`)
    
    res.status(201).json({
      success: true,
      data: {
        id: inviteRef.id,
        ...invitationData
      },
      message: 'Invitation sent successfully'
    })
  } catch (error) {
    next(error)
  }
})

// PUT /api/users/:uid - Update user in organization
router.put('/:uid', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { uid } = req.params
    if (!uid) {
      throw new ValidationError('User ID is required')
    }
    
    if (!req.user?.organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    const { organizationId } = req.user
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    const { error, value } = userUpdateSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details?.[0]?.message || 'Validation failed')
    }
    
    // Verify user belongs to same organization
    const userDoc = await db.collection('users').doc(uid).get()
    
    if (!userDoc.exists) {
      throw new NotFoundError('User not found')
    }
    
    const userData = userDoc.data()!
    if (userData.organizationId !== organizationId) {
      throw new ValidationError('User does not belong to your organization')
    }
    
    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: req.user!.uid
    }
    
    // Update custom claims if role changed
    if (value.role) {
      const userRecord = await auth.getUser(uid)
      const currentClaims = userRecord.customClaims || {}
      
      await auth.setCustomUserClaims(uid, {
        ...currentClaims,
        role: value.role
      })
      
      updateData.role = value.role
    }
    
    if (value.packageId) {
      updateData.packageId = value.packageId
    }
    
    await db.collection('users').doc(uid).update(updateData)
    
    logger.info(`User ${uid} updated by admin ${req.user.uid}`)
    
    res.json({
      success: true,
      message: 'User updated successfully'
    })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/users/:uid - Remove user from organization
router.delete('/:uid', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { uid } = req.params
    if (!uid) {
      throw new ValidationError('User ID is required')
    }
    
    if (!req.user?.organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    const { organizationId } = req.user
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    // Verify user belongs to same organization
    const userDoc = await db.collection('users').doc(uid).get()
    
    if (!userDoc.exists) {
      throw new NotFoundError('User not found')
    }
    
    const userData = userDoc.data()!
    if (userData.organizationId !== organizationId) {
      throw new ValidationError('User does not belong to your organization')
    }
    
    // Update user to remove from organization (don't delete the user)
    await db.collection('users').doc(uid).update({
      organizationId: null,
      role: 'user',
      updatedAt: new Date(),
      updatedBy: req.user!.uid
    })
    
    // Remove organization from custom claims
    const userRecord = await auth.getUser(uid)
    const currentClaims = userRecord.customClaims || {}
    const { organizationId: _, ...newClaims } = currentClaims
    
    await auth.setCustomUserClaims(uid, {
      ...newClaims,
      role: 'user'
    })
    
    logger.info(`User ${uid} removed from organization ${organizationId} by admin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'User removed from organization'
    })
  } catch (error) {
    next(error)
  }
})

export default router