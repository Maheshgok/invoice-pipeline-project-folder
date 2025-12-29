import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import logger from './utils/logger'
import { errorHandler } from './middleware/errorHandler'
import { authenticate, requireSuperAdmin } from './middleware/auth'

// Routes
import userRoutes from './routes/users'
import packageRoutes from './routes/packages'
import analyticsRoutes from './routes/analytics'
import systemRoutes from './routes/system'

const app = express()
const port = process.env.PORT || 3001

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

// Rate limiting - stricter for SuperAdmin
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})
app.use(limiter)

// Body parsing
app.use(express.json({ limit: '10mb' }))
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
    service: 'superadmin-service',
    timestamp: new Date().toISOString()
  })
})

// Protected routes - All require SuperAdmin role
app.use('/api/users', authenticate, requireSuperAdmin, userRoutes)
app.use('/api/packages', authenticate, requireSuperAdmin, packageRoutes)
app.use('/api/analytics', authenticate, requireSuperAdmin, analyticsRoutes)
app.use('/api/system', authenticate, requireSuperAdmin, systemRoutes)

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
  logger.info(`SuperAdmin Service running on port ${port}`)
})