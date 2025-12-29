import express from 'express'
import { db } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import Joi from 'joi'

const router = express.Router()

// Validation schemas
const packageCreateSchema = Joi.object({
  name: Joi.string().required().min(3).max(100),
  type: Joi.string().valid('consumption_based', 'time_based').required(),
  duration: Joi.number().required().min(1),
  analysisLimit: Joi.number().required().min(1),
  price: Joi.number().required().min(0),
  currency: Joi.string().required().length(3),
  features: Joi.array().items(Joi.string()).required(),
  isActive: Joi.boolean().default(true),
  isUnlimited: Joi.boolean().default(false)
})

// GET /api/packages - Get all packages
router.get('/', async (req, res, next) => {
  try {
    const snapshot = await db.collection('packages')
      .orderBy('createdAt', 'desc')
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

// POST /api/packages - Create new package
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = packageCreateSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details[0].message)
    }
    
    const packageData = {
      ...value,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: req.user!.uid
    }
    
    const packageRef = await db.collection('packages').add(packageData)
    
    logger.info(`Package ${packageRef.id} created by SuperAdmin ${req.user!.uid}`)
    
    res.status(201).json({
      success: true,
      data: {
        id: packageRef.id,
        ...packageData
      },
      message: 'Package created successfully'
    })
  } catch (error) {
    next(error)
  }
})

// PUT /api/packages/:id - Update package
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { error, value } = packageCreateSchema.validate(req.body)
    if (error) {
      throw new ValidationError(error.details[0].message)
    }
    
    const packageRef = db.collection('packages').doc(id)
    const packageDoc = await packageRef.get()
    
    if (!packageDoc.exists) {
      throw new NotFoundError('Package not found')
    }
    
    const updateData = {
      ...value,
      updatedAt: new Date(),
      updatedBy: req.user!.uid
    }
    
    await packageRef.update(updateData)
    
    logger.info(`Package ${id} updated by SuperAdmin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'Package updated successfully'
    })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/packages/:id - Delete package
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    
    const packageRef = db.collection('packages').doc(id)
    const packageDoc = await packageRef.get()
    
    if (!packageDoc.exists) {
      throw new NotFoundError('Package not found')
    }
    
    await packageRef.delete()
    
    logger.info(`Package ${id} deleted by SuperAdmin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'Package deleted successfully'
    })
  } catch (error) {
    next(error)
  }
})

export default router