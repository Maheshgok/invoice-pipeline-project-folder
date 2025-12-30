import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth'
import { db } from '../index'
import logger from '../utils/logger'

const router = Router()

// Get system analytics
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user statistics
    const usersSnapshot = await db.collection('users').get()
    const totalUsers = usersSnapshot.size
    
    // Get organization statistics  
    const orgsSnapshot = await db.collection('organizations').get()
    const totalOrganizations = orgsSnapshot.size

    // Get package usage statistics
    const packagesSnapshot = await db.collection('packages').get()
    const totalPackages = packagesSnapshot.size

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentUsersSnapshot = await db.collection('users')
      .where('createdAt', '>=', thirtyDaysAgo)
      .get()
    
    const analytics = {
      users: {
        total: totalUsers,
        recentSignups: recentUsersSnapshot.size,
        active: 0 // You can add logic to calculate active users
      },
      organizations: {
        total: totalOrganizations,
        active: 0 // You can add logic to calculate active orgs
      },
      packages: {
        total: totalPackages,
        mostPopular: 'Basic' // You can add logic to find most used package
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      }
    }

    res.json({ analytics })
  } catch (error) {
    logger.error('Error fetching analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

// Get detailed user analytics
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { period = '30d' } = req.query
    
    let startDate: Date
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }

    const usersSnapshot = await db.collection('users')
      .where('createdAt', '>=', startDate)
      .orderBy('createdAt', 'desc')
      .get()

    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      email: doc.data().email,
      createdAt: doc.data().createdAt,
      status: doc.data().status,
      organizationId: doc.data().organizationId
    }))

    res.json({ 
      users,
      period,
      count: users.length 
    })
  } catch (error) {
    logger.error('Error fetching user analytics:', error)
    res.status(500).json({ error: 'Failed to fetch user analytics' })
  }
})

// Get usage analytics
router.get('/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // This would typically connect to your usage tracking system
    // For now, returning mock data structure
    const usage = {
      uploads: {
        total: 0,
        thisMonth: 0,
        avgPerUser: 0
      },
      storage: {
        totalGB: 0,
        usedGB: 0,
        availableGB: 0
      },
      processing: {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        avgProcessingTime: 0
      }
    }

    res.json({ usage })
  } catch (error) {
    logger.error('Error fetching usage analytics:', error)
    res.status(500).json({ error: 'Failed to fetch usage analytics' })
  }
})

export default router