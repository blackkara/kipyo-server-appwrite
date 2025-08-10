// src/services/appwrite/monitoring/HealthChecker.js

import { MEMORY_THRESHOLDS, HEALTH_THRESHOLDS } from '../utils/Constants.js';

/**
 * Monitors system health and provides health checks
 */
export class HealthChecker {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.connectionManager = dependencies.connectionManager;
    this.cacheStats = dependencies.cacheStatistics;
    this.performanceMonitor = dependencies.performanceMonitor;
    this.errorAnalyzer = dependencies.errorAnalyzer;
    
    // Health check intervals
    this.checkIntervals = {
      system: null,
      detailed: null
    };
    
    // Health history
    this.healthHistory = [];
    this.maxHistorySize = 100;
    
    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Perform comprehensive system health check
   * @returns {Promise<Object>} - System health report
   */
  async getSystemHealth() {
    const health = {
      timestamp: new Date().toISOString(),
      overall: 'unknown',
      score: 0,
      components: {},
      metrics: {},
      recommendations: [],
      issues: []
    };

    try {
      // Check network health
      if (this.connectionManager) {
        const networkHealth = this.connectionManager.getNetworkHealth();
        health.components.network = {
          status: this.evaluateNetworkHealth(networkHealth),
          details: networkHealth
        };
      }

      // Check cache health
      if (this.cacheStats) {
        const cacheHealth = this.cacheStats.getCacheHealth();
        health.components.cache = {
          status: cacheHealth.status,
          details: cacheHealth
        };
      }

      // Check performance
      if (this.performanceMonitor) {
        const perfStats = this.performanceMonitor.getStatistics();
        health.components.performance = {
          status: this.evaluatePerformanceHealth(perfStats),
          details: perfStats
        };
      }

      // Check errors
      if (this.errorAnalyzer) {
        const errorStats = this.errorAnalyzer.getStatistics();
        health.components.errors = {
          status: this.evaluateErrorHealth(errorStats),
          details: errorStats
        };
      }

      // Check memory
      const memoryHealth = this.checkMemoryHealth();
      health.components.memory = memoryHealth;

      // Calculate overall health
      health.score = this.calculateOverallScore(health.components);
      health.overall = this.determineOverallStatus(health.score);
      
      // Generate recommendations
      health.recommendations = this.generateRecommendations(health);
      health.issues = this.identifyIssues(health);

      // Add to history
      this.addToHistory(health);

    } catch (error) {
      health.overall = 'error';
      health.error = error.message;
      this.log('Health check failed:', error);
    }

    return health;
  }

