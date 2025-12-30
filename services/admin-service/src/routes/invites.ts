import express from 'express'
import { db } from '../index'
import { ValidationError, NotFoundError } from '../middleware/errorHandler'
import { AuthenticatedRequest } from '../middleware/auth'
import logger from '../utils/logger'

const router = express.Router()

// GET /api/invites - Get pending invitations for organization
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    const snapshot = await db.collection('invitations')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get()
    
    const invitations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    res.json({
      success: true,
      data: invitations
    })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/invites/:id - Cancel invitation
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params
    const { organizationId } = req.user!
    
    if (!organizationId) {
      throw new ValidationError('User not associated with an organization')
    }
    
    const { id: inviteId } = req.params
  if (!inviteId) {
    res.status(400).json({ error: 'Invite ID is required' })
    return
  }
  
  const inviteDoc = await db.collection('invitations').doc(inviteId).get()
    
    if (!inviteDoc.exists) {
      throw new NotFoundError('Invitation not found')
    }
    
    const inviteData = inviteDoc.data()!
    
    if (inviteData.organizationId !== organizationId) {
      throw new ValidationError('Invitation does not belong to your organization')
    }
    
    await inviteDoc.ref.delete()
    
    logger.info(`Invitation ${id} cancelled by admin ${req.user!.uid}`)
    
    res.json({
      success: true,
      message: 'Invitation cancelled successfully'
    })
  } catch (error) {
    next(error)
  }
})

export default router