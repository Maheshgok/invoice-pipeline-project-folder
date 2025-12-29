import express from 'express'
import { db } from '../index'
import logger from '../utils/logger'

const router = express.Router()

// GET /api/analytics/dashboard - Get system-wide analytics
router.get('/dashboard', async (req, res, next) => {
  try {
    // Get user statistics
    const usersSnapshot = await db.collection('users').get()
    const usersByStatus = { pending: 0, approved: 0, rejected: 0 }
    
    usersSnapshot.docs.forEach(doc => {
      const status = doc.data().approvalStatus || 'approved'
      if (status in usersByStatus) {
        usersByStatus[status as keyof typeof usersByStatus]++
      }
    })
    
    // Get organization statistics
    const orgsSnapshot = await db.collection('organizations').get()
    
    // Get invoice processing statistics
    const invoicesSnapshot = await db.collectionGroup('invoice_results').get()
    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)
    
    let monthlyProcessed = 0
    let totalProcessed = 0
    const statusCounts = { completed: 0, pending: 0, error: 0 }
    
    invoicesSnapshot.docs.forEach(doc => {
      const data = doc.data()
      totalProcessed++
      
      if (data.createdAt?.toDate() >= thisMonth) {
        monthlyProcessed++
      }
      
      const status = data.status || 'pending'
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts]++
      }
    })
    
    res.json({
      success: true,
      data: {
        users: {
          total: usersSnapshot.size,
          ...usersByStatus
        },
        organizations: {
          total: orgsSnapshot.size
        },
        processing: {
          totalProcessed,
          monthlyProcessed,
          ...statusCounts
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/analytics/usage - Get usage statistics
router.get('/usage', async (req, res, next) => {
  try {
    const { period = '30' } = req.query
    const days = parseInt(period as string)
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    const invoicesSnapshot = await db.collectionGroup('invoice_results')
      .where('createdAt', '>=', startDate)
      .orderBy('createdAt', 'desc')
      .get()
    
    // Group by date
    const dailyStats: Record<string, number> = {}
    
    invoicesSnapshot.docs.forEach(doc => {
      const data = doc.data()
      const date = data.createdAt?.toDate().toISOString().split('T')[0]
      if (date) {
        dailyStats[date] = (dailyStats[date] || 0) + 1
      }
    })
    
    res.json({
      success: true,
      data: {
        period: `${days} days`,
        totalRequests: invoicesSnapshot.size,
        dailyBreakdown: dailyStats
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router