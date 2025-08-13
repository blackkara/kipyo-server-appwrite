// src/services/appwrite/messaging/PushNotificationService.js

import { NotificationService } from './NotificationService.js';
import { NotificationTemplates } from './NotificationTemplates.js';

/**
 * PushNotificationService - Backward Compatible Wrapper
 * Maintains the same API as the original service while using the new modular structure
 */
class PushNotificationService {
  constructor() {
    // Initialize with dependencies if available
    this.initializeDependencies();
    
    // Initialize core services
    this.notificationService = new NotificationService(this.dependencies);
    this.templates = new NotificationTemplates(this.notificationService);
    
    // For backward compatibility - expose messaging directly
    this.messaging = this.notificationService.messaging;
  }

  /**
   * Initialize dependencies
   * @private
   */
  initializeDependencies() {
    this.dependencies = {};
    
    // Try to get dependencies from AppwriteService if available
    try {
      const AppwriteService = require('../AppwriteService.js').default;
      const instance = AppwriteService.getInstance();
      
      if (instance) {
        this.dependencies = {
          logger: instance.log,
          clientManager: instance.clientManager,
          performanceMonitor: instance.performanceMonitor,
          errorAnalyzer: instance.errorAnalyzer,
          postHogService: instance.postHog,
          configManager: instance.configManager
        };
      }
    } catch (e) {
      // AppwriteService not available, use defaults
      console.log('PushNotificationService: Using standalone mode');
    }
  }

  /**
   * Send to users - Backward compatible method
   */
  async sendToUsers(title, body, userIds, data = {}, options = {}) {
    return this.notificationService.sendToUsers(title, body, userIds, data, options);
  }

  /**
   * Send match notification - Backward compatible method
   */
  async sendMatchNotification(userId1, userId2, matchData) {
    return this.templates.sendMatchNotification(userId1, userId2, matchData);
  }

  /**
   * Send like notification - Backward compatible method
   */
  async sendLikeNotification(likerId, likedId, likerName) {
    return this.templates.sendLikeNotification(likerId, likedId, likerName);
  }

  /**
   * Send message notification - Backward compatible method
   */
  async sendMessageNotification(senderId, receiverId, senderName, messagePreview) {
    const conversationData = {
      conversationId: `${[senderId, receiverId].sort().join('_')}`
    };
    
    return this.templates.sendMessageNotification(
      senderId, 
      receiverId, 
      senderName, 
      messagePreview,
      conversationData
    );
  }

  /**
   * Send to topic - Backward compatible method
   */
  async sendToTopic(topic, title, body, data = {}, options = {}) {
    return this.notificationService.sendToTopics([topic], title, body, data, options);
  }

  /**
   * Get notification statistics
   */
  getStatistics() {
    return this.notificationService.getStatistics();
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    return this.notificationService.resetStatistics();
  }
}

// Export singleton instance for backward compatibility
let instance = null;

export function getInstance() {
  if (!instance) {
    instance = new PushNotificationService();
  }
  return instance;
}

// Default export as singleton
export default getInstance();