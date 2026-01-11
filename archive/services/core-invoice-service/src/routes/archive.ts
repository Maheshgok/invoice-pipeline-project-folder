import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth'
import { db } from '../index'
import logger from '../utils/logger'

const router = Router()

// Get archived results
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = '1', limit = '20', dateFrom, dateTo } = req.query

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/archived_results`
      : `users/${req.user!.uid}/archived_results`

    let query = db.collection(userCollectionPath)
      .orderBy('archivedAt', 'desc')
      .limit(parseInt(limit as string))
      .offset((parseInt(page as string) - 1) * parseInt(limit as string))

    if (dateFrom) {
      query = query.where('archivedAt', '>=', new Date(dateFrom as string))
    }
    
    if (dateTo) {
      query = query.where('archivedAt', '<=', new Date(dateTo as string))
    }

    const snapshot = await query.get()
    const archived = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    res.json({
      archived,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total: snapshot.size
    })

  } catch (error) {
    logger.error('Error fetching archived results:', error)
    res.status(500).json({ error: 'Failed to fetch archived results' })
  }
})

// Archive active results
router.post('/create', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resultIds } = req.body

    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
      res.status(400).json({ error: 'Result IDs array is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    const archivedCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/archived_results`
      : `users/${req.user!.uid}/archived_results`

    const batch = db.batch()
    let archivedCount = 0

    for (const resultId of resultIds) {
      const resultDoc = await db.collection(userCollectionPath).doc(resultId).get()
      
      if (resultDoc.exists) {
        const resultData = resultDoc.data()
        
        // Add to archived collection
        const archivedDoc = db.collection(archivedCollectionPath).doc(resultId)
        batch.set(archivedDoc, {
          ...resultData,
          archivedAt: new Date(),
          archivedBy: req.user!.uid
        })
        
        // Remove from active collection
        batch.delete(resultDoc.ref)
        archivedCount++
      }
    }

    await batch.commit()

    logger.info(`Archived ${archivedCount} results for user ${req.user!.uid}`)

    res.json({
      success: true,
      archivedCount,
      message: `${archivedCount} results archived successfully`
    })

  } catch (error) {
    logger.error('Error archiving results:', error)
    res.status(500).json({ error: 'Failed to archive results' })
  }
})

// Restore archived results
router.post('/restore', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resultIds } = req.body

    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
      res.status(400).json({ error: 'Result IDs array is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    const archivedCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/archived_results`
      : `users/${req.user!.uid}/archived_results`

    const batch = db.batch()
    let restoredCount = 0

    for (const resultId of resultIds) {
      const archivedDoc = await db.collection(archivedCollectionPath).doc(resultId).get()
      
      if (archivedDoc.exists) {
        const archivedData = archivedDoc.data()
        
        // Remove archive fields and add to active collection
        const { archivedAt, archivedBy, ...originalData } = archivedData!
        const restoredDoc = db.collection(userCollectionPath).doc(resultId)
        batch.set(restoredDoc, {
          ...originalData,
          restoredAt: new Date(),
          restoredBy: req.user!.uid
        })
        
        // Remove from archived collection
        batch.delete(archivedDoc.ref)
        restoredCount++
      }
    }

    await batch.commit()

    logger.info(`Restored ${restoredCount} results for user ${req.user!.uid}`)

    res.json({
      success: true,
      restoredCount,
      message: `${restoredCount} results restored successfully`
    })

  } catch (error) {
    logger.error('Error restoring results:', error)
    res.status(500).json({ error: 'Failed to restore results' })
  }
})

// Permanently delete archived results
router.delete('/permanent', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resultIds } = req.body

    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
      res.status(400).json({ error: 'Result IDs array is required' })
      return
    }

    const archivedCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/archived_results`
      : `users/${req.user!.uid}/archived_results`

    const batch = db.batch()
    let deletedCount = 0

    for (const resultId of resultIds) {
      const archivedDoc = await db.collection(archivedCollectionPath).doc(resultId).get()
      
      if (archivedDoc.exists) {
        batch.delete(archivedDoc.ref)
        deletedCount++
      }
    }

    await batch.commit()

    logger.warn(`Permanently deleted ${deletedCount} archived results for user ${req.user!.uid}`)

    res.json({
      success: true,
      deletedCount,
      message: `${deletedCount} results permanently deleted`
    })

  } catch (error) {
    logger.error('Error permanently deleting results:', error)
    res.status(500).json({ error: 'Failed to permanently delete results' })
  }
})

export default router