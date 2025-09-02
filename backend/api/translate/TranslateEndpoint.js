import express from 'express';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import authenticateUser from '../../middleware/authenticateUser.js';

const router = express.Router();

/**
 * Translate a single message
 * POST /api/translate/message
 */
router.post('/message', authenticateUser, async (req, res) => {
  const { messageId, targetLanguage, forceRefresh = false } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!messageId || !targetLanguage) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'messageId and targetLanguage are required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Translate message
    const result = await appwriteService.translateMessage(
      jwtToken,
      requestedUser.$id,
      messageId,
      targetLanguage.toLowerCase(),
      { forceRefresh }
    );

    const duration = Date.now() - startTime;
    log(`Message ${messageId} translated to ${targetLanguage} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Translation failed: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

router.post('/about', authenticateUser, async (req, res) => {
  const { userId, targetLanguage, forceRefresh = false } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!userId || !targetLanguage) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'userId and targetLanguage are required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Translate about section
    const result = await appwriteService.translateAbout(
      jwtToken,
      requestedUser.$id,
      userId,
      targetLanguage.toLowerCase(),
      { forceRefresh }
    );

    const duration = Date.now() - startTime;
    log(`User ${userId} about section translated to ${targetLanguage} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Translation failed: ${err.message}`, err);

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
 * Translate multiple messages
 * POST /api/translate/batch
 */
router.post('/batch', authenticateUser, async (req, res) => {
  const { messageIds, targetLanguage } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'messageIds array is required',
        requestId
      });
    }

    if (!targetLanguage) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'targetLanguage is required',
        requestId
      });
    }

    // Limit batch size
    if (messageIds.length > 50) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Maximum 50 messages can be translated at once',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Translate messages
    const result = await appwriteService.translateBatch(
      jwtToken,
      messageIds,
      targetLanguage.toLowerCase()
    );

    const duration = Date.now() - startTime;
    log(`Batch translation completed: ${result.successful.length}/${messageIds.length} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Batch translation failed: ${err.message}`, err);

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
 * Translate entire conversation
 * POST /api/translate/conversation
 */
router.post('/conversation', authenticateUser, async (req, res) => {
  const { conversationId, targetLanguage } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!conversationId || !targetLanguage) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'conversationId and targetLanguage are required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Translate conversation
    const result = await appwriteService.translateConversation(
      jwtToken,
      conversationId,
      targetLanguage.toLowerCase()
    );

    const duration = Date.now() - startTime;
    log(`Conversation ${conversationId} translated: ${result.successful.length} messages in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Conversation translation failed: ${err.message}`, err);

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
 * Detect language of text
 * POST /api/translate/detect
 */
router.post('/detect', authenticateUser, async (req, res) => {
  const { text } = req.body;
  const { requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!text) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'text is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Detect language
    const result = await appwriteService.detectLanguage(text);

    const duration = Date.now() - startTime;
    log(`Language detected: ${result.language} (confidence: ${result.confidence}) in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Language detection failed: ${err.message}`, err);

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
 * Get supported languages
 * GET /api/translate/languages
 */
router.get('/languages', authenticateUser, async (req, res) => {
  const { displayLanguage = 'en' } = req.query;
  const { requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Get supported languages
    const languages = await appwriteService.getSupportedLanguages(displayLanguage);

    const duration = Date.now() - startTime;
    log(`Retrieved ${languages.length} supported languages in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: languages,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to get languages: ${err.message}`, err);

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
 * Get translation statistics
 * GET /api/translate/stats
 */
router.get('/stats', authenticateUser, async (req, res) => {
  const { requestId, log } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Get statistics
    const stats = appwriteService.getTranslationStatistics();

    const duration = Date.now() - startTime;
    log(`Retrieved translation statistics in ${duration}ms`);

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

export default router;