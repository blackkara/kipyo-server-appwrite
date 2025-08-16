// src/services/appwrite/messaging/NotificationService.js

import { Messaging } from 'node-appwrite';
import { NOTIFICATION_EVENTS, NOTIFICATION_TYPES } from './NotificationConstants.js';

/**
 * Push Notification Service
 * Handles all push notification operations
 */
export class NotificationService {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.clientManager = dependencies.clientManager;
    this.performanceMonitor = dependencies.performanceMonitor;
    this.errorAnalyzer = dependencies.errorAnalyzer;
    this.postHog = dependencies.postHogService;
    this.config = dependencies.configManager;

    // Initialize messaging client
    this.messaging = null;
    this.initializeMessaging();

    // Statistics
    this.stats = {
      sent: 0,
      failed: 0,
      byType: {}
    };
  }

  /**
   * Initialize Messaging client
   * @private
   */
  initializeMessaging() {
    try {
      // Use admin client for messaging (requires API key)
      const adminClient = this.clientManager?.getAdminClient?.() || this.createStandaloneClient();
      this.messaging = new Messaging(adminClient);
      this.log('Messaging service initialized');
    } catch (error) {
      this.log('Failed to initialize messaging:', error.message);
      throw error;
    }
  }

  /**
   * Create standalone client if ClientManager not available
   * @private
   */
  createStandaloneClient() {
    const { Client } = require('node-appwrite');

    const endpoint = this.config?.get('appwrite.endpoint') || process.env.APPWRITE_END_POINT;
    const projectId = this.config?.get('appwrite.projectId') || process.env.APPWRITE_PROJECT_ID;
    const apiKey = this.config?.get('appwrite.apiKey') || process.env.APPWRITE_DEV_KEY;

    if (!endpoint || !projectId || !apiKey) {
      throw new Error('Appwrite configuration missing for messaging service');
    }

    return new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);
  }

  /**
   * Send push notification to specific users
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Array<string>} userIds - Target user IDs
   * @param {Object} data - Additional data payload
   * @param {Object} options - Notification options
   * @returns {Promise<Object>} - Notification result
   */
  async sendToUsers(title, body, userIds, data = {}, options = {}) {
    const context = {
      methodName: 'sendToUsers',
      notificationType: data.type || 'general',
      targetUserCount: userIds.length
    };

    return this.executeNotificationOperation(async () => {
      // Validate inputs
      this.validateNotificationInputs(title, body, userIds);

      // Prepare notification parameters
      const messageId = options.messageId || 'unique()';
      const notificationParams = this.buildNotificationParams(
        messageId,
        title,
        body,
        [],          // topics
        userIds,    // users
        [],          // targets
        data,
        options
      );

      // Send notification
      //const notification = await this.messaging.createPush(...notificationParams);
      const notification = await this.messaging.createPush(
        messageId,
        title,
        body,
        [],          // topics
        userIds,    // users
        [],          // targets
        data         // data payload

      );

      // Track success
      await this.trackNotificationSuccess(
        NOTIFICATION_EVENTS.NOTIFICATION_SENT,
        {
          notification_id: notification.$id,
          type: data.type || 'general',
          user_count: userIds.length,
          has_data: Object.keys(data).length > 0
        },
        userIds[0] // Track with first user
      );

      // Update statistics
      this.updateStatistics('sent', data.type);

      return {
        success: true,
        messageId: notification.$id,
        notification,
        targetUsers: userIds.length
      };

    }, context);
  }

  /**
   * Send notification to topics (broadcast)
   * @param {Array<string>} topics - Target topics
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional data payload
   * @param {Object} options - Notification options
   * @returns {Promise<Object>} - Notification result
   */
  async sendToTopics(topics, title, body, data = {}, options = {}) {
    const context = {
      methodName: 'sendToTopics',
      notificationType: 'broadcast',
      topicCount: topics.length
    };

    return this.executeNotificationOperation(async () => {
      // Validate inputs
      if (!topics || topics.length === 0) {
        throw new Error('At least one topic is required');
      }

      // Prepare notification parameters
      const messageId = options.messageId || 'unique()';
      const notificationParams = this.buildNotificationParams(
        messageId,
        title,
        body,
        topics,                      // topics
        options.users || [],         // users
        options.targets || [],       // targets
        data,
        options
      );

      // Send notification
      const notification = await this.messaging.createPush(...notificationParams);

      // Track success
      await this.trackNotificationSuccess(
        NOTIFICATION_EVENTS.BROADCAST_SENT,
        {
          notification_id: notification.$id,
          topics: topics,
          topic_count: topics.length,
          has_data: Object.keys(data).length > 0
        }
      );

      // Update statistics
      this.updateStatistics('sent', 'broadcast');

      return {
        success: true,
        messageId: notification.$id,
        notification,
        targetTopics: topics
      };

    }, context);
  }

  /**
   * Send batch notifications
   * @param {Array<Object>} notifications - Array of notification objects
   * @returns {Promise<Object>} - Batch results
   */
  async sendBatch(notifications) {
    const context = {
      methodName: 'sendBatch',
      notificationCount: notifications.length
    };

    return this.executeNotificationOperation(async () => {
      const results = {
        successful: [],
        failed: [],
        totalProcessed: 0
      };

      for (const notif of notifications) {
        try {
          const result = await this.sendToUsers(
            notif.title,
            notif.body,
            notif.userIds,
            notif.data || {},
            notif.options || {}
          );

          results.successful.push({
            index: results.totalProcessed,
            messageId: result.messageId,
            userIds: notif.userIds
          });

        } catch (error) {
          results.failed.push({
            index: results.totalProcessed,
            error: error.message,
            userIds: notif.userIds
          });
          this.updateStatistics('failed', notif.data?.type);
        }

        results.totalProcessed++;
      }

      results.successRate = (results.successful.length / results.totalProcessed) * 100;

      // Track batch operation
      await this.trackNotificationSuccess(
        NOTIFICATION_EVENTS.BATCH_SENT,
        {
          total_notifications: notifications.length,
          successful_count: results.successful.length,
          failed_count: results.failed.length,
          success_rate: results.successRate
        }
      );

      return results;
    }, context);
  }

  /**
   * Schedule a notification
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Array<string>} userIds - Target user IDs
   * @param {Date} scheduledAt - When to send
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Scheduled notification
   */
  async scheduleNotification(title, body, userIds, scheduledAt, data = {}) {
    if (!(scheduledAt instanceof Date) || scheduledAt <= new Date()) {
      throw new Error('scheduledAt must be a future date');
    }

    const options = {
      draft: true,
      scheduledAt: scheduledAt.toISOString()
    };

    return this.sendToUsers(title, body, userIds, data, options);
  }

  // Helper Methods

  /**
   * Build notification parameters
   * @private
   */
  buildNotificationParams(messageId, title, body, topics, users, targets, data, options) {
    return [
      messageId,
      title,
      body,
      topics,
      users,
      targets,
      data,
      options.draft || false,
      options.scheduledAt || null,
      options.action || null,
      options.image || null,
      options.icon || null,
      options.sound || 'default',
      options.color || null,
      options.tag || null,
      options.badge || null
    ];
  }

  /**
   * Validate notification inputs
   * @private
   */
  validateNotificationInputs(title, body, userIds) {
    if (!title || !body) {
      throw new Error('Title and body are required');
    }

    if (!userIds || userIds.length === 0) {
      throw new Error('At least one user ID is required');
    }

    if (title.length > 100) {
      throw new Error('Title must be 100 characters or less');
    }

    if (body.length > 500) {
      throw new Error('Body must be 500 characters or less');
    }
  }

  /**
   * Execute notification operation with error handling
   * @private
   */
  async executeNotificationOperation(operation, context) {
    try {
      // Performance tracking
      if (this.performanceMonitor) {
        return await this.performanceMonitor.trackOperation(
          context.methodName,
          operation,
          context
        );
      }

      return await operation();

    } catch (error) {
      // Error analysis
      if (this.errorAnalyzer) {
        await this.errorAnalyzer.trackError(error, context);
      }

      // Update failure statistics
      this.updateStatistics('failed', context.notificationType);

      this.log(`Notification operation failed: ${error.message}`, context);
      throw error;
    }
  }

  /**
   * Update statistics
   * @private
   */
  updateStatistics(type, notificationType) {
    if (type === 'sent') {
      this.stats.sent++;
    } else if (type === 'failed') {
      this.stats.failed++;
    }

    if (notificationType) {
      if (!this.stats.byType[notificationType]) {
        this.stats.byType[notificationType] = { sent: 0, failed: 0 };
      }
      this.stats.byType[notificationType][type === 'sent' ? 'sent' : 'failed']++;
    }
  }

  /**
   * Track notification success
   * @private
   */
  async trackNotificationSuccess(eventName, data, userId = 'system') {
    if (!this.postHog) return;

    try {
      await this.postHog.trackBusinessEvent(eventName, data, userId);
    } catch (error) {
      this.log('Failed to track notification event:', error.message);
    }
  }

  /**
   * Get notification statistics
   * @returns {Object} - Statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.sent > 0 ?
        (this.stats.sent / (this.stats.sent + this.stats.failed)) * 100 : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      sent: 0,
      failed: 0,
      byType: {}
    };
    this.log('Notification statistics reset');
  }
}

export default NotificationService;