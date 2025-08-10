// src/services/appwrite/monitoring/PerformanceMonitor.js

import { PERFORMANCE_THRESHOLDS } from '../utils/Constants.js';

/**
 * Monitors and tracks performance metrics
 */
export class PerformanceMonitor {
  constructor(logger = console.log) {
    this.log = logger;

    // Performance metrics storage
    this.metrics = {
      operations: new Map(),
      summary: {
        totalOperations: 0,
        totalDuration: 0,
        averageDuration: 0,
        slowOperations: 0,
        fastOperations: 0
      }
    };

    // Active operations tracking
    this.activeOperations = new Map();

    // Historical data
    this.history = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Start tracking an operation
   * @param {string} operationId - Unique operation identifier
   * @param {Object} metadata - Operation metadata
   * @returns {Function} - Function to end tracking
   */
  startOperation(operationId, metadata = {}) {
    const startTime = Date.now();

    this.activeOperations.set(operationId, {
      startTime,
      metadata,
      operationId
    });

    // Return end function
    return (success = true, additionalData = {}) => {
      this.endOperation(operationId, success, additionalData);
    };
  }

  /**
   * End tracking an operation
   * @param {string} operationId - Operation identifier
   * @param {boolean} success - Whether operation succeeded
   * @param {Object} additionalData - Additional data to record
   */
  endOperation(operationId, success = true, additionalData = {}) {
    const operation = this.activeOperations.get(operationId);

    if (!operation) {
      this.log(`Operation ${operationId} not found for ending`);
      return;
    }

    const duration = Date.now() - operation.startTime;

    // Record metric
    const metric = {
      operationId,
      startTime: operation.startTime,
      endTime: Date.now(),
      duration,
      success,
      metadata: operation.metadata,
      ...additionalData,
      performance: this.categorizePerformance(duration)
    };

    this.recordMetric(metric);
    this.activeOperations.delete(operationId);
  }

  /**
   * Track async operation
   * @param {string} name - Operation name
   * @param {Function} operation - Async operation to track
   * @param {Object} metadata - Operation metadata
   * @returns {Promise} - Operation result
   */
  async trackOperation(name, operation, metadata = {}) {
    const operationId = this.generateOperationId(name);
    const startTime = Date.now();

    try {
      const result = await operation();

      const duration = Date.now() - startTime;
      this.recordMetric({
        operationId,
        name,
        startTime,
        endTime: Date.now(),
        duration,
        success: true,
        metadata,
        performance: this.categorizePerformance(duration)
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordMetric({
        operationId,
        name,
        startTime,
        endTime: Date.now(),
        duration,
        success: false,
        error: error.message,
        metadata,
        performance: this.categorizePerformance(duration)
      });

      throw error;
    }
  }

  /**
   * Categorize performance based on duration
   * @private
   */
  categorizePerformance(duration) {
    if (duration < PERFORMANCE_THRESHOLDS.fastResponse) {
      return 'fast';
    } else if (duration < PERFORMANCE_THRESHOLDS.normalResponse) {
      return 'normal';
    } else if (duration < PERFORMANCE_THRESHOLDS.slowResponse) {
      return 'slow';
    } else {
      return 'very_slow';
    }
  }

  /**
   * Record a metric
   * @private
   */
  recordMetric(metric) {
    // Update operation-specific metrics
    const operationName = metric.name || metric.metadata?.methodName || 'unknown';

    if (!this.metrics.operations.has(operationName)) {
      this.metrics.operations.set(operationName, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        successCount: 0,
        failureCount: 0,
        performance: {
          fast: 0,
          normal: 0,
          slow: 0,
          very_slow: 0
        }
      });
    }

    const opMetrics = this.metrics.operations.get(operationName);

    // Update metrics
    opMetrics.count++;
    opMetrics.totalDuration += metric.duration;
    opMetrics.averageDuration = opMetrics.totalDuration / opMetrics.count;
    opMetrics.minDuration = Math.min(opMetrics.minDuration, metric.duration);
    opMetrics.maxDuration = Math.max(opMetrics.maxDuration, metric.duration);

    if (metric.success) {
      opMetrics.successCount++;
    } else {
      opMetrics.failureCount++;
    }

    opMetrics.performance[metric.performance]++;

    // Update summary
    this.metrics.summary.totalOperations++;
    this.metrics.summary.totalDuration += metric.duration;
    this.metrics.summary.averageDuration =
      this.metrics.summary.totalDuration / this.metrics.summary.totalOperations;

    if (metric.performance === 'slow' || metric.performance === 'very_slow') {
      this.metrics.summary.slowOperations++;
    } else if (metric.performance === 'fast') {
      this.metrics.summary.fastOperations++;
    }

    // Add to history
    this.addToHistory(metric);
  }

  /**
   * Add metric to history
   * @private
   */
  addToHistory(metric) {
    this.history.push({
      timestamp: new Date().toISOString(),
      ...metric
    });

    // Trim history
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} - Performance statistics
   */
  getStatistics() {
    const stats = {
      summary: { ...this.metrics.summary },
      operations: {},
      activeOperations: this.activeOperations.size,
      performanceDistribution: this.getPerformanceDistribution()
    };

    // Convert operations map to object
    for (const [name, metrics] of this.metrics.operations.entries()) {
      stats.operations[name] = {
        ...metrics,
        successRate: metrics.count > 0 ?
          (metrics.successCount / metrics.count) * 100 : 0
      };
    }

    return stats;
  }

  /**
   * Get performance distribution
   * @private
   */
  getPerformanceDistribution() {
    let fast = 0, normal = 0, slow = 0, verySlows = 0;

    for (const metrics of this.metrics.operations.values()) {
      fast += metrics.performance.fast;
      normal += metrics.performance.normal;
      slow += metrics.performance.slow;
      verySlows += metrics.performance.very_slow;
    }

    const total = fast + normal + slow + verySlows;

    return {
      fast: total > 0 ? (fast / total) * 100 : 0,
      normal: total > 0 ? (normal / total) * 100 : 0,
      slow: total > 0 ? (slow / total) * 100 : 0,
      very_slow: total > 0 ? (verySlows / total) * 100 : 0
    };
  }

  /**
   * Get slowest operations
   * @param {number} limit - Number of operations to return
   * @returns {Array} - Slowest operations
   */
  getSlowestOperations(limit = 10) {
    const operations = [];

    for (const [name, metrics] of this.metrics.operations.entries()) {
      operations.push({
        name,
        averageDuration: metrics.averageDuration,
        maxDuration: metrics.maxDuration,
        count: metrics.count,
        slowPercentage: metrics.count > 0 ?
          ((metrics.performance.slow + metrics.performance.very_slow) / metrics.count) * 100 : 0
      });
    }

    return operations
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, limit);
  }

  /**
   * Get recent operations
   * @param {number} limit - Number of operations to return
   * @returns {Array} - Recent operations
   */
  getRecentOperations(limit = 50) {
    return this.history.slice(-limit).reverse();
  }

  /**
   * Get operation trends
   * @param {string} operationName - Operation name
   * @param {number} hours - Hours to look back
   * @returns {Object} - Operation trends
   */
  getOperationTrends(operationName, hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const recent = this.history.filter(op =>
      op.name === operationName && op.startTime > cutoff
    );

    if (recent.length === 0) {
      return null;
    }

    const trends = {
      operationName,
      period: `${hours} hours`,
      count: recent.length,
      averageDuration: 0,
      successRate: 0,
      performanceTrend: []
    };

    let totalDuration = 0;
    let successCount = 0;

    for (const op of recent) {
      totalDuration += op.duration;
      if (op.success) successCount++;
    }

    trends.averageDuration = totalDuration / recent.length;
    trends.successRate = (successCount / recent.length) * 100;

    // Calculate hourly performance
    const hourlyBuckets = {};
    for (const op of recent) {
      const hour = new Date(op.startTime).getHours();
      if (!hourlyBuckets[hour]) {
        hourlyBuckets[hour] = {
          count: 0,
          totalDuration: 0
        };
      }
      hourlyBuckets[hour].count++;
      hourlyBuckets[hour].totalDuration += op.duration;
    }

    trends.performanceTrend = Object.entries(hourlyBuckets).map(([hour, data]) => ({
      hour: parseInt(hour),
      averageDuration: data.totalDuration / data.count,
      count: data.count
    }));

    return trends;
  }

  /**
   * Generate performance report
   * @returns {string} - Formatted performance report
   */
  generateReport() {
    const stats = this.getStatistics();
    const slowest = this.getSlowestOperations(5);

    const lines = [
      '=== Performance Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Summary ---',
      `Total Operations: ${stats.summary.totalOperations}`,
      `Average Duration: ${stats.summary.averageDuration.toFixed(2)}ms`,
      `Fast Operations: ${stats.summary.fastOperations} (${((stats.summary.fastOperations / stats.summary.totalOperations) * 100).toFixed(1)}%)`,
      `Slow Operations: ${stats.summary.slowOperations} (${((stats.summary.slowOperations / stats.summary.totalOperations) * 100).toFixed(1)}%)`,
      '',
      '--- Performance Distribution ---',
      `Fast (<${PERFORMANCE_THRESHOLDS.fastResponse}ms): ${stats.performanceDistribution.fast.toFixed(1)}%`,
      `Normal (${PERFORMANCE_THRESHOLDS.fastResponse}-${PERFORMANCE_THRESHOLDS.normalResponse}ms): ${stats.performanceDistribution.normal.toFixed(1)}%`,
      `Slow (${PERFORMANCE_THRESHOLDS.normalResponse}-${PERFORMANCE_THRESHOLDS.slowResponse}ms): ${stats.performanceDistribution.slow.toFixed(1)}%`,
      `Very Slow (>${PERFORMANCE_THRESHOLDS.slowResponse}ms): ${stats.performanceDistribution.very_slow.toFixed(1)}%`,
      '',
      '--- Slowest Operations ---',
      ...slowest.map(op =>
        `${op.name}: avg ${op.averageDuration.toFixed(0)}ms, max ${op.maxDuration}ms (${op.count} calls)`
      ),
      '',
      '=== End Report ==='
    ];

    return lines.join('\n');
  }

  /**
   * Generate operation ID
   * @private
   */
  generateOperationId(name) {
    return `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.metrics.operations.clear();
    this.metrics.summary = {
      totalOperations: 0,
      totalDuration: 0,
      averageDuration: 0,
      slowOperations: 0,
      fastOperations: 0
    };
    this.history = [];
    this.log('Performance metrics cleared');
  }

  /**
   * Export for monitoring
   * @returns {Object} - Monitoring data
   */
  exportForMonitoring() {
    const stats = this.getStatistics();

    return {
      total_operations: stats.summary.totalOperations,
      average_duration_ms: stats.summary.averageDuration,
      slow_operation_percentage: stats.summary.totalOperations > 0 ?
        (stats.summary.slowOperations / stats.summary.totalOperations) * 100 : 0,
      active_operations: this.activeOperations.size,
      performance_distribution: stats.performanceDistribution
    };
  }
}

export default PerformanceMonitor;