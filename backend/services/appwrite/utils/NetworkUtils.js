// src/services/appwrite/utils/NetworkUtils.js

import { 
  RETRY_CONFIG, 
  RETRYABLE_NETWORK_MESSAGES,
  APPWRITE_ERROR_MAP,
  HTTP_STATUS_MESSAGES,
  ERROR_DEBUG_SUGGESTIONS,
  ERROR_CATEGORIES
} from './Constants.js';

/**
 * Network utilities for error analysis and connection management
 */
export class NetworkUtils {
  /**
   * Check if an error is retryable based on error code and message
   * @param {Error} error - The error to analyze
   * @returns {boolean} - Whether the error is retryable
   */
  static isRetryableNetworkError(error) {
    if (!error) return false;

    // Check error code
    if (error.code && RETRY_CONFIG.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check error message
    const errorMessage = (error.message || '').toLowerCase();
    return RETRYABLE_NETWORK_MESSAGES.some(msg => errorMessage.includes(msg));
  }

  /**
   * Analyze network error and provide detailed information
   * @param {Error} error - The error to analyze
   * @param {Object} connectionHealth - Current connection health state
   * @returns {Object} - Detailed network error analysis
   */
  static analyzeNetworkError(error, connectionHealth = {}) {
    return {
      errorCode: error.code || null,
      errorMessage: error.message || null,
      errorType: error.name || null,
      isNetworkError: this.isRetryableNetworkError(error),
      endpoint: error.hostname || connectionHealth.endpoint,
      port: error.port || 443,
      timestamp: new Date().toISOString(),
      connectionHealthSnapshot: { ...connectionHealth }
    };
  }

  /**
   * Analyze Appwrite-specific errors
   * @param {Error} error - The error to analyze
   * @returns {Object} - Detailed Appwrite error analysis
   */
  static analyzeAppwriteError(error) {
    const analysis = {
      isAppwriteError: false,
      errorType: 'unknown',
      errorDescription: null,
      probableCause: 'Unknown',
      debugSuggestions: [],
      httpStatus: null,
      appwriteCode: null
    };

    // Detect Appwrite error
    if (error.code || error.type || error.response) {
      analysis.isAppwriteError = true;
      analysis.appwriteCode = error.code;
      analysis.httpStatus = error.response?.status || error.status;
    }

    // Map error type
    if (analysis.appwriteCode && APPWRITE_ERROR_MAP[analysis.appwriteCode]) {
      analysis.errorType = analysis.appwriteCode;
      analysis.errorDescription = APPWRITE_ERROR_MAP[analysis.appwriteCode];
    }

    // Analyze based on HTTP status
    if (analysis.httpStatus) {
      analysis.probableCause = HTTP_STATUS_MESSAGES[analysis.httpStatus] || 'Unknown Error';
      
      switch (analysis.httpStatus) {
        case 401:
          if (error.message?.toLowerCase().includes('jwt')) {
            analysis.debugSuggestions.push(...ERROR_DEBUG_SUGGESTIONS[401].jwt);
          }
          if (error.message?.toLowerCase().includes('session')) {
            analysis.debugSuggestions.push(...ERROR_DEBUG_SUGGESTIONS[401].session);
          }
          break;
        
        case 403:
        case 404:
        case 429:
          if (ERROR_DEBUG_SUGGESTIONS[analysis.httpStatus]) {
            analysis.debugSuggestions.push(...ERROR_DEBUG_SUGGESTIONS[analysis.httpStatus]);
          }
          break;
        
        case 500:
        case 502:
        case 503:
          analysis.debugSuggestions.push(...ERROR_DEBUG_SUGGESTIONS[500]);
          break;
      }
    }

    return analysis;
  }

  /**
   * Categorize error for better tracking
   * @param {Error} error - The error to categorize
   * @param {Object} appwriteAnalysis - Appwrite error analysis
   * @returns {string} - Error category
   */
  static categorizeError(error, appwriteAnalysis = null) {
    // Network errors
    if (this.isRetryableNetworkError(error)) {
      return ERROR_CATEGORIES.NETWORK;
    }

    // Appwrite errors
    if (appwriteAnalysis?.isAppwriteError) {
      switch (appwriteAnalysis.httpStatus) {
        case 401: return ERROR_CATEGORIES.AUTH;
        case 403: return ERROR_CATEGORIES.PERMISSION;
        case 404: return ERROR_CATEGORIES.NOT_FOUND;
        case 429: return ERROR_CATEGORIES.RATE_LIMIT;
        case 500:
        case 502:
        case 503: return ERROR_CATEGORIES.SERVER;
        default: return ERROR_CATEGORIES.APPWRITE;
      }
    }

    // Token errors
    if (error.message?.includes('format is invalid')) {
      return ERROR_CATEGORIES.TOKEN_FORMAT;
    }
    if (error.message?.includes('could not be cleaned')) {
      return ERROR_CATEGORIES.TOKEN_CLEANING;
    }

    return ERROR_CATEGORIES.UNKNOWN;
  }

  /**
   * Determine if error is non-retryable
   * @param {Object} appwriteAnalysis - Appwrite error analysis
   * @returns {boolean} - Whether the error should not be retried
   */
  static isNonRetryableError(appwriteAnalysis) {
    if (!appwriteAnalysis) return false;
    
    // Auth and permission errors should not be retried
    return [401, 403, 404].includes(appwriteAnalysis.httpStatus);
  }

  /**
   * Calculate retry delay with exponential backoff
   * @param {number} attempt - Current attempt number
   * @param {Object} config - Retry configuration
   * @returns {number} - Delay in milliseconds
   */
  static calculateRetryDelay(attempt, config = RETRY_CONFIG) {
    return Math.min(
      config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
      config.maxDelay
    );
  }

  /**
   * Check if we should retry based on attempt and error
   * @param {number} attempt - Current attempt number
   * @param {number} maxRetries - Maximum retries allowed
   * @param {Error} error - The error that occurred
   * @returns {Object} - Decision and reason
   */
  static shouldRetry(attempt, maxRetries, error) {
    const decision = {
      shouldRetry: false,
      reason: null,
      delay: 0
    };

    // Check max attempts
    if (attempt > maxRetries) {
      decision.reason = `Max retries (${maxRetries}) exceeded`;
      return decision;
    }

    // Check if network error
    if (!this.isRetryableNetworkError(error)) {
      decision.reason = 'Non-retryable error type';
      return decision;
    }

    // Check for Appwrite-specific non-retryable errors
    const appwriteAnalysis = this.analyzeAppwriteError(error);
    if (this.isNonRetryableError(appwriteAnalysis)) {
      decision.reason = `Non-retryable Appwrite error (HTTP ${appwriteAnalysis.httpStatus})`;
      return decision;
    }

    decision.shouldRetry = true;
    decision.delay = this.calculateRetryDelay(attempt);
    decision.reason = `Retrying after ${decision.delay}ms`;

    return decision;
  }

  /**
   * Format error for logging
   * @param {Error} error - The error to format
   * @param {Object} context - Additional context
   * @returns {Object} - Formatted error object
   */
  static formatErrorForLogging(error, context = {}) {
    const networkAnalysis = this.analyzeNetworkError(error);
    const appwriteAnalysis = this.analyzeAppwriteError(error);
    
    return {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        code: error.code,
        type: error.name,
        stack: error.stack?.split('\n').slice(0, 3)
      },
      network: networkAnalysis,
      appwrite: appwriteAnalysis,
      category: this.categorizeError(error, appwriteAnalysis),
      context,
      suggestions: [
        ...appwriteAnalysis.debugSuggestions,
        ...(networkAnalysis.isNetworkError ? ['Check network connectivity'] : [])
      ]
    };
  }
}

// Export utility functions for backward compatibility
export const isRetryableNetworkError = NetworkUtils.isRetryableNetworkError.bind(NetworkUtils);
export const analyzeNetworkError = NetworkUtils.analyzeNetworkError.bind(NetworkUtils);
export const analyzeAppwriteError = NetworkUtils.analyzeAppwriteError.bind(NetworkUtils);
export const categorizeError = NetworkUtils.categorizeError.bind(NetworkUtils);
export const calculateRetryDelay = NetworkUtils.calculateRetryDelay.bind(NetworkUtils);

export default NetworkUtils;