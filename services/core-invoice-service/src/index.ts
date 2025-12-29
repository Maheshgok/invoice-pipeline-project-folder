import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { Storage } from '@google-cloud/storage'
import logger from './utils/logger'
import { errorHandler } from './middleware/errorHandler'
import { authenticate, requireValidUser } from './middleware/auth'

// Routes
import uploadRoutes from './routes/upload'
import processRoutes from './routes/process'
import resultsRoutes from './routes/results'
import archiveRoutes from './routes/archive'

const app = express()
const port = process.env.PORT || 3003

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
export const storage = new Storage()

// Configure multer for file uploads
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedMimes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'application/pdf'
    ]
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false)
    }
  }
})

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}))

// Rate limiting - More generous for file uploads
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
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type')
  })
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'core-invoice-service',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  })
})

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Core Invoice Processing Service',
    description: 'Generic, reusable invoice processing API',
    version: '1.0.0',
    endpoints: {
      upload: 'POST /api/upload - Upload files for processing',
      process: 'POST /api/process/:jobId - Process uploaded files', 
      results: 'GET /api/results/:jobId - Get processing results',
      archive: 'POST /api/archive - Archive completed jobs'
    },
    features: [
      'Multi-file upload support',
      'Real-time processing updates', 
      'OCR with OpenAI Vision API',
      'Automatic archiving',
      'Usage tracking',
      'Error handling and retries'
    ]
  })
})

// Protected routes - Require valid authenticated user
app.use('/api/upload', authenticate, requireValidUser, uploadRoutes)
app.use('/api/process', authenticate, requireValidUser, processRoutes)  
app.use('/api/results', authenticate, requireValidUser, resultsRoutes)
app.use('/api/archive', authenticate, requireValidUser, archiveRoutes)

// Error handling
app.use(errorHandler)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    service: 'core-invoice-service'
  })
})

app.listen(port, () => {
  logger.info(`Core Invoice Service running on port ${port}`)
  logger.info(`API documentation available at http://localhost:${port}/api`)
})