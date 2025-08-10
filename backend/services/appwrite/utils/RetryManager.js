// src/services/appwrite/utils/RetryManager.js

import { RETRY_CONFIG } from './Constants.js';
import NetworkUtils from './NetworkUtils.js';

/**
 * Manages retry logic with exponential backoff
 */
export class RetryManager {
  constructor(logger = console.log, postHogService = null) {
    this.log = logger;
    this.postHog = postHogService;
    this.defaultConfig = { ...RETRY_CONFIG };
    this.activeRetries = new Map(); // Track active retry operations
  }

  /**
   * Execute an operation with retry logic
   * @param {Function} operation - The async operation to execute
   * @param {Object} context - Operation context for tracking
   * @param {Object} customConfig - Custom retry configuration
   * @returns {Promise} - Result of the operation
   */
  async executeWithRetry(operation, context = {}, customConfig = {}) {
    const config = { ...this.defaultConfig, ...customConfig };
    const operationId = this.generateOperationId(context);

    // Track this retry operation
    this.activeRetries.set(operationId, {
      startTime: Date.now(),
      context,
      attempts: 0
    });

    try {
      return await this._performRetry(operation, context, config, operationId);
    } finally {
      this.activeRetries.delete(operationId);
    }
  }

  /**
   * Internal retry logic
   * @private
   */
  async _performRetry(operation, context, config, operationId) {
    let lastError = null;
    let attempt = 0;

    const operationContext = {
      ...context,
      retryAttempt: 0,
      maxRetries: config.maxRetries,
      startTime: Date.now(),
      operationId
    };

    while (attempt <= config.maxRetries) {
      try {
        operationContext.retryAttempt = attempt;
        operationContext.performanceMeta = {
          attemptStartTime: Date.now(),
          attemptNumber: attempt + 1,
          totalAttempts: config.maxRetries + 1
        };

        if (attempt > 0) {
          this.log(`[RETRY ${attempt}/${config.maxRetries}] Retrying ${context.methodName || 'operation'}...`);
        }

        // Execute the operation
        const result = await operation();

        // Track performance
        operationContext.performanceMeta.attemptDuration =
          Date.now() - operationContext.performanceMeta.attemptStartTime;
        operationContext.performanceMeta.totalDuration =
          Date.now() - operationContext.startTime;

        // Success - track if it was a retry
        if (attempt > 0) {
          await this.trackRetrySuccess(operationContext, attempt);
        }

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Update performance metrics
        operationContext.performanceMeta.attemptDuration =
          Date.now() - operationContext.performanceMeta.attemptStartTime;

        // Analyze the error
        const retryDecision = NetworkUtils.shouldRetry(attempt, config.maxRetries, error);

        this.log(`[RETRY MANAGER] Attempt ${attempt}/${config.maxRetries + 1} failed:`, {
          error: error.message,
          code: error.code,
          shouldRetry: retryDecision.shouldRetry,
          reason: retryDecision.reason
        });

        // Check if we should stop retrying
        if (!retryDecision.shouldRetry) {
          await this.trackRetryFailure(operationContext, error, attempt, retryDecision.reason);

          if (attempt > config.maxRetries) {
            throw new Error(
              `Operation failed after ${attempt} attempts: ${error.message} (${error.code || 'Unknown'})`
            );
          } else {
            // Non-retryable error
            throw error;
          }
        }

        // Wait before next retry
        if (retryDecision.delay > 0) {
          this.log(`[RETRY DELAY] Waiting ${retryDecision.delay}ms before retry ${attempt}...`);
          await this.sleep(retryDecision.delay);
        }
      }
    }

    // Should not reach here, but handle just in case
    throw lastError || new Error('Retry logic failed unexpectedly');
  }

  /**
   * Execute with circuit breaker pattern
   * @param {Function} operation - The operation to execute
   * @param {Object} context - Operation context
   * @param {Function} healthCheck - Function to check if circuit should be open
   * @returns {Promise} - Result of the operation
   */
  async executeWithCircuitBreaker(operation, context = {}, healthCheck = null) {
    // Check circuit breaker
    if (healthCheck && healthCheck()) {
      const error = new Error('Circuit breaker is open - service unavailable');
      await this.trackCircuitBreakerOpen(context);
      throw error;
    }

    return this.executeWithRetry(operation, context);
  }

