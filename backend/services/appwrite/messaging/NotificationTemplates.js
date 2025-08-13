// src/services/appwrite/messaging/NotificationTemplates.js

import { 
  NOTIFICATION_TYPES, 
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_PRIORITIES 
} from './NotificationConstants.js';

/**
 * Application-specific notification templates
 * Handles formatted notifications for specific use cases
 */
export class NotificationTemplates {
  constructor(notificationService) {
    this.notificationService = notificationService;
    this.log = notificationService.log || console.log;
  }

  /**
   * Send notification for match event
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @param {Object} matchData - Match information
   * @returns {Promise<Object>} - Notification results
   */
  async sendMatchNotification(userId1, userId2, matchData) {
    const template = NOTIFICATION_TEMPLATES.MATCH;
    const title = template.title;
    const body = template.body;

    const baseData = {
      type: NOTIFICATION_TYPES.MATCH,
      matchId: matchData.matchId,
      timestamp: new Date().toISOString()
    };

    // Send to both users with appropriate partner ID
    const notifications = [
      {
        title,
        body,
        userIds: [userId1],
        data: { ...baseData, partnerId: userId2, partnerName: matchData.user2Name },
        options: { priority: NOTIFICATION_PRIORITIES.HIGH }
      },
      {
        title,
        body,
        userIds: [userId2],
        data: { ...baseData, partnerId: userId1, partnerName: matchData.user1Name },
        options: { priority: NOTIFICATION_PRIORITIES.HIGH }
      }
    ];

    const results = await this.notificationService.sendBatch(notifications);
    
    this.log(`Match notifications sent: ${results.successful.length}/2 successful`);
    
    return results;
  }

  /**
   * Send notification for new like
   * @param {string} likerId - User who liked
   * @param {string} likedId - User who was liked
   * @param {string} likerName - Name of liker
   * @param {Object} additionalData - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  async sendLikeNotification(likerId, likedId, likerName, additionalData = {}) {
    const template = NOTIFICATION_TEMPLATES.LIKE;
    const title = template.title;
    const body = template.body.replace('{userName}', likerName);

    const data = {
      type: NOTIFICATION_TYPES.LIKE,
      likerId,
      likerName,
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      [likedId],
      data,
      { priority: NOTIFICATION_PRIORITIES.NORMAL }
    );

    this.log(`Like notification sent to user ${likedId}`);
    
    return result;
  }

  /**
   * Send notification for new message
   * @param {string} senderId - Message sender ID
   * @param {string} receiverId - Message receiver ID
   * @param {string} senderName - Sender name
   * @param {string} messagePreview - Message preview text
   * @param {Object} conversationData - Conversation details
   * @returns {Promise<Object>} - Notification result
   */
  async sendMessageNotification(senderId, receiverId, senderName, messagePreview, conversationData = {}) {
    const template = NOTIFICATION_TEMPLATES.MESSAGE;
    const title = template.title.replace('{senderName}', senderName);
    
    // Truncate message preview if too long
    const truncatedPreview = messagePreview.length > 100 ? 
      messagePreview.substring(0, 97) + '...' : 
      messagePreview;
    
    const body = template.body.replace('{messagePreview}', truncatedPreview);

    const data = {
      type: NOTIFICATION_TYPES.MESSAGE,
      senderId,
      senderName,
      conversationId: conversationData.conversationId || 
        `${[senderId, receiverId].sort().join('_')}`,
      messageId: conversationData.messageId,
      timestamp: new Date().toISOString()
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      [receiverId],
      data,
      { 
        priority: NOTIFICATION_PRIORITIES.HIGH,
        sound: 'message',
        badge: conversationData.unreadCount || 1
      }
    );

    this.log(`Message notification sent to user ${receiverId}`);
    
    return result;
  }

