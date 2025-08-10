// src/services/appwrite/core/ConnectionManager.js

import { 
  CIRCUIT_BREAKER_CONFIG, 
  HEALTH_THRESHOLDS,
  TRACKING_EVENTS 
} from '../utils/Constants.js';

/**
 * Manages connection health and circuit breaker functionality
 */
export class ConnectionManager {
  constructor(logger = console.log, postHogService = null) {
    this.log = logger;
    this.postHog = postHogService;
    
    // Connection health state
    this.connectionHealth = {
      lastSuccessful: null,
      failureCount: 0,
      lastFailure: null,
      endpoint: null,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };

    // Circuit breaker state
    this.circuitBreaker = {
      state: 'closed', // closed, open, half-open
      lastStateChange: Date.now(),
      consecutiveSuccesses: 0,
      config: { ...CIRCUIT_BREAKER_CONFIG }
    };

    // Health monitoring
    this.healthHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Record successful operation
   * @param {Object} context - Operation context
   */
  recordSuccess(context = {}) {
    const now = Date.now();
    
    this.connectionHealth.lastSuccessful = now;
    this.connectionHealth.failureCount = 0;
    this.connectionHealth.totalRequests++;
    this.connectionHealth.totalSuccesses++;

    // Update circuit breaker
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.consecutiveSuccesses++;
      
      if (this.circuitBreaker.consecutiveSuccesses >= 3) {
        this.closeCircuit('Recovery successful');
      }
    } else if (this.circuitBreaker.state === 'closed') {
      this.circuitBreaker.consecutiveSuccesses++;
    }

    // Record in history
    this.addToHistory({
      timestamp: now,
      type: 'success',
      context
    });

    this.log(`[CONNECTION] Success recorded. Health score: ${this.calculateHealthScore()}`);
  }

  /**
   * Record failed operation
   * @param {Error} error - The error that occurred
   * @param {Object} context - Operation context
   */
  async recordFailure(error, context = {}) {
    const now = Date.now();
    
    this.connectionHealth.lastFailure = now;
    this.connectionHealth.failureCount++;
    this.connectionHealth.totalRequests++;
    this.connectionHealth.totalFailures++;
    this.circuitBreaker.consecutiveSuccesses = 0;

    // Record in history
    this.addToHistory({
      timestamp: now,
      type: 'failure',
      error: error.message,
      context
    });

    // Check if circuit should open
    if (this.shouldOpenCircuit()) {
      await this.openCircuit(error);
    }

    this.log(`[CONNECTION] Failure recorded. Consecutive failures: ${this.connectionHealth.failureCount}`);
  }

  /**
   * Check if circuit breaker should open
   * @private
   */
  shouldOpenCircuit() {
    if (this.circuitBreaker.state === 'open') {
      return false;
    }

    const healthScore = this.calculateHealthScore();
    
    return (
      this.connectionHealth.failureCount >= this.circuitBreaker.config.failureThreshold &&
      healthScore < this.circuitBreaker.config.healthScoreThreshold
    );
  }

  /**
   * Open the circuit breaker
   * @private
   */
  async openCircuit(error) {
    this.circuitBreaker.state = 'open';
    this.circuitBreaker.lastStateChange = Date.now();
    
    this.log('[CIRCUIT BREAKER] Circuit opened due to failures');
    
    // Track event
    if (this.postHog) {
      await this.postHog.trackBusinessEvent(TRACKING_EVENTS.CIRCUIT_BREAKER_OPEN, {
        failure_count: this.connectionHealth.failureCount,
        health_score: this.calculateHealthScore(),
        error_message: error.message
      }, 'system');
    }

    // Schedule half-open attempt
    setTimeout(() => {
      this.attemptHalfOpen();
    }, this.circuitBreaker.config.cooldownPeriod);
  }

  /**
   * Attempt to half-open the circuit
   * @private
   */
  attemptHalfOpen() {
    if (this.circuitBreaker.state === 'open') {
      this.circuitBreaker.state = 'half-open';
      this.circuitBreaker.lastStateChange = Date.now();
      this.circuitBreaker.consecutiveSuccesses = 0;
      
      this.log('[CIRCUIT BREAKER] Circuit half-opened for testing');
    }
  }

  /**
   * Close the circuit breaker
   * @private
   */
  closeCircuit(reason = 'Manual close') {
    this.circuitBreaker.state = 'closed';
    this.circuitBreaker.lastStateChange = Date.now();
    
    this.log(`[CIRCUIT BREAKER] Circuit closed: ${reason}`);
  }

  /**
   * Check if circuit is open
   * @returns {boolean} - Whether circuit is open
   */
  isCircuitOpen() {
    return this.circuitBreaker.state === 'open';
  }

  /**
   * Get circuit breaker state
   * @returns {string} - Circuit state
   */
  getCircuitState() {
    return this.circuitBreaker.state;
  }

