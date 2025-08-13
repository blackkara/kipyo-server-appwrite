// src/services/appwrite/messaging/NotificationConstants.js

/**
 * Notification Types
 */
export const NOTIFICATION_TYPES = {
  MATCH: 'match',
  LIKE: 'like',
  MESSAGE: 'message',
  SYSTEM: 'system',
  PROMOTION: 'promotion',
  REMINDER: 'reminder',
  ALERT: 'alert'
};

/**
 * Notification Events for Tracking
 */
export const NOTIFICATION_EVENTS = {
  NOTIFICATION_SENT: 'notification_sent',
  NOTIFICATION_FAILED: 'notification_failed',
  BATCH_SENT: 'notification_batch_sent',
  BROADCAST_SENT: 'notification_broadcast_sent',
  SCHEDULED: 'notification_scheduled'
};

/**
 * Notification Priorities
 */
export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Default Notification Options
 */
export const DEFAULT_OPTIONS = {
  sound: 'default',
  badge: 1,
  priority: NOTIFICATION_PRIORITIES.NORMAL,
  contentAvailable: false,
  critical: false,
  draft: false
};

/**
 * Notification Templates
 */
export const NOTIFICATION_TEMPLATES = {
  MATCH: {
    title: "It's a Match! 🎉",
    body: "You have a new match! Start chatting now."
  },
  LIKE: {
    title: "New Like ❤️",
    body: "{userName} liked your profile!"
  },
  MESSAGE: {
    title: "New message from {senderName}",
    body: "{messagePreview}"
  },
  SYSTEM: {
    title: "System Notification",
    body: "{message}"
  }
};

/**
 * Topic Names
 */
export const TOPICS = {
  ALL_USERS: 'all_users',
  PREMIUM_USERS: 'premium_users',
  NEW_USERS: 'new_users',
  INACTIVE_USERS: 'inactive_users'
};

export default {
  NOTIFICATION_TYPES,
  NOTIFICATION_EVENTS,
  NOTIFICATION_PRIORITIES,
  DEFAULT_OPTIONS,
  NOTIFICATION_TEMPLATES,
  TOPICS
};