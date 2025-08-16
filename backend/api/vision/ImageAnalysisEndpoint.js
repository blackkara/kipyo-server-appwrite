// src/api/vision/ImageAnalysisEndpoint.js

import express from 'express';
import multer from 'multer';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import authenticateUser from '../../middleware/authenticateUser.js';
import { ANALYSIS_LIMITS, SUPPORTED_FORMATS } from '../../services/appwrite/vision/ImageAnalysisConstants.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: ANALYSIS_LIMITS.MAX_IMAGE_SIZE
  },
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_FORMATS.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format'));
    }
  }
});

/**
 * Analyze uploaded image
 * POST /api/vision/analyze
 */
router.post('/analyze', authenticateUser, upload.single('image'), async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const { includeLabels, includeText, strictMode } = req.body;
  const startTime = Date.now();

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'No image file provided',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Analyze image
    const result = await appwriteService.analyzeImage(
      req.file.buffer,
      {
        includeLabels: includeLabels === 'true',
        includeText: includeText === 'true',
        strictMode: strictMode === 'true'
      }
    );

    const duration = Date.now() - startTime;
    log(`Image analyzed in ${duration}ms - Appropriate: ${result.isAppropriate}`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Image analysis failed: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

/**
 * Analyze profile photo
 * POST /api/vision/profile-photo
 */
router.post('/profile-photo', authenticateUser, upload.single('photo'), async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const { saveResult } = req.body;
  const startTime = Date.now();

  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'No photo file provided',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Analyze profile photo
    const result = await appwriteService.analyzeProfilePhoto(
      jwtToken,
      req.file.buffer,
      {
        saveResult: saveResult === 'true'
      }
    );

    const duration = Date.now() - startTime;
    log(`Profile photo analyzed for user ${requestedUser.userId} in ${duration}ms - Appropriate: ${result.isAppropriate}`);

    // If photo is inappropriate, provide detailed feedback
    if (!result.isAppropriate) {
      return res.status(422).json({
        success: false,
        code: 422,
        message: 'Profile photo does not meet our guidelines',
        data: {
          isAppropriate: false,
          rejectionReasons: result.rejectionReasons,
          suggestions: [
            'Please upload a clear photo of yourself',
            'Avoid inappropriate or offensive content',
            'Make sure your face is clearly visible'
          ]
        },
        requestId,
        duration
      });
    }

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Profile photo analysis failed: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

/**
 * Analyze image by URL
 * POST /api/vision/analyze-url
 */
router.post('/analyze-url', authenticateUser, async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const { imageUrl, includeLabels, includeText, strictMode } = req.body;
  const startTime = Date.now();

  try {
    // Validate URL
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'imageUrl is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Analyze image from URL
    const result = await appwriteService.analyzeImage(
      imageUrl,
      {
        includeLabels: includeLabels === 'true',
        includeText: includeText === 'true',
        strictMode: strictMode === 'true'
      }
    );

    const duration = Date.now() - startTime;
    log(`Image from URL analyzed in ${duration}ms - Appropriate: ${result.isAppropriate}`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`URL image analysis failed: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

/**
 * Batch analyze multiple images
 * POST /api/vision/batch
 */
router.post('/batch', authenticateUser, upload.array('images', 10), async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const { strictMode } = req.body;
  const startTime = Date.now();

  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'No image files provided',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Prepare images
    const imageBuffers = req.files.map(file => file.buffer);
    
    // Analyze batch
    const result = await appwriteService.analyzeBatch(
      imageBuffers,
      {
        strictMode: strictMode === 'true',
        batchSize: 5
      }
    );

    const duration = Date.now() - startTime;
    log(`Batch of ${req.files.length} images analyzed in ${duration}ms - Approval rate: ${result.approvalRate}%`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Batch analysis failed: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

/**
 * Moderate content
 * POST /api/vision/moderate
 */
router.post('/moderate', authenticateUser, upload.single('image'), async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const { contentId, contentType } = req.body;
  const startTime = Date.now();

  try {
    // Validate input
    if (!contentId || !contentType) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'contentId and contentType are required',
        requestId
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'No image file provided',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Moderate content
    const result = await appwriteService.moderateContent(
      jwtToken,
      contentId,
      contentType,
      req.file.buffer
    );

    const duration = Date.now() - startTime;
    log(`Content ${contentId} (${contentType}) moderated in ${duration}ms - Action: ${result.moderationAction}`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Content moderation failed: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

/**
 * Get analysis statistics
 * GET /api/vision/stats
 */
router.get('/stats', authenticateUser, async (req, res) => {
  const { requestId, log } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Get statistics
    const stats = appwriteService.getImageAnalysisStatistics();

    const duration = Date.now() - startTime;
    log(`Retrieved image analysis statistics in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: stats,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to get statistics',
      requestId,
      duration
    });
  }
});

/**
 * Clear analysis cache
 * POST /api/vision/clear-cache
 */
router.post('/clear-cache', authenticateUser, async (req, res) => {
  const { requestId, log } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Clear cache
    const clearedCount = appwriteService.clearImageAnalysisCache();

    const duration = Date.now() - startTime;
    log(`Cleared ${clearedCount} cached analysis results in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: {
        clearedCount
      },
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to clear cache',
      requestId,
      duration
    });
  }
});

export default router;