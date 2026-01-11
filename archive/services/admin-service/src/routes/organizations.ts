import express from 'express'
import { db } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import { AuthenticatedRequest } from '../middleware/auth'
import logger from '../utils/logger'
import Joi from 'joi'

const router = express.Router()

// Validation schemas
const organizationCreateSchema = Joi.object({
  name: Joi.string().required().min(3).max(100),
  domain: Joi.string().optional(),
  industry: Joi.string().optional(),
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().required(),
    zipCode: Joi.string().required()
  }).required(),
  settings: Joi.object({
    allowSelfSignup: Joi.boolean().default(false),
    requireApproval: Joi.boolean().default(true),
    maxUsers: Joi.number().optional()
  }).optional()
})

const organizationUpdateSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  domain: Joi.string().optional(),
  industry: Joi.string().optional(),
  address: Joi.object({
    street: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    country: Joi.string(),
    zipCode: Joi.string()
  }).optional(),
  settings: Joi.object({
    allowSelfSignup: Joi.boolean(),
    requireApproval: Joi.boolean(),
    maxUsers: Joi.number()
  }).optional()
})

// GET /api/organizations - Get admin's organization
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new NotFoundError('User is not associated with an organization')
    }
    
    const orgDoc = await db.collection('organizations').doc(organizationId).get()
    
    if (!orgDoc.exists) {
      throw new NotFoundError('Organization not found')
    }
    
    res.json({
      success: true,
      data: {
        id: orgDoc.id,
        ...orgDoc.data()
      }
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/organizations - Create new organization (for new admins)
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { error, value } = organizationCreateSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details?.[0]?.message || 'Validation failed')
    }
    
    // Check if user already has an organization
    if (req.user!.organizationId) {
      throw new ValidationError('User already belongs to an organization')
    }
    
    const organizationData = {
      ...value,
      adminUserId: req.user!.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        allowSelfSignup: false,
        requireApproval: true,
        ...value.settings
      }
    }
    
    const orgRef = await db.collection('organizations').add(organizationData)
    
    // Update user with organization ID
    await db.collection('users').doc(req.user!.uid).update({
      organizationId: orgRef.id,
      role: 'admin',
      updatedAt: new Date()
    })
    
    logger.info(`Organization ${orgRef.id} created by admin ${req.user!.uid}`)
    
    res.status(201).json({
      success: true,
      data: {
        id: orgRef.id,
        ...organizationData
      },
      message: 'Organization created successfully'
    })
  } catch (error) {
    next(error)
  }
})

// PUT /api/organizations - Update organization
router.put('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new NotFoundError('User is not associated with an organization')
    }
    
    const { error, value } = organizationUpdateSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details?.[0]?.message || 'Validation failed')
    }
    
    const updateData = {
      ...value,
      updatedAt: new Date(),
      updatedBy: req.user!.uid
    }
    
    await db.collection('organizations').doc(organizationId).update(updateData)
    
    logger.info(`Organization ${organizationId} updated by admin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'Organization updated successfully'
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/organizations/stats - Get organization statistics
router.get('/stats', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new NotFoundError('User is not associated with an organization')
    }
    
    // Get user count
    const usersSnapshot = await db.collection('users')
      .where('organizationId', '==', organizationId)
      .get()
    
    // Get invoice processing stats
    const invoicesSnapshot = await db.collectionGroup('invoice_results')
      .where('organizationId', '==', organizationId)
      .get()
    
    const usersByStatus = {
      pending: 0,
      approved: 0,
      rejected: 0
    }
    
    usersSnapshot.docs.forEach(doc => {
      const status = doc.data().approvalStatus || 'approved'
      if (status in usersByStatus) {
        usersByStatus[status as keyof typeof usersByStatus]++
      }
    })
    
    const invoiceStats = {
      total: invoicesSnapshot.size,
      thisMonth: 0,
      completed: 0,
      pending: 0
    }
    
    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)
    
    invoicesSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.createdAt?.toDate() >= thisMonth) {
        invoiceStats.thisMonth++
      }
      if (data.status === 'completed') {
        invoiceStats.completed++
      } else if (data.status === 'pending' || data.status === 'processing') {
        invoiceStats.pending++
      }
    })
    
    res.json({
      success: true,
      data: {
        users: {
          total: usersSnapshot.size,
          ...usersByStatus
        },
        invoices: invoiceStats
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router