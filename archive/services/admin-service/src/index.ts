import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import logger from './utils/logger'
import { errorHandler } from './middleware/errorHandler'
import { authenticate, requireAdmin } from './middleware/auth'

// Routes
import organizationRoutes from './routes/organizations'
import userRoutes from './routes/users'
import packageRoutes from './routes/packages'
import billingRoutes from './routes/billing'
import inviteRoutes from './routes/invites'

const app = express()
const port = process.env.PORT || 3002

// Initialize Firebase Admin
try {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID
  })
  logger.info('Firebase Admin initialized successfully')
} catch (error) {
  logger.error('Failed to initialize Firebase Admin:', error)
  process.exit(1)
}

export const db = getFirestore()
export const auth = getAuth()

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})
app.use(limiter)

// Body parsing
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true }))

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  })
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'admin-service',
    timestamp: new Date().toISOString()
  })
})

// Protected routes - Require admin role within organization
app.use('/api/organizations', authenticate, requireAdmin, organizationRoutes)
app.use('/api/users', authenticate, requireAdmin, userRoutes)
app.use('/api/packages', authenticate, requireAdmin, packageRoutes)
app.use('/api/billing', authenticate, requireAdmin, billingRoutes)
app.use('/api/invites', authenticate, requireAdmin, inviteRoutes)

// Error handling
app.use(errorHandler)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path 
  })
})

app.listen(port, () => {
  logger.info(`Admin Service running on port ${port}`)
})