  /**
   * Batch retry operations
   * @param {Array} operations - Array of {operation, context} objects
   * @param {Object} config - Retry configuration
   * @returns {Promise<Array>} - Results array with {success, result, error} objects
   */
  async batchRetry(operations, config = {}) {
    const results = await Promise.allSettled(
      operations.map(({ operation, context }) =>
        this.executeWithRetry(operation, context, config)
      )
    );

    return results.map((result, index) => ({
      success: result.status === 'fulfilled',
      result: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null,
      context: operations[index].context
    }));
  }

  /**
   * Progressive retry with increasing delays
   * @param {Function} operation - The operation to execute
   * @param {Array} delays - Array of delays in milliseconds
   * @param {Object} context - Operation context
   * @returns {Promise} - Result of the operation
   */
  async progressiveRetry(operation, delays = [100, 500, 1000, 3000, 5000], context = {}) {
    let lastError = null;

    for (let i = 0; i < delays.length; i++) {
      try {
        this.log(`[PROGRESSIVE RETRY] Attempt ${i + 1}/${delays.length}`);
        return await operation();
      } catch (error) {
        lastError = error;

        if (i < delays.length - 1) {
          this.log(`[PROGRESSIVE RETRY] Waiting ${delays[i]}ms before next attempt`);
          await this.sleep(delays[i]);
        }
      }
    }

    throw lastError || new Error('Progressive retry failed');
  }

  /**
   * Get statistics about active retries
   * @returns {Object} - Retry statistics
   */
  getRetryStatistics() {
    const stats = {
      activeOperations: this.activeRetries.size,
      operations: []
    };

    for (const [id, data] of this.activeRetries.entries()) {
      stats.operations.push({
        id,
        methodName: data.context.methodName,
        attempts: data.attempts,
        duration: Date.now() - data.startTime
      });
    }

    return stats;
  }

  /**
   * Cancel all active retries
   */
  cancelAllRetries() {
    const count = this.activeRetries.size;
    this.activeRetries.clear();
    this.log(`[RETRY MANAGER] Cancelled ${count} active retry operations`);
    return count;
  }

  // Utility methods
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateOperationId(context) {
    return `${context.methodName || 'operation'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Tracking methods
  async trackRetrySuccess(context, attemptCount) {
    if (!this.postHog) return;

    try {
      await this.postHog.trackBusinessEvent('network_retry_success', {
        method_name: context.methodName,
        attempt_number: attemptCount,
        total_attempts: attemptCount + 1,
        total_duration_ms: context.performanceMeta?.totalDuration,
        operation_id: context.operationId
      }, context.userId || 'system');
    } catch (error) {
      this.log('Failed to track retry success:', error.message);
    }
  }

  async trackRetryFailure(context, error, attemptCount, reason) {
    if (!this.postHog) return;

    try {
      await this.postHog.trackError(error, {
        ...context,
        finalAttempt: true,
        totalAttempts: attemptCount,
        failureReason: reason,
        operation_id: context.operationId
      });
    } catch (trackError) {
      this.log('Failed to track retry failure:', trackError.message);
    }
  }

  async trackCircuitBreakerOpen(context) {
    if (!this.postHog) return;

    try {
      await this.postHog.trackBusinessEvent('circuit_breaker_open', {
        method_name: context.methodName,
        timestamp: new Date().toISOString()
      }, context.userId || 'system');
    } catch (error) {
      this.log('Failed to track circuit breaker:', error.message);
    }
  }

  /**
   * Create a retry-wrapped function
   * @param {Function} fn - Function to wrap
   * @param {Object} defaultContext - Default context for the function
   * @param {Object} defaultConfig - Default retry configuration
   * @returns {Function} - Wrapped function with retry logic
   */
  wrap(fn, defaultContext = {}, defaultConfig = {}) {
    return async (...args) => {
      return this.executeWithRetry(
        () => fn(...args),
        defaultContext,
        defaultConfig
      );
    };
  }
}

// Export singleton instance for backward compatibility
let defaultInstance = null;

export function getDefaultRetryManager(logger, postHogService) {
  if (!defaultInstance) {
    defaultInstance = new RetryManager(logger, postHogService);
  }
  return defaultInstance;
}

export default RetryManager;