import { Router, Response } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { Storage } from '@google-cloud/storage'
import { AuthenticatedRequest } from '../middleware/auth'
import { validateUsageQuota } from '../utils/quota'
import logger from '../utils/logger'
import { db } from '../index'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.post('/', upload.array('files', 10), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[]
    
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' })
      return
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    // Validate usage quota
    const quotaCheck = await validateUsageQuota(req.user.uid, files.length)
    if (!quotaCheck.allowed) {
      res.status(429).json({ 
        error: 'Upload quota exceeded', 
        details: quotaCheck 
      })
      return
    }

    // Upload files to Google Cloud Storage
    const storage = new Storage()
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!)
    const jobId = uuidv4()
    const uploadedFiles = []

    for (const file of files) {
      const fileName = `${req.user.uid}/${jobId}/${Date.now()}_${file.originalname}`
      const gcsFile = bucket.file(fileName)
      
      await gcsFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedBy: req.user.uid,
            jobId: jobId
          }
        }
      })

      uploadedFiles.push({
        id: uuidv4(),
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        gcsPath: fileName,
        status: 'uploaded'
      })
    }

    // Create job record
    const jobData = {
      jobId,
      status: 'uploaded',
      files: uploadedFiles,
      totalFiles: files.length,
      processedFiles: 0,
      userUID: req.user.uid,
      organizationId: req.user.organizationId || null,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    // Store job in appropriate collection
    const userCollectionPath = req.user.organizationId
      ? `organizations/${req.user.organizationId}/jobs`
      : `users/${req.user.uid}/jobs`

    await db.collection(userCollectionPath).doc(jobId).set(jobData)

    logger.info(`Upload job ${jobId} created for user ${req.user.uid} with ${files.length} files`)

    res.json({
      success: true,
      jobId,
      filesUploaded: files.length,
      message: 'Files uploaded successfully'
    })

  } catch (error) {
    logger.error('Upload error:', error)
    res.status(500).json({ error: 'Upload failed' })
  }
})

export default router