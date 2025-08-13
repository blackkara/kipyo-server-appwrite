// src/services/appwrite/vision/ImageAnalysisConstants.js

/**
 * Safety Levels (Google Vision API)
 */
export const SAFETY_LEVELS = {
  UNKNOWN: 'UNKNOWN',
  VERY_UNLIKELY: 'VERY_UNLIKELY',
  UNLIKELY: 'UNLIKELY',
  POSSIBLE: 'POSSIBLE',
  LIKELY: 'LIKELY',
  VERY_LIKELY: 'VERY_LIKELY'
};

/**
 * Rejection Reasons
 */
export const REJECTION_REASONS = {
  ADULT_CONTENT: 'adult_content',
  VIOLENCE: 'violence',
  RACY_CONTENT: 'racy_content',
  MEDICAL_CONTENT: 'medical_content',
  SPOOF_CONTENT: 'spoof_content',
  NO_FACE_DETECTED: 'no_face_detected',
  MULTIPLE_FACES: 'multiple_faces',
  BLURRED_FACE: 'blurred_face',
  INAPPROPRIATE_TEXT: 'inappropriate_text',
  ILLEGAL_CONTENT: 'illegal_content',
  HATE_SYMBOLS: 'hate_symbols',
  WEAPONS: 'weapons',
  DRUGS: 'drugs',
  NUDITY: 'nudity'
};

/**
 * Analysis Events for Tracking
 */
export const ANALYSIS_EVENTS = {
  IMAGE_ANALYZED: 'image_analyzed',
  IMAGE_APPROVED: 'image_approved',
  IMAGE_REJECTED: 'image_rejected',
  PROFILE_PHOTO_ANALYZED: 'profile_photo_analyzed',
  BATCH_ANALYZED: 'batch_analyzed',
  CONTENT_MODERATED: 'content_moderated',
  ANALYSIS_FAILED: 'analysis_failed'
};

/**
 * Content Types
 */
export const CONTENT_TYPES = {
  PROFILE_PHOTO: 'profile_photo',
  GALLERY_PHOTO: 'gallery_photo',
  MESSAGE_ATTACHMENT: 'message_attachment',
  POST_IMAGE: 'post_image',
  VERIFICATION_PHOTO: 'verification_photo'
};

/**
 * Moderation Actions
 */
export const MODERATION_ACTIONS = {
  APPROVE: 'approve',
  FLAG: 'flag',
  BLOCK: 'block',
  REVIEW: 'review'
};

/**
 * Analysis Limits
 */
export const ANALYSIS_LIMITS = {
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_BATCH_SIZE: 10,
  CACHE_TTL: 60 * 60 * 1000, // 1 hour
  MAX_CACHE_SIZE: 100
};

/**
 * Face Detection Thresholds
 */
export const FACE_THRESHOLDS = {
  MIN_CONFIDENCE: 0.5,
  MAX_FACES_PROFILE: 1,
  MAX_FACES_GROUP: 10
};

/**
 * Inappropriate Content Thresholds
 */
export const INAPPROPRIATE_THRESHOLDS = {
  ADULT: ['LIKELY', 'VERY_LIKELY'],
  VIOLENCE: ['LIKELY', 'VERY_LIKELY'],
  RACY: ['LIKELY', 'VERY_LIKELY'],
  MEDICAL: ['VERY_LIKELY'],
  SPOOF: ['VERY_LIKELY']
};

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  IMAGE_TOO_LARGE: 'Image size exceeds maximum allowed',
  INVALID_IMAGE_FORMAT: 'Invalid image format',
  ANALYSIS_FAILED: 'Image analysis failed',
  NO_FACE_IN_PROFILE: 'Profile photo must contain a face',
  MULTIPLE_FACES_IN_PROFILE: 'Profile photo must contain only one face',
  INAPPROPRIATE_CONTENT: 'Image contains inappropriate content',
  SERVICE_UNAVAILABLE: 'Image analysis service is temporarily unavailable'
};

/**
 * Supported Image Formats
 */
export const SUPPORTED_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp'
];

export default {
  SAFETY_LEVELS,
  REJECTION_REASONS,
  ANALYSIS_EVENTS,
  CONTENT_TYPES,
  MODERATION_ACTIONS,
  ANALYSIS_LIMITS,
  FACE_THRESHOLDS,
  INAPPROPRIATE_THRESHOLDS,
  ERROR_MESSAGES,
  SUPPORTED_FORMATS
};