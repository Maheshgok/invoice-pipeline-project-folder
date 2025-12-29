import express from 'express'
import { db } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import { AuthenticatedRequest } from '../middleware/auth'
import logger from '../utils/logger'
import Joi from 'joi'

const router = express.Router()

// GET /api/packages - Get available packages for organization
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const snapshot = await db.collection('packages')
      .where('isActive', '==', true)
      .orderBy('price', 'asc')
      .get()
    
    const packages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    res.json({
      success: true,
      data: packages
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/packages/:id/assign - Assign package to organization
router.post('/:id/assign', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id: packageId } = req.params
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    // Verify package exists
    const packageDoc = await db.collection('packages').doc(packageId).get()
    if (!packageDoc.exists) {
      throw new NotFoundError('Package not found')
    }
    
    // Update organization with package
    await db.collection('organizations').doc(organizationId).update({
      packageId,
      updatedAt: new Date(),
      updatedBy: req.user!.uid
    })
    
    // Create billing record
    const billingData = {
      organizationId,
      packageId,
      userId: req.user!.uid,
      status: 'active',
      startDate: new Date(),
      createdAt: new Date()
    }
    
    await db.collection('billing').add(billingData)
    
    logger.info(`Package ${packageId} assigned to organization ${organizationId}`)
    
    res.json({
      success: true,
      message: 'Package assigned successfully'
    })
  } catch (error) {
    next(error)
  }
})

export default router