  /**
   * Check memory health
   * @private
   */
  checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal);
    
    let status = 'healthy';
    if (heapUsedPercent > MEMORY_THRESHOLDS.criticalUtilization) {
      status = 'critical';
    } else if (heapUsedPercent > MEMORY_THRESHOLDS.warningUtilization) {
      status = 'warning';
    }

    return {
      status,
      details: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        utilizationPercentage: heapUsedPercent * 100
      }
    };
  }

  /**
   * Evaluate network health
   * @private
   */
  evaluateNetworkHealth(networkHealth) {
    if (!networkHealth) return 'unknown';
    
    if (networkHealth.healthScore >= HEALTH_THRESHOLDS.excellent) {
      return 'excellent';
    } else if (networkHealth.healthScore >= HEALTH_THRESHOLDS.good) {
      return 'healthy';
    } else if (networkHealth.healthScore >= HEALTH_THRESHOLDS.fair) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Evaluate performance health
   * @private
   */
  evaluatePerformanceHealth(perfStats) {
    if (!perfStats) return 'unknown';
    
    const slowPercentage = perfStats.summary.totalOperations > 0 ?
      (perfStats.summary.slowOperations / perfStats.summary.totalOperations) * 100 : 0;
    
    if (slowPercentage > 50) {
      return 'critical';
    } else if (slowPercentage > 20) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Evaluate error health
   * @private
   */
  evaluateErrorHealth(errorStats) {
    if (!errorStats) return 'unknown';
    
    const criticalErrors = errorStats.severities?.critical || 0;
    const highErrors = errorStats.severities?.high || 0;
    
    if (criticalErrors > 5) {
      return 'critical';
    } else if (criticalErrors > 0 || highErrors > 10) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Calculate overall health score
   * @private
   */
  calculateOverallScore(components) {
    let score = 100;
    let componentCount = 0;
    
    const weights = {
      network: 25,
      cache: 15,
      performance: 25,
      errors: 20,
      memory: 15
    };

    for (const [component, health] of Object.entries(components)) {
      if (!health || !weights[component]) continue;
      
      componentCount++;
      const weight = weights[component];
      
      switch (health.status) {
        case 'critical':
          score -= weight;
          break;
        case 'warning':
          score -= weight * 0.5;
          break;
        case 'healthy':
        case 'excellent':
          // No penalty
          break;
        default:
          score -= weight * 0.25; // Unknown status
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine overall status
   * @private
   */
  determineOverallStatus(score) {
    if (score >= HEALTH_THRESHOLDS.excellent) {
      return 'excellent';
    } else if (score >= HEALTH_THRESHOLDS.good) {
      return 'healthy';
    } else if (score >= HEALTH_THRESHOLDS.fair) {
      return 'degraded';
    } else if (score >= HEALTH_THRESHOLDS.poor) {
      return 'unhealthy';
    } else {
      return 'critical';
    }
  }

  /**
   * Generate health recommendations
   * @private
   */
  generateRecommendations(health) {
    const recommendations = [];

    // Network recommendations
    if (health.components.network?.status === 'critical') {
      recommendations.push('Critical network issues detected - check connectivity');
    } else if (health.components.network?.status === 'warning') {
      recommendations.push('Network performance degraded - monitor connection stability');
    }

    // Cache recommendations
    if (health.components.cache?.details?.utilizationPercentage > 90) {
      recommendations.push('Cache utilization high - consider increasing cache size');
    }

    // Performance recommendations
    if (health.components.performance?.status === 'warning') {
      recommendations.push('Performance degradation detected - review slow operations');
    }

    // Memory recommendations
    if (health.components.memory?.status === 'warning') {
      recommendations.push('Memory usage high - monitor for memory leaks');
    } else if (health.components.memory?.status === 'critical') {
      recommendations.push('Critical memory usage - immediate attention required');
    }

    // Error recommendations
    if (health.components.errors?.details?.severities?.critical > 0) {
      recommendations.push('Critical errors detected - review error logs');
    }

    return recommendations;
  }

  /**
   * Identify health issues
   * @private
   */
  identifyIssues(health) {
    const issues = [];

    for (const [component, data] of Object.entries(health.components)) {
      if (data?.status === 'critical') {
        issues.push(`${component}: critical status`);
      } else if (data?.status === 'warning') {
        issues.push(`${component}: warning status`);
      }
    }

    return issues;
  }

  /**
   * Add to health history
   * @private
   */
  addToHistory(health) {
    this.healthHistory.push({
      timestamp: health.timestamp,
      overall: health.overall,
      score: health.score
    });

    // Trim history
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }
  }

  /**
   * Get health trends
   * @param {number} hours - Hours to look back
   * @returns {Object} - Health trends
   */
  getHealthTrends(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const recent = this.healthHistory.filter(h => 
      new Date(h.timestamp).getTime() > cutoff
    );

    if (recent.length === 0) {
      return null;
    }

    const trends = {
      period: `${hours} hours`,
      dataPoints: recent.length,
      averageScore: 0,
      minScore: 100,
      maxScore: 0,
      statusDistribution: {}
    };

    let totalScore = 0;
    
    for (const health of recent) {
      totalScore += health.score;
      trends.minScore = Math.min(trends.minScore, health.score);
      trends.maxScore = Math.max(trends.maxScore, health.score);
      
      trends.statusDistribution[health.overall] = 
        (trends.statusDistribution[health.overall] || 0) + 1;
    }

    trends.averageScore = totalScore / recent.length;

    return trends;
  }

  /**
   * Start periodic health checks
   * @private
   */
  startHealthChecks() {
    // Quick health check every minute
    this.checkIntervals.system = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        
        if (health.overall === 'critical') {
          this.log('[HEALTH] Critical system health detected:', health.issues);
        }
      } catch (error) {
        this.log('Periodic health check failed:', error.message);
      }
    }, 60 * 1000); // 1 minute

    // Detailed health check every 5 minutes
    this.checkIntervals.detailed = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        const trends = this.getHealthTrends(1); // Last hour
        
        if (trends && trends.averageScore < HEALTH_THRESHOLDS.fair) {
          this.log('[HEALTH] Health degradation trend detected:', trends);
        }
      } catch (error) {
        this.log('Detailed health check failed:', error.message);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.checkIntervals.system) {
      clearInterval(this.checkIntervals.system);
      this.checkIntervals.system = null;
    }
    
    if (this.checkIntervals.detailed) {
      clearInterval(this.checkIntervals.detailed);
      this.checkIntervals.detailed = null;
    }
    
    this.log('Health checks stopped');
  }

  /**
   * Generate health report
   * @returns {Promise<string>} - Formatted health report
   */
  async generateReport() {
    const health = await this.getSystemHealth();
    const trends = this.getHealthTrends(24);
    
    const lines = [
      '=== System Health Report ===',
      `Generated: ${health.timestamp}`,
      '',
      `Overall Status: ${health.overall.toUpperCase()}`,
      `Health Score: ${health.score}/100`,
      '',
      '--- Components ---'
    ];

    for (const [component, data] of Object.entries(health.components)) {
      lines.push(`${component}: ${data.status}`);
      
      if (component === 'memory') {
        lines.push(`  Usage: ${data.details.heapUsed}MB / ${data.details.heapTotal}MB (${data.details.utilizationPercentage.toFixed(1)}%)`);
      } else if (component === 'network' && data.details) {
        lines.push(`  Health Score: ${data.details.healthScore}/100`);
        lines.push(`  Success Rate: ${data.details.successRate?.toFixed(1)}%`);
      }
    }

    if (health.issues.length > 0) {
      lines.push('', '--- Issues ---');
      lines.push(...health.issues);
    }

    if (health.recommendations.length > 0) {
      lines.push('', '--- Recommendations ---');
      lines.push(...health.recommendations);
    }

    if (trends) {
      lines.push('', '--- 24 Hour Trends ---');
      lines.push(`Average Score: ${trends.averageScore.toFixed(1)}/100`);
      lines.push(`Min/Max Score: ${trends.minScore}/${trends.maxScore}`);
    }

    lines.push('', '=== End Report ===');
    
    return lines.join('\n');
  }

  /**
   * Export for monitoring
   * @returns {Promise<Object>} - Monitoring data
   */
  async exportForMonitoring() {
    const health = await this.getSystemHealth();
    
    return {
      health_score: health.score,
      health_status: health.overall,
      component_statuses: Object.entries(health.components).reduce((acc, [key, val]) => {
        acc[`component_${key}_status`] = val.status;
        return acc;
      }, {}),
      issue_count: health.issues.length,
      recommendation_count: health.recommendations.length
    };
  }

  /**
   * Destroy health checker
   */
  destroy() {
    this.stopHealthChecks();
    this.healthHistory = [];
    this.log('Health checker destroyed');
  }
}

export default HealthChecker;