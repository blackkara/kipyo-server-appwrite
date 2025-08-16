// src/services/appwrite/messaging/MessagingService.js

import { ID, Query } from 'node-appwrite';
import crypto from 'crypto';

/**
 * Messaging Service
 * Handles all message operations including sending messages and notifications
 */
export class MessagingService {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.clientManager = dependencies.clientManager;
    this.documentOps = dependencies.documentOperations; // Normal user operations
    this.adminOps = dependencies.adminOperations; // Admin operations (bu eksikti)
    this.performanceMonitor = dependencies.performanceMonitor;
    this.errorAnalyzer = dependencies.errorAnalyzer;
    this.postHog = dependencies.postHogService;
    this.config = dependencies.configManager;
    this.quotaManager = dependencies.quotaManager;
    this.notificationTemplates = dependencies.notificationTemplates;

    // Database configurations
    this.messagesCollection = process.env.DB_COLLECTION_MESSAGES_ID;
    this.dialogsCollection = process.env.DB_COLLECTION_DIALOGS_ID;
    this.profilesCollection = process.env.DB_COLLECTION_PROFILES_ID;
    this.blocksCollection = process.env.DB_COLLECTION_BLOCKS_ID;

    // Statistics
    this.stats = {
      messagesSent: 0,
      directMessagesSent: 0,
      notificationsSent: 0,
      failed: 0
    };

