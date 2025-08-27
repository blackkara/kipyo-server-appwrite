import { generateDocumentId } from '#id-generator';
import { ID, Query } from 'node-appwrite';
import crypto from 'crypto';
import { randomBytes } from 'crypto';

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from 'file-type';

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


  async uploadToS3(imageBuffer, key) {
    try {
      const spaces = new S3Client({
        endpoint: process.env.SPACES_ENDPOINT,
        region: process.env.SPACES_AWS_REGION,
        credentials: {
          accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
          secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
        },
        forcePathStyle: false,
      });

      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: key,
        Body: imageBuffer,
        ACL: 'public-read',
        ContentType: 'image/jpeg'
      });

      await spaces.send(uploadCommand);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'S3_UPLOAD_ERROR',
          message: 'Failed to upload image to storage'
        }
      };
    }
  }

  getPhotoValidationConfig() {
    return {
      maxSizeInBytes: 10 * 1024 * 1024, // 10MB limit
      maxSizeMB: 10,
      allowedFormats: ['image/jpeg'],
      requiredValidations: ['sizeValid', 'formatValid', 'hasFace', 'appropriate']
    };
  }


  async validateImageFormat(imageBase64, config) {
    try {
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const fileInfo = await fileTypeFromBuffer(imageBuffer);

      if (!fileInfo || !config.allowedFormats.includes(fileInfo.mime)) {
        return {
          valid: false,
          buffer: imageBuffer,
          error: {
            code: 'IMAGE_FORMAT_INVALID',
            message: `Only ${config.allowedFormats.join(', ')} images are allowed`
          }
        };
      }

      return { valid: true, buffer: imageBuffer };
    } catch (error) {
      return {
        valid: false,
        error: {
          code: 'IMAGE_PROCESSING_ERROR',
          message: 'Failed to process image data'
        }
      };
    }
  }

  generatePhotoUrl(photoKey) {
    const baseUrl = process.env.SPACES_CDN_ENDPOINT || process.env.SPACES_ENDPOINT;
    const bucket = process.env.SPACES_BUCKET;
    return `${baseUrl}/${bucket}/${photoKey}`;
  }
  /**
 * Create a message document in the database
 * @private
 */
  async createMessage(jwtToken, senderId, receiverId, messageContent, messageType, dialogId, attachment = null, metadata = null) {
    try {
      const messageData = {
        senderId,
        receiverId,
        message: messageContent,
        messageType,
        dialogId,
        translatedBody: '',
        translatedLanguage: '',
        ...(attachment && { attachment: JSON.stringify(attachment) }),
        ...(metadata && { metadata: metadata })  // metadata zaten JSON string olarak geliyor
      };

      const newMessage = await this.adminOps.createDocumentWithAdminPrivileges(
        jwtToken,
        senderId,
        this.messagesCollection,
        ID.unique(),
        messageData,
        [{ userId: receiverId, permissions: ['read'] }]
      );


      this.log(`Message created: ${newMessage.$id}`);
      return newMessage;

    } catch (error) {
      this.log('Failed to create message document:', error.message);
      throw error;
    }
  }



  /**
   * Send a regular message between matched/liked users
   */
  async sendMessage(jwtToken, senderId, receiverId, message, messageType, dialogId, imageBase64 = null, metadata = null) {
    const context = {
      methodName: 'sendMessage',
      senderId,
      receiverId,
      timestamp: new Date().toISOString()
    };

    try {
      // Validate messageType
      if (!messageType || ![1, 2, 3, 4].includes(messageType)) {
        throw new Error('Invalid message type');
      }

      // Validate message content for text messages
      if (messageType === 1) {
        if (!message || message.trim().length === 0) {
          throw new Error('Message cannot be empty for text type');
        }
        if (message.length > 5000) {
          throw new Error('Message is too long (max 5000 characters)');
        }
      }

      // Check blockage and dialog BEFORE upload to avoid unnecessary uploads
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

      let attachment = null;
      let messageContent = message;

      // Handle media types (2=photo, 3=video, 4=audio) AFTER validation
      if (messageType !== 1) {
        if (!imageBase64) {
          throw new Error(`Media data (imageBase64) is required for messageType ${messageType}`);
        }

        const config = this.getPhotoValidationConfig();
        const key = randomBytes(18).toString('hex').toLowerCase();
        const formatValidation = await this.validateImageFormat(imageBase64, config);
        const uploadResult = await this.uploadToS3(formatValidation.buffer, key);
        if (!uploadResult.success) {
          throw new Error(`Failed to upload media: ${uploadResult.error}`);
        }


        // // Upload media to storage
        // const uploadResult = await this.uploadMediaToStorage(imageBase64, messageType);
        // if (!uploadResult.success) {
        //   throw new Error(`Failed to upload media: ${uploadResult.error}`);
        // }

        // Create attachment object
        attachment = {
          url: this.generatePhotoUrl(key),
          type: messageType === 2 ? 'photo' : messageType === 3 ? 'video' : 'audio'
        };

        messageContent = message || '';
        this.log(`Media uploaded successfully: ${attachment.type} - ${uploadResult.key}`);
      }

      // Execute parallel operations: get sender info, create message, and update dialog
      const dialogPreview = messageContent || (attachment ? `Sent a${messageType === 4 ? 'n' : ''} ${attachment.type}` : '');

      const [senderInfo, newMessage, updatedDialog] = await Promise.all([
        this.getUserInfo(jwtToken, senderId),
        this.createMessage(
          jwtToken,
          senderId,
          receiverId,
          messageContent,
          messageType,
          dialogId,
          attachment,
          metadata
        ),
        this.updateDialog(jwtToken, dialogId, dialogPreview, senderId, receiverId)
      ]);

      // Track message event
      if (this.postHog) {
        // Parse metadata for analytics if available
        let mediaSource = null;
        if (metadata) {
          try {
            const parsedMetadata = JSON.parse(metadata);
            mediaSource = parsedMetadata.mediaSource;
          } catch (e) {
            // Ignore parse errors for analytics
          }
        }

        await this.postHog.trackBusinessEvent('message_sent', {
          message_id: newMessage.$id,
          dialog_id: dialogId,
          sender_id: senderId,
          receiver_id: receiverId,
          message_type: messageType,
          has_attachment: !!attachment,
          attachment_type: attachment?.type,
          media_source: mediaSource,  // Track media source for analytics
          has_metadata: !!metadata
        }, senderId);
      }

      // Send push notification to receiver
      let notificationResult = { success: false };
      try {
        // Customize preview for media messages
        let messagePreview = messageContent;
        if (attachment) {
          const icons = { photo: '📷', video: '🎥', audio: '🎵' };
          if (messageContent) {
            // If there's a caption, show icon + caption
            messagePreview = `${icons[attachment.type] || ''} ${messageContent}`;
          } else {
            // If no caption, show icon + type
            messagePreview = `${icons[attachment.type] || ''} Sent a${attachment.type === 'audio' ? 'n' : ''} ${attachment.type}`;
          }
        } else if (messageContent && messageContent.length > 100) {
          messagePreview = messageContent.substring(0, 97) + '...';
        }

        notificationResult = await this.notificationTemplates.sendMessageNotification(
          senderId,
          receiverId,
          senderInfo.name || 'Someone',
          messagePreview,
          {
            dialogId: dialogId,
            messageId: newMessage.$id,
            unreadCount: await this.getUnreadCount(jwtToken, receiverId),
            messageType,
            hasAttachment: !!attachment
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
        notification: notificationResult,
        attachment
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
  async sendDirectMessage(jwtToken, senderId, receiverId, message, messageType, imageBase64 = null) {
    const context = {
      methodName: 'sendDirectMessage',
      senderId,
      receiverId,
      timestamp: new Date().toISOString()
    };

    try {
      // Validate messageType
      if (!messageType || ![1, 2, 3, 4].includes(messageType)) {
        throw new Error('Invalid message type');
      }

      // Validate message content for text messages
      if (messageType === 1) {
        if (!message || message.trim().length === 0) {
          throw new Error('Direct message cannot be empty for text type');
        }
        if (message.length > 5000) {
          throw new Error('Direct message is too long (max 5000 characters)');
        }
      }

      // Check for blockage BEFORE upload to avoid unnecessary uploads
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

      let attachment = null;
      let messageContent = message;

      // Handle media types (2=photo, 3=video, 4=audio) AFTER all validations
      if (messageType !== 1) {
        if (!imageBase64) {
          throw new Error(`Media data (imageBase64) is required for messageType ${messageType}`);
        }

        // Upload media to storage
        const config = this.getPhotoValidationConfig();
        const key = randomBytes(18).toString('hex').toLowerCase();
        const formatValidation = await this.validateImageFormat(imageBase64, config);
        const uploadResult = await this.uploadToS3(formatValidation.buffer, key);
        if (!uploadResult.success) {
          throw new Error(`Failed to upload media: ${uploadResult.error}`);
        }

        // Create attachment object
        attachment = {
          url: this.generatePhotoUrl(key),
          mimeType: uploadResult.mimeType,
          size: uploadResult.sizeMB,
          type: messageType === 2 ? 'photo' : messageType === 3 ? 'video' : 'audio'
        };

        // Keep original message as is (could be caption or empty)
        messageContent = message || '';

        this.log(`Direct message media uploaded: ${attachment.type} - ${uploadResult.key}`);
      }

      // Get or create direct conversation using admin operations
      const conversationId = await this.getOrCreateDirectConversation(jwtToken, senderId, receiverId);

      // Execute parallel operations: create message, get sender info, and update dialog
      const dialogPreview = messageContent || (attachment ? `Sent a${messageType === 4 ? 'n' : ''} ${attachment.type}` : '');

      const [messageDoc, senderInfo, updatedDialog] = await Promise.all([
        this.createMessage(
          jwtToken,
          senderId,
          receiverId,
          messageContent,
          messageType,
          conversationId,
          attachment

        ),
        this.getUserInfo(jwtToken, senderId),
        this.updateDialog(jwtToken, conversationId, dialogPreview, senderId, receiverId)
      ]);

      // Track direct message event
      if (this.postHog) {
        await this.postHog.trackBusinessEvent('direct_message_sent', {
          message_id: messageDoc.$id,
          dialog_id: conversationId,
          sender_id: senderId,
          receiver_id: receiverId,
          message_type: messageType,
          has_attachment: !!attachment,
          attachment_type: attachment?.type,
          message_length: messageContent.length,
          remaining_quota: quotaInfo?.remaining
        }, senderId);
      }

      // Send special direct message push notification
      let notificationResult = { success: false };
      try {
        // Customize preview for media messages
        let messagePreview = messageContent;
        if (attachment) {
          const icons = { photo: '📷', video: '🎥', audio: '🎵' };
          if (messageContent) {
            // If there's a caption, show icon + caption
            messagePreview = `${icons[attachment.type] || ''} ${messageContent}`;
          } else {
            // If no caption, show icon + type
            messagePreview = `${icons[attachment.type] || ''} Sent a${attachment.type === 'audio' ? 'n' : ''} ${attachment.type}`;
          }
        } else if (messageContent && messageContent.length > 100) {
          messagePreview = messageContent.substring(0, 97) + '...';
        }

        notificationResult = await this.notificationTemplates.sendDirectMessageNotification(
          senderId,
          receiverId,
          senderInfo.name || 'Someone',
          messagePreview,
          {
            dialogId: conversationId,
            messageId: messageDoc.$id,
            remainingCount: quotaInfo?.remaining,
            unreadCount: await this.getUnreadCount(jwtToken, receiverId),
            messageType,
            hasAttachment: !!attachment
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
        dialog: updatedDialog,
        quotaInfo,
        notification: notificationResult,
        attachment
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
      const dialogId = generateDocumentId('dialog', senderId, receiverId);
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
      throw new Error('Dialog not found');
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