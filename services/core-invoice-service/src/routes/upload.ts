import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db, storage, upload } from '../index'
import { ValidationError } from '../middleware/errorHandler'
import logger from '../utils/logger'
import { validateUsageQuota } from '../utils/quota'

const router = express.Router()
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'invoice-processing-bucket')

// POST /api/upload - Upload files for processing
router.post('/', upload.array('files', 10), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[]
    
    if (!files || files.length === 0) {
      throw new ValidationError('No files provided')
    }
    
    // Check user quota
    const quotaCheck = await validateUsageQuota(req.user!.uid, files.length)
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Usage quota exceeded',
        quota: quotaCheck.quota,
        used: quotaCheck.used
      })
    }
    
    const jobId = uuidv4()
    const uploadedFiles = []
    
    // Upload files to Cloud Storage
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileName = `${req.user!.uid}/${jobId}/${Date.now()}_${file.originalname}`
      const gcsFile = bucket.file(fileName)
      
      // Upload file
      await gcsFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedBy: req.user!.uid,
            jobId: jobId
          }
        }
      })
      
      // Make file publicly readable (optional - for processing)
      await gcsFile.makePublic()
      
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
      
      uploadedFiles.push({
        id: uuidv4(),
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        gcsPath: fileName,
        publicUrl: fileUrl
      })
    }
    
    // Create job record in Firestore
    const jobData = {
      id: jobId,
      userUID: req.user!.uid,
      organizationId: req.user!.organizationId || null,
      status: 'uploaded',
      totalFiles: files.length,
      files: uploadedFiles,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Store in user's collection path for multi-tenancy
    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/jobs`
      : `users/${req.user!.uid}/jobs`
    
    await db.collection(userCollectionPath).doc(jobId).set(jobData)
    
    logger.info(`Upload job ${jobId} created for user ${req.user!.uid} with ${files.length} files`)
    
    res.status(201).json({
      success: true,
      data: {
        jobId,
        uploadedFiles: uploadedFiles.map(f => ({
          id: f.id,
          fileName: f.fileName,
          fileSize: f.fileSize,
          mimeType: f.mimeType
        })),
        status: 'uploaded',
        nextStep: `/api/process/${jobId}`
      },
      message: `${files.length} files uploaded successfully`
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/upload/signed-url - Get signed URL for client-side upload
router.get('/signed-url', async (req, res, next) => {
  try {
    const { fileName, contentType } = req.query
    
    if (!fileName || !contentType) {
      throw new ValidationError('fileName and contentType are required')
    }
    
    const jobId = uuidv4()
    const gcsFileName = `${req.user!.uid}/${jobId}/${Date.now()}_${fileName}`
    const file = bucket.file(gcsFileName)
    
    // Generate signed URL for upload
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType as string
    })
    
    res.json({
      success: true,
      data: {
        jobId,
        signedUrl,
        gcsPath: gcsFileName,
        expiresIn: 15 * 60 // seconds
      }
    })
  } catch (error) {
    next(error)
  }
})

// POST /api/upload/batch - Handle batch upload completion (for signed URLs)
router.post('/batch', async (req, res, next) => {
  try {
    const { jobId, files } = req.body
    
    if (!jobId || !Array.isArray(files) || files.length === 0) {
      throw new ValidationError('jobId and files array are required')
    }
    
    // Validate file information
    const validatedFiles = files.map((file: any) => {
      if (!file.gcsPath || !file.fileName) {
        throw new ValidationError('Each file must have gcsPath and fileName')
      }
      
      return {
        id: file.id || uuidv4(),
        fileName: file.fileName,
        fileSize: file.fileSize || 0,
        mimeType: file.mimeType || 'application/octet-stream',
        gcsPath: file.gcsPath,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.gcsPath}`
      }
    })
    
    // Create job record
    const jobData = {
      id: jobId,
      userUID: req.user!.uid,
      organizationId: req.user!.organizationId || null,
      status: 'uploaded',
      totalFiles: validatedFiles.length,
      files: validatedFiles,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const userCollectionPath = req.user!.organizationId 
      ? `organizations/${req.user!.organizationId}/jobs`
      : `users/${req.user!.uid}/jobs`
    
    await db.collection(userCollectionPath).doc(jobId).set(jobData)
    
    logger.info(`Batch upload job ${jobId} completed for user ${req.user!.uid} with ${validatedFiles.length} files`)
    
    res.json({
      success: true,
      data: {
        jobId,
        status: 'uploaded',
        totalFiles: validatedFiles.length,
        nextStep: `/api/process/${jobId}`
      },
      message: 'Batch upload completed successfully'
    })
  } catch (error) {
    next(error)
  }
})

export default router