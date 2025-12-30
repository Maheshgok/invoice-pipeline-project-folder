import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth'
import { db } from '../index'
import logger from '../utils/logger'

const router = Router()

// Get all results for user
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = '1', limit = '20', status } = req.query

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    let query = db.collection(userCollectionPath)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit as string))
      .offset((parseInt(page as string) - 1) * parseInt(limit as string))

    if (status) {
      query = query.where('status', '==', status)
    }

    const snapshot = await query.get()
    const results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    res.json({
      results,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total: snapshot.size
    })

  } catch (error) {
    logger.error('Error fetching results:', error)
    res.status(500).json({ error: 'Failed to fetch results' })
  }
})

// Get specific result by ID
router.get('/:resultId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resultId } = req.params
    if (!resultId) {
      res.status(400).json({ error: 'Result ID is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    const resultDoc = await db.collection(userCollectionPath).doc(resultId).get()
    if (!resultDoc.exists) {
      res.status(404).json({ error: 'Result not found' })
      return
    }

    res.json({
      id: resultDoc.id,
      ...resultDoc.data()
    })

  } catch (error) {
    logger.error('Error fetching result:', error)
    res.status(500).json({ error: 'Failed to fetch result' })
  }
})

// Download results as CSV
router.get('/download/csv', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    const snapshot = await db.collection(userCollectionPath)
      .orderBy('createdAt', 'desc')
      .get()

    if (snapshot.empty) {
      res.status(404).json({ error: 'No results found' })
      return
    }

    const results = snapshot.docs.map(doc => doc.data())
    
    // Convert to CSV format
    const headers = ['Date', 'File Name', 'Invoice Number', 'Amount', 'Vendor', 'Status']
    const csvContent = [
      headers.join(','),
      ...results.map(result => [
        new Date(result.createdAt).toLocaleDateString(),
        result.fileName || 'N/A',
        result.invoiceNumber || 'N/A',
        result.amount || 'N/A',
        result.vendor || 'N/A',
        result.status || 'N/A'
      ].join(','))
    ].join('\\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=invoice_results.csv')
    res.send(csvContent)

    logger.info(`CSV download requested by user ${req.user!.uid}`)

  } catch (error) {
    logger.error('Error generating CSV:', error)
    res.status(500).json({ error: 'Failed to generate CSV' })
  }
})

// Update result status
router.patch('/:resultId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resultId } = req.params
    const { status, notes } = req.body

    if (!resultId) {
      res.status(400).json({ error: 'Result ID is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    const resultDoc = await db.collection(userCollectionPath).doc(resultId).get()
    if (!resultDoc.exists) {
      res.status(404).json({ error: 'Result not found' })
      return
    }

    const updateData: any = {
      updatedAt: new Date()
    }

    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    await resultDoc.ref.update(updateData)

    res.json({
      success: true,
      resultId,
      message: 'Result updated successfully'
    })

  } catch (error) {
    logger.error('Error updating result:', error)
    res.status(500).json({ error: 'Failed to update result' })
  }
})

// Delete result
router.delete('/:resultId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { resultId } = req.params
    if (!resultId) {
      res.status(400).json({ error: 'Result ID is required' })
      return
    }

    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/results`
      : `users/${req.user!.uid}/results`

    const resultDoc = await db.collection(userCollectionPath).doc(resultId).get()
    if (!resultDoc.exists) {
      res.status(404).json({ error: 'Result not found' })
      return
    }

    await resultDoc.ref.delete()

    logger.info(`Result ${resultId} deleted by user ${req.user!.uid}`)

    res.json({
      success: true,
      resultId,
      message: 'Result deleted successfully'
    })

  } catch (error) {
    logger.error('Error deleting result:', error)
    res.status(500).json({ error: 'Failed to delete result' })
  }
})

export default router