// src/api/directmessage/DirectMessageEndpoint.js

import express from 'express';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import authenticateUser from '../../middleware/authenticateUser.js';

const router = express.Router();

/**
 * Send a direct message
 * POST /api/directmessage/send
 */
router.post('/send', authenticateUser, async (req, res) => {
  const { recipientId, message } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!recipientId || !message) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'recipientId and message are required',
        requestId
      });
    }

    // Message length validation
    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Message cannot exceed 5000 characters',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Send message
    const result = await appwriteService.sendDirectMessage(
      jwtToken,
      requestedUser.$id,
      recipientId,
      message,
      conversationId,
      metadata
    );

    const duration = Date.now() - startTime;
    log(`Direct message sent from ${requestedUser.$id} to ${recipientId} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to send direct message: ${err.message}`, err);

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
 * Get messages in a conversation
 * GET /api/directmessage/conversation/:conversationId
 */
router.get('/conversation/:conversationId', authenticateUser, async (req, res) => {
  const { conversationId } = req.params;
  const { limit = 50, offset = 0, orderBy = 'createdAt:desc' } = req.query;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'conversationId is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Get messages
    const result = await appwriteService.getConversationMessages(
      jwtToken,
      requestedUser.$id,
      conversationId,
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
        orderBy
      }
    );

    const duration = Date.now() - startTime;
    log(`Retrieved ${result.messages.length} messages for conversation ${conversationId} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to get conversation messages: ${err.message}`, err);

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
 * Get user's conversations list
 * GET /api/directmessage/conversations
 */
router.get('/conversations', authenticateUser, async (req, res) => {
  const { limit = 20, offset = 0, includeLastMessage = true } = req.query;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Get conversations
    const result = await appwriteService.getUserConversations(
      jwtToken,
      requestedUser.$id,
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
        includeLastMessage: includeLastMessage === 'true'
      }
    );

    const duration = Date.now() - startTime;
    log(`Retrieved ${result.conversations.length} conversations for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to get user conversations: ${err.message}`, err);

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
 * Mark messages as read
 * PUT /api/directmessage/read
 */
router.put('/read', authenticateUser, async (req, res) => {
  const { messageIds, conversationId } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!messageIds && !conversationId) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Either messageIds or conversationId is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Mark as read
    const result = await appwriteService.markMessagesAsRead(
      jwtToken,
      requestedUser.$id,
      { messageIds, conversationId }
    );

    const duration = Date.now() - startTime;
    log(`Marked messages as read for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to mark messages as read: ${err.message}`, err);

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
 * Delete a message
 * DELETE /api/directmessage/:messageId
 */
router.delete('/:messageId', authenticateUser, async (req, res) => {
  const { messageId } = req.params;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!messageId) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'messageId is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Delete message
    const result = await appwriteService.deleteMessage(
      jwtToken,
      requestedUser.$id,
      messageId
    );

    const duration = Date.now() - startTime;
    log(`Deleted message ${messageId} for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to delete message: ${err.message}`, err);

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
 * Get unread message count
 * GET /api/directmessage/unread/count
 */
router.get('/unread/count', authenticateUser, async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Get unread count
    const result = await appwriteService.getUnreadMessageCount(
      jwtToken,
      requestedUser.$id
    );

    const duration = Date.now() - startTime;
    log(`Retrieved unread count for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to get unread count: ${err.message}`, err);

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
 * Search messages
 * POST /api/directmessage/search
 */
router.post('/search', authenticateUser, async (req, res) => {
  const { query, conversationId, limit = 20, offset = 0 } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!query) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'query is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Search messages
    const result = await appwriteService.searchMessages(
      jwtToken,
      requestedUser.$id,
      {
        query,
        conversationId,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    );

    const duration = Date.now() - startTime;
    log(`Search completed for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to search messages: ${err.message}`, err);

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
 * Update message (edit)
 * PUT /api/directmessage/:messageId
 */
router.put('/:messageId', authenticateUser, async (req, res) => {
  const { messageId } = req.params;
  const { message, metadata } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!messageId || !message) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'messageId and message are required',
        requestId
      });
    }

    // Message length validation
    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Message cannot exceed 5000 characters',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Update message
    const result = await appwriteService.updateMessage(
      jwtToken,
      requestedUser.$id,
      messageId,
      { message, metadata, editedAt: new Date().toISOString() }
    );

    const duration = Date.now() - startTime;
    log(`Updated message ${messageId} for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to update message: ${err.message}`, err);

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
 * Block/Unblock user from messaging
 * POST /api/directmessage/block
 */
router.post('/block', authenticateUser, async (req, res) => {
  const { targetUserId, block = true } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'targetUserId is required',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Block/Unblock user
    const result = await appwriteService.blockUserFromMessaging(
      jwtToken,
      requestedUser.$id,
      targetUserId,
      block
    );

    const duration = Date.now() - startTime;
    const action = block ? 'blocked' : 'unblocked';
    log(`User ${targetUserId} ${action} by ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to block/unblock user: ${err.message}`, err);

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
 * Get blocked users list
 * GET /api/directmessage/blocked
 */
router.get('/blocked', authenticateUser, async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();

    // Get blocked users
    const result = await appwriteService.getBlockedUsers(
      jwtToken,
      requestedUser.$id
    );

    const duration = Date.now() - startTime;
    log(`Retrieved blocked users for ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      data: result,
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to get blocked users: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: err.message,
      requestId,
      duration
    });
  }
});

export default router;