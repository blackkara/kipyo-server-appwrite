import { Client, Messaging } from 'node-appwrite';
import AppwriteService from './services/appwrite/AppwriteService.js';

/**
 * Legacy PushNotificationService
 * Now acts as a wrapper around the new AppwriteService notification system
 * Maintained for backward compatibility
 */
class PushNotificationService {
  constructor() {
    // Try to use AppwriteService if available
    try {
      this.appwriteService = AppwriteService.getInstance();
      this.useAppwriteService = true;
    } catch (e) {
      // Fallback to direct Messaging client if AppwriteService not available
      this.useAppwriteService = false;
      this.client = new Client()
        .setEndpoint(process.env.APPWRITE_END_POINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_DEV_KEY);
      this.messaging = new Messaging(this.client);
    }
  }

  async sendToUsers(title, body, userIds, data = {}, options = {}) {
    // Use new AppwriteService if available
    if (this.useAppwriteService) {
      return this.appwriteService.sendNotification(title, body, userIds, data, options);
    }
    
    // Fallback to direct messaging
    try {
      const messageId = options.messageId || 'unique()';
      const notification = await this.messaging.createPush(
        messageId,
        title,
        body,
        [],          // topics
        userIds,    // users
        [],          // targets
        data         // data payload
      
      );

      return {
        success: true,
        messageId: notification.$id,
        notification
      };

    } catch (error) {
      console.error('Push notification failed:', error);
      throw new Error(`Failed to send push notification: ${error.message}`);
    }
  }

  /**
   * Send notification for match event
   */
  async sendMatchNotification(userId1, userId2, matchData) {
    // Use new AppwriteService if available
    if (this.useAppwriteService) {
      return this.appwriteService.sendMatchNotification(userId1, userId2, matchData);
    }
    
    // Fallback to old implementation
    const title = "It's a Match! 🎉";
    const body = "You have a new match! Start chatting now.";

    const data = {
      type: 'match',
      matchId: matchData.matchId,
      userId: userId1 // For userId2, this will be userId1
    };

    // Send to both users
    await Promise.all([
      this.sendToUsers(title, body, [userId1], { ...data, userId: userId2 }),
      this.sendToUsers(title, body, [userId2], { ...data, userId: userId1 })
    ]);
  }

  /**
   * Send notification for new like
   */
  async sendLikeNotification(likerId, likedId, likerName) {
    // Use new AppwriteService if available
    if (this.useAppwriteService) {
      return this.appwriteService.sendLikeNotification(likerId, likedId, likerName);
    }
    
    // Fallback to old implementation
    const title = "New Like ❤️";
    const body = `${likerName} liked your profile!`;

    const data = {
      type: 'like',
      likerId: likerId
    };

    await this.sendToUsers(title, body, [likedId], data);
  }

  /**
   * Send notification for new message
   */
  async sendMessageNotification(senderId, receiverId, senderName, messagePreview) {
    // Use new AppwriteService if available
    if (this.useAppwriteService) {
      return this.appwriteService.sendMessageNotification(senderId, receiverId, senderName, messagePreview);
    }
    
    // Fallback to old implementation
    const title = `New message from ${senderName}`;
    const body = messagePreview;

    const data = {
      type: 'message',
      senderId: senderId,
      conversationId: `${[senderId, receiverId].sort().join('_')}`
    };

    await this.sendToUsers(title, body, [receiverId], data);
  }

  /**
   * Send notification to topics (broadcast)
   */
  async sendToTopic(topic, title, body, data = {}, options = {}) {
    // Use new AppwriteService if available
    if (this.useAppwriteService) {
      return this.appwriteService.sendTopicNotification(topic, title, body, data, options);
    }
    
    // Fallback to old implementation
    try {
      const notification = await this.messaging.createPush(
        options.messageId || 'unique()',
        title,
        body,
        [topic],                     // topics
        options.users || [],         // users
        options.targets || [],       // targets
        data,
        options.action || '',
        options.icon || '',
        options.sound || 'default',
        options.color || '',
        options.tag || '',
        options.badge || 1,
        options.contentAvailable || false,
        options.critical || false,
        options.priority || 'normal',
        options.draft || false,
        options.scheduledAt || ''
      );

      return {
        success: true,
        messageId: notification.$id,
        notification
      };

    } catch (error) {
      console.error('Topic push notification failed:', error);
      throw new Error(`Failed to send topic push notification: ${error.message}`);
    }
  }
}

export default new PushNotificationService();