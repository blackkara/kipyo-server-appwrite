// src/services/appwrite/monitoring/ErrorAnalyzer.js

import NetworkUtils from '../utils/NetworkUtils.js';
import { ERROR_CATEGORIES } from '../utils/Constants.js';

/**
 * Analyzes and categorizes errors for better monitoring
 */
export class ErrorAnalyzer {
  constructor(logger = console.log, postHogService = null) {
    this.log = logger;
    this.postHog = postHogService;
    
    // Error tracking
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.errorPatterns = new Map();
  }

  /**
   * Analyze error and create comprehensive report
   * @param {Error} error - Error to analyze
   * @param {Object} context - Error context
   * @returns {Object} - Error analysis
   */
  analyzeError(error, context = {}) {
    const analysis = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        code: error.code,
        type: error.name,
        stack: this.extractStackTrace(error)
      },
      context,
      network: NetworkUtils.analyzeNetworkError(error),
      appwrite: NetworkUtils.analyzeAppwriteError(error),
      category: this.categorizeError(error),
      pattern: this.identifyPattern(error),
      severity: this.calculateSeverity(error),
      recommendations: this.generateRecommendations(error)
    };

    // Track error pattern
    this.trackErrorPattern(analysis);
    
    // Add to history
    this.addToHistory(analysis);

    return analysis;
  }

  /**
   * Create safe error context for logging
   * @param {Object} context - Original context
   * @param {Object} additionalData - Additional data
   * @param {Error} error - The error
   * @returns {Object} - Safe context
   */
  createSafeErrorContext(context, additionalData, error) {
    const safeContext = {
      ...context,
      timestamp: new Date().toISOString(),
      error: {
        message: error.message?.slice(0, 500),
        code: error.code,
        type: error.name
      },
      ...additionalData
    };

    // Remove sensitive data
    this.sanitizeContext(safeContext);

    return safeContext;
  }

  /**
   * Categorize error
   * @private
   */
  categorizeError(error) {
    // Check for network errors
    if (NetworkUtils.isRetryableNetworkError(error)) {
      return ERROR_CATEGORIES.NETWORK;
    }

    // Check Appwrite errors
    const appwriteAnalysis = NetworkUtils.analyzeAppwriteError(error);
    if (appwriteAnalysis.isAppwriteError) {
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

    // Check message patterns
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('jwt') || message.includes('token')) {
      if (message.includes('format')) return ERROR_CATEGORIES.TOKEN_FORMAT;
      if (message.includes('clean')) return ERROR_CATEGORIES.TOKEN_CLEANING;
      return ERROR_CATEGORIES.AUTH;
    }

    if (message.includes('permission') || message.includes('unauthorized')) {
      return ERROR_CATEGORIES.PERMISSION;
    }

    if (message.includes('not found') || message.includes('does not exist')) {
      return ERROR_CATEGORIES.NOT_FOUND;
    }

    return ERROR_CATEGORIES.UNKNOWN;
  }

  /**
   * Identify error pattern
   * @private
   */
  identifyPattern(error) {
    const patterns = {
      timeout: /timeout|timed out/i,
      connectionReset: /ECONNRESET|connection reset/i,
      connectionRefused: /ECONNREFUSED|connection refused/i,
      dnsFailure: /ENOTFOUND|dns/i,
      sslError: /ssl|certificate/i,
      jwtExpired: /jwt.*expired|token.*expired/i,
      jwtInvalid: /jwt.*invalid|token.*invalid/i,
      quotaExceeded: /quota|limit.*exceeded/i,
      serverError: /500|internal server/i,
      badGateway: /502|bad gateway/i
    };

    const message = error.message || '';
    
    for (const [pattern, regex] of Object.entries(patterns)) {
      if (regex.test(message)) {
        return pattern;
      }
    }

    return 'unknown';
  }

  /**
   * Calculate error severity
   * @private
   */
  calculateSeverity(error) {
    const category = this.categorizeError(error);
    
    // Critical severity
    if ([ERROR_CATEGORIES.SERVER, ERROR_CATEGORIES.AUTH].includes(category)) {
      return 'critical';
    }

    // High severity
    if ([ERROR_CATEGORIES.PERMISSION, ERROR_CATEGORIES.RATE_LIMIT].includes(category)) {
      return 'high';
    }

    // Medium severity
    if ([ERROR_CATEGORIES.NETWORK, ERROR_CATEGORIES.NOT_FOUND].includes(category)) {
      return 'medium';
    }

    // Low severity
    return 'low';
  }

  /**
   * Generate recommendations
   * @private
   */
  generateRecommendations(error) {
    const recommendations = [];
    const category = this.categorizeError(error);
    const pattern = this.identifyPattern(error);

    // Category-based recommendations
    switch (category) {
      case ERROR_CATEGORIES.AUTH:
        recommendations.push('Check authentication credentials');
        recommendations.push('Verify token is not expired');
        break;
      case ERROR_CATEGORIES.PERMISSION:
        recommendations.push('Verify user permissions');
        recommendations.push('Check document access rights');
        break;
      case ERROR_CATEGORIES.NETWORK:
        recommendations.push('Check network connectivity');
        recommendations.push('Implement retry logic');
        break;
      case ERROR_CATEGORIES.RATE_LIMIT:
        recommendations.push('Implement rate limiting on client');
        recommendations.push('Use exponential backoff');
        break;
      case ERROR_CATEGORIES.SERVER:
        recommendations.push('Check Appwrite service status');
        recommendations.push('Contact support if persists');
        break;
    }

    // Pattern-based recommendations
    switch (pattern) {
      case 'timeout':
        recommendations.push('Increase timeout values');
        break;
      case 'jwtExpired':
        recommendations.push('Refresh JWT token');
        break;
      case 'quotaExceeded':
        recommendations.push('Check usage limits');
        break;
    }

    return recommendations;
  }

  /**
   * Extract stack trace safely
   * @private
   */
  extractStackTrace(error) {
    if (!error.stack) return [];
    
    const lines = error.stack.split('\n');
    // Return first 5 lines of stack trace
    return lines.slice(0, 5).map(line => line.trim());
  }

  /**
   * Sanitize context to remove sensitive data
   * @private
   */
  sanitizeContext(context) {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];
    
    const sanitize = (obj) => {
      for (const key in obj) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(context);
  }

  /**
   * Track error pattern
   * @private
   */
  trackErrorPattern(analysis) {
    const key = `${analysis.category}:${analysis.pattern}`;
    
    if (!this.errorPatterns.has(key)) {
      this.errorPatterns.set(key, {
        count: 0,
        firstSeen: analysis.timestamp,
        lastSeen: analysis.timestamp,
        category: analysis.category,
        pattern: analysis.pattern
      });
    }

    const pattern = this.errorPatterns.get(key);
    pattern.count++;
    pattern.lastSeen = analysis.timestamp;
  }

  /**
   * Add to error history
   * @private
   */
  addToHistory(analysis) {
    this.errorHistory.push(analysis);
    
    // Trim history
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Get error statistics
   * @returns {Object} - Error statistics
   */
  getStatistics() {
    const stats = {
      totalErrors: this.errorHistory.length,
      patterns: {},
      categories: {},
      severities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      recentErrors: []
    };

    // Count by category
    for (const error of this.errorHistory) {
      const category = error.category;
      stats.categories[category] = (stats.categories[category] || 0) + 1;
      
      const severity = error.severity;
      stats.severities[severity]++;
    }

    // Get pattern statistics
    for (const [key, pattern] of this.errorPatterns.entries()) {
      stats.patterns[key] = pattern;
    }

    // Get recent errors
    stats.recentErrors = this.errorHistory.slice(-10).map(error => ({
      timestamp: error.timestamp,
      category: error.category,
      pattern: error.pattern,
      severity: error.severity,
      message: error.error.message
    }));

    return stats;
  }

  /**
   * Get error trends
   * @param {number} hours - Hours to look back
   * @returns {Object} - Error trends
   */
  getErrorTrends(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const recent = this.errorHistory.filter(error => 
      new Date(error.timestamp).getTime() > cutoff
    );

    const trends = {
      period: `${hours} hours`,
      totalErrors: recent.length,
      errorRate: recent.length / hours,
      topCategories: {},
      topPatterns: {},
      severityDistribution: {}
    };

    // Analyze recent errors
    for (const error of recent) {
      trends.topCategories[error.category] = (trends.topCategories[error.category] || 0) + 1;
      trends.topPatterns[error.pattern] = (trends.topPatterns[error.pattern] || 0) + 1;
      trends.severityDistribution[error.severity] = (trends.severityDistribution[error.severity] || 0) + 1;
    }

    return trends;
  }

  /**
   * Track error with PostHog
   * @param {Error} error - Error to track
   * @param {Object} context - Error context
   */
  async trackError(error, context) {
    if (!this.postHog) return;

    const analysis = this.analyzeError(error, context);
    
    try {
      await this.postHog.trackError(error, {
        ...context,
        errorAnalysis: {
          category: analysis.category,
          pattern: analysis.pattern,
          severity: analysis.severity,
          isNetworkError: analysis.network.isNetworkError,
          isAppwriteError: analysis.appwrite.isAppwriteError
        }
      });
    } catch (trackingError) {
      this.log('Failed to track error:', trackingError.message);
    }
  }

  /**
   * Generate error report
   * @returns {string} - Formatted error report
   */
  generateReport() {
    const stats = this.getStatistics();
    const trends = this.getErrorTrends(24);
    
    const lines = [
      '=== Error Analysis Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Statistics ---',
      `Total Errors: ${stats.totalErrors}`,
      `Error Rate (24h): ${trends.errorRate.toFixed(2)}/hour`,
      '',
      '--- Categories ---',
      ...Object.entries(stats.categories).map(([cat, count]) => 
        `${cat}: ${count} (${((count/stats.totalErrors)*100).toFixed(1)}%)`
      ),
      '',
      '--- Severities ---',
      ...Object.entries(stats.severities).map(([sev, count]) => 
        `${sev}: ${count}`
      ),
      '',
      '--- Top Patterns ---',
      ...Object.entries(trends.topPatterns).slice(0, 5).map(([pattern, count]) => 
        `${pattern}: ${count}`
      ),
      '',
      '=== End Report ==='
    ];

    return lines.join('\n');
  }

  /**
   * Clear error history
   */
  clearHistory() {
    const count = this.errorHistory.length;
    this.errorHistory = [];
    this.errorPatterns.clear();
    this.log(`Cleared ${count} error records`);
    return count;
  }
}

export default ErrorAnalyzer;