  /**
   * Calculate health score
   * @returns {number} - Health score (0-100)
   */
  calculateHealthScore() {
    const now = Date.now();
    let score = 100;

    // Penalize consecutive failures
    score -= Math.min(this.connectionHealth.failureCount * 20, 80);

    // Penalize time since last success
    if (this.connectionHealth.lastSuccessful) {
      const timeSinceSuccess = now - this.connectionHealth.lastSuccessful;
      if (timeSinceSuccess > 30 * 60 * 1000) { // 30 minutes
        score -= 30;
      } else if (timeSinceSuccess > 5 * 60 * 1000) { // 5 minutes
        score -= 10;
      }
    } else {
      score -= 50; // Never had success
    }

    // Consider failure rate
    if (this.connectionHealth.totalRequests > 0) {
      const failureRate = this.connectionHealth.totalFailures / this.connectionHealth.totalRequests;
      score -= Math.round(failureRate * 30);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get health status based on score
   * @returns {string} - Health status
   */
  getHealthStatus() {
    const score = this.calculateHealthScore();
    
    if (score >= HEALTH_THRESHOLDS.excellent) return 'excellent';
    if (score >= HEALTH_THRESHOLDS.good) return 'good';
    if (score >= HEALTH_THRESHOLDS.fair) return 'fair';
    if (score >= HEALTH_THRESHOLDS.poor) return 'poor';
    return 'critical';
  }

  /**
   * Get comprehensive network health
   * @returns {Object} - Network health details
   */
  getNetworkHealth() {
    const now = Date.now();
    const health = {
      ...this.connectionHealth,
      timeSinceLastSuccess: this.connectionHealth.lastSuccessful ?
        now - this.connectionHealth.lastSuccessful : null,
      timeSinceLastFailure: this.connectionHealth.lastFailure ?
        now - this.connectionHealth.lastFailure : null,
      consecutiveFailures: this.connectionHealth.failureCount,
      healthScore: this.calculateHealthScore(),
      status: this.getHealthStatus(),
      circuitBreaker: {
        state: this.circuitBreaker.state,
        timeSinceStateChange: now - this.circuitBreaker.lastStateChange
      }
    };

    // Add success rate
    if (health.totalRequests > 0) {
      health.successRate = (health.totalSuccesses / health.totalRequests) * 100;
      health.failureRate = (health.totalFailures / health.totalRequests) * 100;
    } else {
      health.successRate = 0;
      health.failureRate = 0;
    }

    return health;
  }

  /**
   * Test connection with endpoint
   * @param {Function} testFunction - Function to test connection
   * @returns {Promise<Object>} - Test result
   */
  async testConnection(testFunction) {
    const startTime = Date.now();
    const result = {
      success: false,
      duration: 0,
      error: null,
      healthScore: 0,
      timestamp: new Date().toISOString()
    };

    try {
      await testFunction();
      
      result.success = true;
      result.duration = Date.now() - startTime;
      
      this.recordSuccess({ type: 'connection_test' });
      
    } catch (error) {
      result.error = error.message;
      result.duration = Date.now() - startTime;
      
      await this.recordFailure(error, { type: 'connection_test' });
    }

    result.healthScore = this.calculateHealthScore();
    return result;
  }

  /**
   * Set endpoint for tracking
   * @param {string} endpoint - Appwrite endpoint
   */
  setEndpoint(endpoint) {
    this.connectionHealth.endpoint = endpoint;
  }

  /**
   * Reset connection health
   */
  reset() {
    this.connectionHealth = {
      lastSuccessful: null,
      failureCount: 0,
      lastFailure: null,
      endpoint: this.connectionHealth.endpoint,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };

    this.closeCircuit('Health reset');
    this.healthHistory = [];
    
    this.log('[CONNECTION] Health state reset');
  }

  /**
   * Add event to history
   * @private
   */
  addToHistory(event) {
    this.healthHistory.push(event);
    
    // Trim history if needed
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }
  }

  /**
   * Get health history
   * @param {number} limit - Number of events to return
   * @returns {Array} - Recent health events
   */
  getHealthHistory(limit = 50) {
    return this.healthHistory.slice(-limit);
  }

  /**
   * Get health statistics
   * @returns {Object} - Health statistics
   */
  getStatistics() {
    const stats = {
      totalRequests: this.connectionHealth.totalRequests,
      totalSuccesses: this.connectionHealth.totalSuccesses,
      totalFailures: this.connectionHealth.totalFailures,
      currentFailureStreak: this.connectionHealth.failureCount,
      healthScore: this.calculateHealthScore(),
      status: this.getHealthStatus(),
      circuitBreakerState: this.circuitBreaker.state
    };

    // Calculate averages from history
    if (this.healthHistory.length > 0) {
      const recentHistory = this.healthHistory.slice(-100);
      const failures = recentHistory.filter(e => e.type === 'failure');
      const successes = recentHistory.filter(e => e.type === 'success');
      
      stats.recentFailureRate = (failures.length / recentHistory.length) * 100;
      stats.recentSuccessRate = (successes.length / recentHistory.length) * 100;
    }

    return stats;
  }

  /**
   * Export for monitoring
   * @returns {Object} - Monitoring data
   */
  exportForMonitoring() {
    return {
      health_score: this.calculateHealthScore(),
      health_status: this.getHealthStatus(),
      circuit_breaker_state: this.circuitBreaker.state,
      consecutive_failures: this.connectionHealth.failureCount,
      total_requests: this.connectionHealth.totalRequests,
      success_rate: this.connectionHealth.totalRequests > 0 ?
        (this.connectionHealth.totalSuccesses / this.connectionHealth.totalRequests) * 100 : 0,
      endpoint: this.connectionHealth.endpoint
    };
  }
}

export default ConnectionManager;