  /**
   * Send system notification
   * @param {Array<string>} userIds - Target users
   * @param {string} message - System message
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  async sendSystemNotification(userIds, message, data = {}) {
    const template = NOTIFICATION_TEMPLATES.SYSTEM;
    const title = template.title;
    const body = template.body.replace('{message}', message);

    const notificationData = {
      type: NOTIFICATION_TYPES.SYSTEM,
      timestamp: new Date().toISOString(),
      ...data
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      userIds,
      notificationData,
      { priority: NOTIFICATION_PRIORITIES.NORMAL }
    );

    this.log(`System notification sent to ${userIds.length} users`);
    
    return result;
  }

  /**
   * Send promotional notification
   * @param {Array<string>} userIds - Target users
   * @param {string} title - Promo title
   * @param {string} body - Promo body
   * @param {Object} promoData - Promotion details
   * @returns {Promise<Object>} - Notification result
   */
  async sendPromotionalNotification(userIds, title, body, promoData = {}) {
    const data = {
      type: NOTIFICATION_TYPES.PROMOTION,
      promoId: promoData.promoId,
      expiresAt: promoData.expiresAt,
      discount: promoData.discount,
      timestamp: new Date().toISOString()
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      userIds,
      data,
      { 
        priority: NOTIFICATION_PRIORITIES.LOW,
        image: promoData.imageUrl
      }
    );

    this.log(`Promotional notification sent to ${userIds.length} users`);
    
    return result;
  }

  /**
   * Send reminder notification
   * @param {Array<string>} userIds - Target users
   * @param {string} title - Reminder title
   * @param {string} body - Reminder body
   * @param {Object} reminderData - Reminder details
   * @returns {Promise<Object>} - Notification result
   */
  async sendReminderNotification(userIds, title, body, reminderData = {}) {
    const data = {
      type: NOTIFICATION_TYPES.REMINDER,
      reminderId: reminderData.reminderId,
      action: reminderData.action,
      timestamp: new Date().toISOString()
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      userIds,
      data,
      { 
        priority: NOTIFICATION_PRIORITIES.NORMAL,
        action: reminderData.actionUrl
      }
    );

    this.log(`Reminder notification sent to ${userIds.length} users`);
    
    return result;
  }

  /**
   * Send notification to all users in a topic
   * @param {string} topic - Topic name
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  async sendTopicNotification(topic, title, body, data = {}) {
    const result = await this.notificationService.sendToTopics(
      [topic],
      title,
      body,
      {
        type: NOTIFICATION_TYPES.SYSTEM,
        topic,
        timestamp: new Date().toISOString(),
        ...data
      }
    );

    this.log(`Topic notification sent to topic: ${topic}`);
    
    return result;
  }

  /**
   * Send bulk personalized notifications
   * @param {Array<Object>} notifications - Array of personalized notifications
   * @returns {Promise<Object>} - Bulk results
   */
  async sendBulkPersonalized(notifications) {
    // Transform notifications to include proper templates
    const transformedNotifications = notifications.map(notif => {
      // Apply template if type is specified
      if (notif.type && NOTIFICATION_TEMPLATES[notif.type.toUpperCase()]) {
        const template = NOTIFICATION_TEMPLATES[notif.type.toUpperCase()];
        
        // Replace template variables
        let title = notif.title || template.title;
        let body = notif.body || template.body;
        
        // Replace variables in template
        if (notif.variables) {
          Object.entries(notif.variables).forEach(([key, value]) => {
            title = title.replace(`{${key}}`, value);
            body = body.replace(`{${key}}`, value);
          });
        }
        
        return {
          ...notif,
          title,
          body,
          data: {
            type: notif.type,
            ...notif.data
          }
        };
      }
      
      return notif;
    });

    const results = await this.notificationService.sendBatch(transformedNotifications);
    
    this.log(`Bulk personalized notifications: ${results.successful.length}/${notifications.length} successful`);
    
    return results;
  }

  /**
   * Schedule a notification for future delivery
   * @param {Array<string>} userIds - Target users
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Date} scheduledAt - When to send
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Scheduled notification
   */
  async scheduleNotification(userIds, title, body, scheduledAt, data = {}) {
    const result = await this.notificationService.scheduleNotification(
      title,
      body,
      userIds,
      scheduledAt,
      data
    );

    this.log(`Notification scheduled for ${scheduledAt.toISOString()} to ${userIds.length} users`);
    
    return result;
  }
}

export default NotificationTemplates;