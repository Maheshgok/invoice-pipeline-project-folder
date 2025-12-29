import express from 'express'
import { db } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import { AuthenticatedRequest } from '../middleware/auth'
import logger from '../utils/logger'

const router = express.Router()

// GET /api/billing - Get billing information for organization
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    const snapshot = await db.collection('billing')
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
    
    const billingRecords = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    res.json({
      success: true,
      data: billingRecords
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/billing/usage - Get usage statistics
router.get('/usage', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    // Get current month usage
    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)
    
    const invoicesSnapshot = await db.collectionGroup('invoice_results')
      .where('organizationId', '==', organizationId)
      .where('createdAt', '>=', thisMonth)
      .get()
    
    res.json({
      success: true,
      data: {
        currentMonth: {
          processed: invoicesSnapshot.size,
          period: `${thisMonth.toISOString().slice(0, 7)}`
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router