import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth'
import { db } from '../index'
import logger from '../utils/logger'

const router = Router()

// Start invoice processing job
router.post('/start/:jobId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/jobs`
      : `users/${req.user!.uid}/jobs`

    // Get job details
    const jobDoc = await db.collection(userCollectionPath).doc(jobId).get()
    if (!jobDoc.exists) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    const jobData = jobDoc.data()
    
    // Update job status to processing
    await jobDoc.ref.update({
      status: 'processing',
      processingStartedAt: new Date(),
      updatedAt: new Date()
    })

    // Here you would typically trigger the actual processing
    // For now, we'll simulate by updating the status
    logger.info(`Processing started for job ${jobId}`)

    res.json({
      success: true,
      jobId,
      status: 'processing',
      message: 'Invoice processing started'
    })

  } catch (error) {
    logger.error('Error starting job processing:', error)
    res.status(500).json({ error: 'Failed to start processing' })
  }
})

// Get processing status
router.get('/status/:jobId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/jobs`
      : `users/${req.user!.uid}/jobs`

    const jobDoc = await db.collection(userCollectionPath).doc(jobId).get()
    if (!jobDoc.exists) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    const jobData = jobDoc.data()
    
    res.json({
      jobId,
      status: jobData?.status || 'unknown',
      progress: jobData?.progress || 0,
      processedFiles: jobData?.processedFiles || 0,
      totalFiles: jobData?.totalFiles || 0,
      createdAt: jobData?.createdAt,
      updatedAt: jobData?.updatedAt
    })

  } catch (error) {
    logger.error('Error getting job status:', error)
    res.status(500).json({ error: 'Failed to get job status' })
  }
})

// Cancel processing job
router.post('/cancel/:jobId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/jobs`
      : `users/${req.user!.uid}/jobs`

    const jobDoc = await db.collection(userCollectionPath).doc(jobId).get()
    if (!jobDoc.exists) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    await jobDoc.ref.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date()
    })

    logger.info(`Job ${jobId} cancelled by user ${req.user!.uid}`)

    res.json({
      success: true,
      jobId,
      status: 'cancelled',
      message: 'Job cancelled successfully'
    })

  } catch (error) {
    logger.error('Error cancelling job:', error)
    res.status(500).json({ error: 'Failed to cancel job' })
  }
})

export default router