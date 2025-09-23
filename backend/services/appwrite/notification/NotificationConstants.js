export const NOTIFICATION_TYPES = {
  MATCH: 'match',
  LIKE: 'like',
  MESSAGE: 'message',
  DIRECT_MESSAGE: 'direct_message',
  SYSTEM: 'system',
  PROMOTION: 'promotion',
  REMINDER: 'reminder',
  ALERT: 'alert'
};

export const NOTIFICATION_EVENTS = {
  NOTIFICATION_SENT: 'notification_sent',
  NOTIFICATION_FAILED: 'notification_failed',
  BATCH_SENT: 'notification_batch_sent',
  BROADCAST_SENT: 'notification_broadcast_sent',
  SCHEDULED: 'notification_scheduled'
};

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical'
};

export const DEFAULT_OPTIONS = {
  sound: 'default',
  badge: 1,
  priority: NOTIFICATION_PRIORITIES.NORMAL,
  contentAvailable: false,
  critical: false,
  draft: false
};

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
  DIRECT_MESSAGE: {
    title: "Direct Message 💬",
    body: "{senderName} sent you a direct message!"
  },
  SYSTEM: {
    title: "System Notification",
    body: "{message}"
  }
};

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