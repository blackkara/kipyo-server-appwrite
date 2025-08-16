// src/services/appwrite/translate/TranslateConstants.js

/**
 * Supported Languages
 */
export const SUPPORTED_LANGUAGES = {
  'en': { name: 'English', nativeName: 'English', active: true },
  'tr': { name: 'Turkish', nativeName: 'Türkçe', active: true },
  'es': { name: 'Spanish', nativeName: 'Español', active: true },
  'fr': { name: 'French', nativeName: 'Français', active: true },
  'de': { name: 'German', nativeName: 'Deutsch', active: true },
  'it': { name: 'Italian', nativeName: 'Italiano', active: true },
  'pt': { name: 'Portuguese', nativeName: 'Português', active: true },
  'ru': { name: 'Russian', nativeName: 'Русский', active: true },
  'ar': { name: 'Arabic', nativeName: 'العربية', active: true },
  'zh': { name: 'Chinese', nativeName: '中文', active: true },
  'ja': { name: 'Japanese', nativeName: '日本語', active: true },
  'ko': { name: 'Korean', nativeName: '한국어', active: true },
  'hi': { name: 'Hindi', nativeName: 'हिन्दी', active: true },
  'nl': { name: 'Dutch', nativeName: 'Nederlands', active: true },
  'sv': { name: 'Swedish', nativeName: 'Svenska', active: true },
  'th': { name: 'Thai', nativeName: 'ไทย', active: true }
};

/**
 * Translation Events for Tracking
 */
export const TRANSLATION_EVENTS = {
  MESSAGE_TRANSLATED: 'message_translated',
  BATCH_TRANSLATED: 'batch_translated',
  CONVERSATION_TRANSLATED: 'conversation_translated',
  TRANSLATION_FAILED: 'translation_failed',
  LANGUAGE_DETECTED: 'language_detected',
  CACHE_HIT: 'translation_cache_hit'
};

/**
 * Translation Limits
 */
export const TRANSLATION_LIMITS = {
  FREE_TIER: {
    dailyLimit: 100,
    monthlyLimit: 2000,
    maxTextLength: 1000
  },
  PREMIUM_TIER: {
    dailyLimit: 1000,
    monthlyLimit: 30000,
    maxTextLength: 5000
  },
  UNLIMITED_TIER: {
    dailyLimit: null,
    monthlyLimit: null,
    maxTextLength: 10000
  }
};

/**
 * Cache Configuration
 */
export const CACHE_CONFIG = {
  maxSize: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  cleanupInterval: 60 * 60 * 1000 // 1 hour
};

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  LANGUAGE_NOT_SUPPORTED: 'The requested language is not supported',
  MESSAGE_NOT_FOUND: 'Message not found',
  TRANSLATION_FAILED: 'Translation service failed',
  QUOTA_EXCEEDED: 'Translation quota exceeded',
  TEXT_TOO_LONG: 'Text exceeds maximum length for translation',
  INVALID_TOKEN: 'Invalid authentication token',
  SERVICE_UNAVAILABLE: 'Translation service is temporarily unavailable'
};

export default {
  SUPPORTED_LANGUAGES,
  TRANSLATION_EVENTS,
  TRANSLATION_LIMITS,
  CACHE_CONFIG,
  ERROR_MESSAGES
};