    this.log('MessagingService initialized');
  }

  /**
   * Create a new message document
   */
  async createMessage(jwtToken, senderId, receiverId, message, conversationId) {
    try {
      const messageData = {
        message: message.trim(),
        senderId,
        receiverId,
        dialogId: conversationId
      };

      const newMessage = await this.adminOps.createDocumentWithAdminPrivileges(
        jwtToken,
        senderId,
        this.messagesCollection,
        ID.unique(),
        messageData,
        [{ userId: receiverId, permissions: ['read'] }]
      );

      return newMessage;
    } catch (error) {
      this.log('Failed to create message:', error.message);
      throw new Error(`Failed to create message: ${error.message}`);
    }
  }

  /**
   * Send a regular message between matched/liked users
   */
  async sendMessage(jwtToken, senderId, receiverId, message, dialogId) {
    const context = {
      methodName: 'sendMessage',
      senderId,
      receiverId,
      timestamp: new Date().toISOString()
    };

    try {
      // Validate message
      if (!message || message.trim().length === 0) {
        throw new Error('Message cannot be empty');
      }

      if (message.length > 5000) {
        throw new Error('Message is too long (max 5000 characters)');
      }

      const [blockage, dialog] = await Promise.all([
        this.checkBlockage(jwtToken, senderId, receiverId),
        this.hasDialog(jwtToken, dialogId)
      ]);

      if (blockage) {
        throw new Error('Cannot send message: blocked user');
      }

      if (!dialog) {
        throw new Error('No dialog');
      }

      // Get sender info for notification
      const senderInfo = await this.getUserInfo(jwtToken, senderId);

      // Create message and update dialog
      const [newMessage, updatedDialog] = await Promise.all([
        this.createMessage(jwtToken, senderId, receiverId, message, dialog.$id),
        this.updateDialog(jwtToken, dialog.$id, message, senderId, receiverId)
      ]);

      // Track message event
      if (this.postHog) {
        await this.postHog.trackBusinessEvent('message_sent', {
          message_id: newMessage.$id,
          dialog_id: dialog.$id,
          sender_id: senderId,
          receiver_id: receiverId,
          message_length: message.length
        }, senderId);
      }

      // Send push notification to receiver
      let notificationResult = { success: false };
      try {
        const messagePreview = message.length > 100 ?
          message.substring(0, 97) + '...' : message;

        notificationResult = await this.notificationTemplates.sendMessageNotification(
          senderId,
          receiverId,
          senderInfo.name || 'Someone',
          messagePreview,
          {
            dialogId: dialog.$id,
            messageId: newMessage.$id,
            unreadCount: await this.getUnreadCount(jwtToken, receiverId)
          }
        );

        this.stats.notificationsSent++;
      } catch (notifError) {
        this.log('Failed to send message notification:', notifError.message);
        // Don't fail the entire operation if notification fails
      }

      this.stats.messagesSent++;

      return {
        success: true,
        message: newMessage,
        dialog: updatedDialog,
        notification: notificationResult
      };

    } catch (error) {
      this.stats.failed++;

      if (this.errorAnalyzer) {
        await this.errorAnalyzer.trackError(error, context);
      }

      this.log('Failed to send message:', error.message);
      throw error;
    }
  }

  /**
   * Send a direct message (special privilege message without match/like requirement)
   */
  async sendDirectMessage(jwtToken, senderId, receiverId, message, options = {}) {
    const context = {
      methodName: 'sendDirectMessage',
      senderId,
      receiverId,
      timestamp: new Date().toISOString()
    };

    try {
      if (!message || message.trim().length === 0) {
        throw new Error('Direct message cannot be empty');
      }

      if (message.length > 5000) {
        throw new Error('Direct message is too long (max 5000 characters)');
      }

      // Check for blockage
      const hasBlockage = await this.checkBlockage(jwtToken, senderId, receiverId);
      if (hasBlockage) {
        throw new Error('Cannot send direct message: blocked user');
      }

      // Check and consume direct message quota if quota manager is available
      let quotaInfo = null;
      if (this.quotaManager) {
        const quotaResult = await this.quotaManager.checkAndConsumeQuota(
          jwtToken,
          senderId,
          'DIRECT_MESSAGE',
          1
        );

        if (!quotaResult.success) {
          return {
            success: false,
            quotaInfo: {
              error: 'QUOTA_EXCEEDED',
              message: quotaResult.message,
              remaining: quotaResult.remaining,
              dailyLimit: quotaResult.dailyLimit,
              nextResetAt: quotaResult.nextResetAt
            }
          };
        }

        quotaInfo = {
          remaining: quotaResult.remaining,
          dailyLimit: quotaResult.dailyLimit
        };
      }

      // Get or create direct conversation using admin operations
      const conversationId = await this.getOrCreateDirectConversation(jwtToken, senderId, receiverId);

      // Execute all operations in parallel
      const [senderInfo, messageDoc, updatedDialog] = await Promise.all([
        this.getUserInfo(jwtToken, senderId),
        this.createMessage(jwtToken, senderId, receiverId, message, conversationId),
        this.updateDialog(jwtToken, conversationId, message, senderId, receiverId)
      ]);

      // Track direct message event
      if (this.postHog) {
        await this.postHog.trackBusinessEvent('direct_message_sent', {
          message_id: messageDoc.$id,
          dialog_id: conversationId,
          sender_id: senderId,
          receiver_id: receiverId,
          message_length: message.length,
          remaining_quota: quotaInfo?.remaining
        }, senderId);
      }

      // Send special direct message push notification
      let notificationResult = { success: false };
      try {
        const messagePreview = message.length > 100 ?
          message.substring(0, 97) + '...' : message;

        notificationResult = await this.notificationTemplates.sendDirectMessageNotification(
          senderId,
          receiverId,
          senderInfo.name || 'Someone',
          messagePreview,
          {
            dialogId: conversationId,
            messageId: messageDoc.$id,
            remainingCount: quotaInfo?.remaining,
            unreadCount: await this.getUnreadCount(jwtToken, receiverId)
          }
        );

        this.stats.notificationsSent++;
      } catch (notifError) {
        this.log('Failed to send direct message notification:', notifError.message);
        // Don't fail the entire operation if notification fails
      }

      this.stats.directMessagesSent++;

      return {
        success: true,
        message: messageDoc,
        quotaInfo,
        notification: notificationResult
      };

    } catch (error) {
      this.stats.failed++;

      if (this.errorAnalyzer) {
        await this.errorAnalyzer.trackError(error, context);
      }

      this.log('Failed to send direct message:', error.message);
      throw error;
    }
  }

  /**
 * Update dialog with last message info (your original method)
 */
  async updateDialog(jwtToken, dialogId, message, senderId, receiverId) {
    try {
      this.log(`Updating dialog last message: ${dialogId}`);

      const updatedDialog = await this.adminOps.updateDocumentWithAdminPrivileges(
        jwtToken,
        senderId,
        this.dialogsCollection,
        dialogId,
        {
          lastMessage: message,
          lastMessageSenderId: senderId
        },
        [{ userId: receiverId, permissions: ['read'] }]
      );

      this.log(`Dialog updated successfully with ID: ${updatedDialog.$id}`);
      return updatedDialog;
    } catch (error) {
      this.log(`ERROR in updateDialog: ${error.message}`);
      // Don't fail the entire operation if this fails
      throw new Error(`Failed to update dialog: ${error.message}`);
    }
  }

  /**
   * Get or create dialog between two users (normal conversation)
   */
  async getOrCreateConversation(jwtToken, userId1, userId2) {
    try {
      const occupants = [userId1, userId2].sort();

      // First try to find existing dialog
      const existingDialogs = await this.documentOps.listDocuments(
        jwtToken,
        this.dialogsCollection,
        [
          Query.contains('occupantIds', occupants[0]),
          Query.contains('occupantIds', occupants[1]),
          Query.limit(1)
        ]
      );

      if (existingDialogs.total > 0) {
        return existingDialogs.documents[0].$id;
      }

      // Create new dialog if not found
      const combined = occupants.join('_');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      const dialogId = `dialog_${hash.substring(0, 20)}`;

      const newDialog = await this.documentOps.createDocument(
        jwtToken,
        this.dialogsCollection,
        dialogId,
        {
          occupants,
          occupantIds: occupants,
          lastMessage: '',
          lastMessageSenderId: '',
          isDirect: false
        }
      );

      return newDialog.$id;
    } catch (error) {
      this.log('Failed to get or create conversation:', error.message);
      throw error;
    }
  }

  /**
   * Get or create direct conversation between two users (admin privileges required)
   */
  async getOrCreateDirectConversation(jwtToken, senderId, receiverId) {
    try {
      const occupants = [senderId, receiverId].sort();

      // First try to find existing direct dialog
      const existingDialogs = await this.adminOps.listDocuments ?
        await this.adminOps.listDocuments(
          jwtToken,
          this.dialogsCollection,
          [
            Query.contains('occupantIds', occupants[0]),
            Query.contains('occupantIds', occupants[1]),
            Query.equal('isDirect', true),
            Query.limit(1)
          ]
        ) :
        await this.documentOps.listDocuments(
          jwtToken,
          this.dialogsCollection,
          [
            Query.contains('occupantIds', occupants[0]),
            Query.contains('occupantIds', occupants[1]),
            Query.equal('isDirect', true),
            Query.limit(1)
          ]
        );

      if (existingDialogs.total > 0) {
        return existingDialogs.documents[0].$id;
      }

      // Create new direct dialog using admin privileges
      const combined = occupants.join('_');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      const dialogId = `direct_${hash.substring(0, 20)}`;

      const newDialog = await this.adminOps.upsertDocumentWithAdminPrivileges(
        jwtToken,
        senderId,
        this.dialogsCollection,
        dialogId,
        {
          occupants,
          occupantIds: occupants,
          lastMessage: '',
          lastMessageSenderId: '',
          blockedIds: [],
          isDirect: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        [{ userId: receiverId, permissions: ['read'] }]
      );

      return newDialog.$id;
    } catch (error) {
      this.log('Failed to get or create direct conversation:', error.message);
      throw error;
    }
  }

  /**
   * Check if there's a blockage between two users
   */
  async checkBlockage(jwtToken, senderId, receiverId) {
    try {
      const blockages = await this.documentOps.listDocuments(
        jwtToken,
        this.blocksCollection,
        [
          Query.or([
            Query.and([
              Query.equal('blockerId', [senderId]),
              Query.equal('blockedId', [receiverId])
            ]),
            Query.and([
              Query.equal('blockerId', [receiverId]),
              Query.equal('blockedId', [senderId])
            ])
          ]),
          Query.limit(1)
        ]
      );

      return blockages.total > 0;
    } catch (error) {
      this.log('Failed to check blockage:', error.message);
      // If we can't check blockage, allow the operation to continue
      return false;
    }
  }

  async hasDialog(jwtToken, dialogId) {
    try {
      const document = this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_DIALOGS_ID,
        dialogId
      );
      return document;
    } catch (error) {
      this.log(`[${requestId}] ERROR in checkIfDialogExists: ${error.message}`);
      throw new Error(`Failed to check dialog existence: ${error.message}`);
    }
  }


  /**
   * Get user info for notification
   */
  async getUserInfo(jwtToken, userId) {
    try {
      const user = await this.documentOps.getDocument(
        jwtToken,
        this.profilesCollection,
        userId
      );

      return {
        id: user.$id,
        name: user.name || user.username || 'User',
        avatar: user.avatar || null
      };
    } catch (error) {
      this.log('Failed to get user info:', error.message);
      return {
        id: userId,
        name: 'User',
        avatar: null
      };
    }
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(jwtToken, userId) {
    try {
      const unreadMessages = await this.documentOps.listDocuments(
        jwtToken,
        this.messagesCollection,
        [
          Query.equal('receiverId', userId),
          //  Query.equal('isRead', false),
          Query.limit(1000) // Reasonable limit for counting
        ]
      );

      return unreadMessages.total || 0;
    } catch (error) {
      this.log('Failed to get unread count:', error.message);
      return 0;
    }
  }

  /**
   * Get messaging statistics
   */
  getStatistics() {
    const totalSent = this.stats.messagesSent + this.stats.directMessagesSent;
    const totalOperations = totalSent + this.stats.failed;

    return {
      ...this.stats,
      totalSent,
      totalOperations,
      successRate: totalOperations > 0 ? (totalSent / totalOperations) * 100 : 0
    };
  }

  /**
   * Clear statistics
   */
  clearStatistics() {
    this.stats = {
      messagesSent: 0,
      directMessagesSent: 0,
      notificationsSent: 0,
      failed: 0
    };
  }
}

export default MessagingService;