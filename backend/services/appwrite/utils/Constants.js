// src/services/appwrite/utils/Constants.js

/**
 * AppwriteService Constants and Configuration
 * Contains all static configurations, error mappings, and constants
 */

// Network & Retry Configuration
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNABORTED'
  ]
};

// Cache Configuration
export const CACHE_CONFIG = {
  maxCacheSize: 50,
  cacheTimeout: 30 * 60 * 1000, // 30 minutes
  cleanupInterval: 10 * 60 * 1000 // 10 minutes
};

// Appwrite-specific error mapping
export const APPWRITE_ERROR_MAP = {
  'user_session_not_found': 'Session expired or revoked',
  'user_jwt_invalid': 'JWT signature invalid',
  'user_blocked': 'User account is blocked',
  'user_unauthorized': 'User not authorized for this action',
  'project_unknown': 'Invalid project configuration',
  'document_not_found': 'Document does not exist',
  'collection_not_found': 'Collection does not exist',
  'user_more_than_one_target': 'Multiple authentication methods provided'
};

// HTTP Status Code Messages
export const HTTP_STATUS_MESSAGES = {
  401: 'Authentication Failed',
  403: 'Permission Denied',
  404: 'Resource Not Found',
  429: 'Rate Limit Exceeded',
  500: 'Server Error',
  502: 'Server Error',
  503: 'Server Error'
};

// Error Debug Suggestions
export const ERROR_DEBUG_SUGGESTIONS = {
  401: {
    jwt: [
      'Check JWT signature and expiration',
      'Verify JWT was issued by correct Appwrite instance'
    ],
    session: [
      'User session may have been terminated',
      'Check if user is still active in Appwrite'
    ]
  },
  403: [
    'Check document permissions',
    'Verify user has required role'
  ],
  404: [
    'Verify document/collection exists',
    'Check database and collection IDs'
  ],
  429: [
    'Implement exponential backoff',
    'Check Appwrite plan limits'
  ],
  500: [
    'Check Appwrite service status',
    'Retry with exponential backoff'
  ]
};

// Network Error Messages
export const RETRYABLE_NETWORK_MESSAGES = [
  'network socket disconnected',
  'socket disconnected',
  'connection reset',
  'connection refused',
  'timeout',
  'dns lookup failed',
  'fetch failed'
];

// Health Score Thresholds
export const HEALTH_THRESHOLDS = {
  excellent: 90,
  good: 70,
  fair: 50,
  poor: 30,
  critical: 0
};

// Circuit Breaker Configuration
export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  cooldownPeriod: 2 * 60 * 1000, // 2 minutes
  healthScoreThreshold: 30
};

// JWT Validation Configuration
export const JWT_CONFIG = {
  maxPayloadSize: 10000, // 10KB limit
  tokenExpiryWarning: 5 * 60 * 1000, // 5 minutes
  healthCheckScoreThreshold: 70
};

// Performance Metrics
export const PERFORMANCE_THRESHOLDS = {
  fastResponse: 100, // ms
  normalResponse: 500, // ms
  slowResponse: 2000 // ms
};

// Usage Frequency Thresholds
export const USAGE_FREQUENCY = {
  veryActive: 60000, // < 1 min
  active: 300000, // < 5 min
  moderate: 1800000, // < 30 min
  inactive: Infinity
};

// Memory Thresholds
export const MEMORY_THRESHOLDS = {
  warningUtilization: 0.7, // 70%
  criticalUtilization: 0.8, // 80%
  cacheWarningUtilization: 0.9 // 90%
};

// Error Categories
export const ERROR_CATEGORIES = {
  NETWORK: 'network_connectivity',
  AUTH: 'authentication_failed',
  PERMISSION: 'authorization_failed',
  NOT_FOUND: 'resource_not_found',
  RATE_LIMIT: 'rate_limited',
  SERVER: 'server_error',
  APPWRITE: 'appwrite_error',
  TOKEN_FORMAT: 'token_format_error',
  TOKEN_CLEANING: 'token_cleaning_error',
  UNKNOWN: 'unknown_validation_error'
};

// Event Names for Tracking
export const TRACKING_EVENTS = {
  // Authentication Events
  USER_AUTHENTICATED: 'user_authenticated',
  JWT_VALIDATION_FAILED: 'jwt_validation_failed',
  JWT_HEALTH_CHECK: 'jwt_health_check',

  // Document Events
  DOCUMENTS_LISTED: 'documents_listed',
  DOCUMENT_RETRIEVED: 'document_retrieved',
  DOCUMENT_CREATED: 'document_created',
  DOCUMENT_UPDATED: 'document_updated',
  DOCUMENT_DELETED: 'document_deleted',
  USER_DOCUMENTS_BULK_DELETED: 'user_documents_bulk_deleted',

  // Admin Events
  ADMIN_DOCUMENT_CREATED: 'admin_document_created',
  ADMIN_DOCUMENT_UPDATED: 'admin_document_updated',
  ADMIN_DOCUMENT_DELETED: 'admin_document_deleted',

  // Network Events
  NETWORK_RETRY_SUCCESS: 'network_retry_success',
  NETWORK_ERROR: 'network_error',
  CONNECTION_TEST: 'connection_test',

  // Cache Events
  CLIENT_CACHE_EVICTION: 'client_cache_eviction',
  CACHE_HIT: 'cache_hit',
  CACHE_MISS: 'cache_miss'
};


// Default Export for backward compatibility
export default {
  RETRY_CONFIG,
  CACHE_CONFIG,
  APPWRITE_ERROR_MAP,
  HTTP_STATUS_MESSAGES,
  ERROR_DEBUG_SUGGESTIONS,
  RETRYABLE_NETWORK_MESSAGES,
  HEALTH_THRESHOLDS,
  CIRCUIT_BREAKER_CONFIG,
  JWT_CONFIG,
  PERFORMANCE_THRESHOLDS,
  USAGE_FREQUENCY,
  MEMORY_THRESHOLDS,
  ERROR_CATEGORIES,
  TRACKING_EVENTS,
};