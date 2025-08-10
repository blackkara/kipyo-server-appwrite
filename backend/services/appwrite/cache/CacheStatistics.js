// src/services/appwrite/cache/CacheStatistics.js

import { USAGE_FREQUENCY, MEMORY_THRESHOLDS } from '../utils/Constants.js';

/**
 * Manages cache statistics and metrics
 */
export class CacheStatistics {
  constructor(clientCache, logger = console.log) {
    this.cache = clientCache;
    this.log = logger;
    
    // Historical stats tracking
    this.history = {
      hourly: [],
      daily: [],
      maxHistorySize: 24
    };
    
    // Start periodic stats collection
    this.startStatsCollection();
  }

  /**
   * Get comprehensive cache statistics
   * @returns {Object} - Detailed cache statistics
   */
  getDetailedStats() {
    const now = Date.now();
    const basicStats = this.cache.getStats();
    
    // Enhance with additional metrics
    const enhancedStats = {
      ...basicStats,
      ageDistribution: this.getAgeDistribution(),
      typeDistribution: this.getTypeDistribution(),
      usageFrequency: this.getUsageFrequencyDistribution(),
      memoryEstimate: this.estimateMemoryUsage(),
      performanceMetrics: this.getPerformanceMetrics(),
      health: this.getCacheHealth()
    };
    
    return enhancedStats;
  }

  /**
   * Get age distribution of cache entries
   * @returns {Object} - Age distribution stats
   */
  getAgeDistribution() {
    const now = Date.now();
    const distribution = {
      under1Min: 0,
      under5Min: 0,
      under30Min: 0,
      over30Min: 0
    };
    
    for (const [key, value] of this.cache.cache.entries()) {
      const ageMinutes = Math.round((now - value.lastUsed) / 60000);
      
      if (ageMinutes < 1) distribution.under1Min++;
      else if (ageMinutes < 5) distribution.under5Min++;
      else if (ageMinutes < 30) distribution.under30Min++;
      else distribution.over30Min++;
    }
    
    return distribution;
  }

  /**
   * Get type distribution of cache entries
   * @returns {Object} - Type distribution stats
   */
  getTypeDistribution() {
    const distribution = {
      jwt: 0,
      apiKey: 0
    };
    
    for (const [key, value] of this.cache.cache.entries()) {
      // Check if JWT token (3 parts separated by dots)
      const isJWT = key && typeof key === 'string' && key.split('.').length === 3;
      
      if (isJWT) {
        distribution.jwt++;
      } else {
        distribution.apiKey++;
      }
    }
    
    return distribution;
  }

  /**
   * Get usage frequency distribution
   * @returns {Object} - Usage frequency stats
   */
  getUsageFrequencyDistribution() {
    const distribution = {
      veryActive: 0,
      active: 0,
      moderate: 0,
      inactive: 0
    };
    
    const now = Date.now();
    
    for (const [key, value] of this.cache.cache.entries()) {
      const timeSinceLastUsed = now - value.lastUsed;
      
      if (timeSinceLastUsed < USAGE_FREQUENCY.veryActive) {
        distribution.veryActive++;
      } else if (timeSinceLastUsed < USAGE_FREQUENCY.active) {
        distribution.active++;
      } else if (timeSinceLastUsed < USAGE_FREQUENCY.moderate) {
        distribution.moderate++;
      } else {
        distribution.inactive++;
      }
    }
    
    return distribution;
  }

  /**
   * Estimate memory usage of cache
   * @returns {Object} - Memory usage estimation
   */
  estimateMemoryUsage() {
    let totalBytes = 0;
    let keyBytes = 0;
    let dataBytes = 0;
    
    for (const [key, value] of this.cache.cache.entries()) {
      // Estimate key size
      keyBytes += key.length * 2; // UTF-16 encoding
      
      // Estimate object size (rough approximation)
      dataBytes += 1000; // Base object overhead
      
      // Add string field sizes
      if (value.client) dataBytes += 500;
      if (value.databases) dataBytes += 500;
      if (value.account) dataBytes += 500;
    }
    
    totalBytes = keyBytes + dataBytes;
    
    return {
      totalBytes,
      totalKB: Math.round(totalBytes / 1024),
      totalMB: Math.round(totalBytes / 1024 / 1024 * 100) / 100,
      keyBytes,
      dataBytes,
      averageEntrySize: this.cache.size > 0 ? Math.round(totalBytes / this.cache.size) : 0
    };
  }

  /**
   * Get cache performance metrics
   * @returns {Object} - Performance metrics
   */
  getPerformanceMetrics() {
    const stats = this.cache.stats;
    const totalRequests = stats.hits + stats.misses;
    
    return {
      totalRequests,
      hitRate: totalRequests > 0 ? (stats.hits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (stats.misses / totalRequests) * 100 : 0,
      evictionRate: stats.additions > 0 ? (stats.evictions / stats.additions) * 100 : 0,
      averageLifetime: this.calculateAverageLifetime(),
      requestsPerMinute: this.calculateRequestRate()
    };
  }

  /**
   * Calculate average lifetime of cache entries
   * @returns {number} - Average lifetime in minutes
   */
  calculateAverageLifetime() {
    if (this.cache.size === 0) return 0;
    
    const now = Date.now();
    let totalAge = 0;
    
    for (const [key, value] of this.cache.cache.entries()) {
      totalAge += (now - value.createdAt);
    }
    
    return Math.round(totalAge / this.cache.size / 60000); // Convert to minutes
  }

  /**
   * Calculate request rate
   * @returns {number} - Requests per minute
   */
  calculateRequestRate() {
    const uptime = Date.now() - this.cache.stats.createdAt;
    const uptimeMinutes = uptime / 60000;
    const totalRequests = this.cache.stats.hits + this.cache.stats.misses;
    
    return uptimeMinutes > 0 ? Math.round(totalRequests / uptimeMinutes) : 0;
  }

  /**
   * Get cache health assessment
   * @returns {Object} - Cache health metrics
   */
  getCacheHealth() {
    const stats = this.getPerformanceMetrics();
    const memory = this.estimateMemoryUsage();
    const utilization = (this.cache.size / this.cache.config.maxCacheSize) * 100;
    
    const health = {
      status: 'healthy',
      score: 100,
      issues: [],
      recommendations: []
    };
    
    // Check hit rate
    if (stats.hitRate < 50) {
      health.score -= 20;
      health.issues.push('Low cache hit rate');
      health.recommendations.push('Consider increasing cache timeout');
    }
    
    // Check utilization
    if (utilization > MEMORY_THRESHOLDS.cacheWarningUtilization * 100) {
      health.score -= 15;
      health.issues.push('High cache utilization');
      health.recommendations.push('Consider increasing cache size');
    }
    
    // Check eviction rate
    if (stats.evictionRate > 30) {
      health.score -= 15;
      health.issues.push('High eviction rate');
      health.recommendations.push('Cache size may be too small');
    }
    
    // Check memory usage
    if (memory.totalMB > 50) {
      health.score -= 10;
      health.issues.push('High memory usage');
      health.recommendations.push('Monitor memory consumption');
    }
    
    // Determine overall status
    if (health.score >= 90) {
      health.status = 'excellent';
    } else if (health.score >= 70) {
      health.status = 'good';
    } else if (health.score >= 50) {
      health.status = 'fair';
    } else {
      health.status = 'poor';
    }
    
    return health;
  }

  /**
   * Record stats snapshot for history
   */
  recordSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      stats: this.getDetailedStats()
    };
    
    // Add to hourly history
    this.history.hourly.push(snapshot);
    
    // Trim history if needed
    if (this.history.hourly.length > this.history.maxHistorySize) {
      this.history.hourly.shift();
    }
    
    // Aggregate to daily if needed
    this.aggregateDailyStats();
  }

  /**
   * Aggregate hourly stats to daily
   * @private
   */
  aggregateDailyStats() {
    // Only aggregate if we have enough hourly data
    if (this.history.hourly.length < 24) return;
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Filter last 24 hours of data
    const last24Hours = this.history.hourly.filter(
      snapshot => snapshot.timestamp > oneDayAgo
    );
    
    if (last24Hours.length === 0) return;
    
    // Calculate aggregates
    const dailyStats = {
      timestamp: now,
      date: new Date().toISOString().split('T')[0],
      avgCacheSize: 0,
      avgHitRate: 0,
      totalHits: 0,
      totalMisses: 0,
      totalEvictions: 0,
      peakCacheSize: 0,
      minCacheSize: Infinity
    };
    
    let totalSize = 0;
    let totalHitRate = 0;
    
    for (const snapshot of last24Hours) {
      totalSize += snapshot.stats.size;
      totalHitRate += snapshot.stats.hitRate || 0;
      dailyStats.totalHits += snapshot.stats.hits || 0;
      dailyStats.totalMisses += snapshot.stats.misses || 0;
      dailyStats.totalEvictions += snapshot.stats.evictions || 0;
      dailyStats.peakCacheSize = Math.max(dailyStats.peakCacheSize, snapshot.stats.size);
      dailyStats.minCacheSize = Math.min(dailyStats.minCacheSize, snapshot.stats.size);
    }
    
    dailyStats.avgCacheSize = Math.round(totalSize / last24Hours.length);
    dailyStats.avgHitRate = totalHitRate / last24Hours.length;
    
    // Add to daily history
    this.history.daily.push(dailyStats);
    
    // Keep only last 30 days
    if (this.history.daily.length > 30) {
      this.history.daily.shift();
    }
  }

  /**
   * Get historical trends
   * @param {string} period - 'hourly' or 'daily'
   * @returns {Array} - Historical snapshots
   */
  getHistoricalTrends(period = 'hourly') {
    return this.history[period] || [];
  }

  /**
   * Get cache trends analysis
   * @param {number} hours - Hours to analyze
   * @returns {Object} - Trends analysis
   */
  getCacheTrends(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const relevantHistory = this.history.hourly.filter(
      snapshot => snapshot.timestamp > cutoff
    );
    
    if (relevantHistory.length === 0) {
      return null;
    }
    
    const trends = {
      period: `${hours} hours`,
      dataPoints: relevantHistory.length,
      sizeGrowth: 0,
      hitRateTrend: 'stable',
      evictionTrend: 'stable',
      predictions: []
    };
    
    // Calculate size growth
    const firstSize = relevantHistory[0].stats.size;
    const lastSize = relevantHistory[relevantHistory.length - 1].stats.size;
    trends.sizeGrowth = ((lastSize - firstSize) / firstSize) * 100;
    
    // Analyze hit rate trend
    const hitRates = relevantHistory.map(s => s.stats.hitRate || 0);
    const avgHitRate = hitRates.reduce((a, b) => a + b, 0) / hitRates.length;
    const recentAvg = hitRates.slice(-5).reduce((a, b) => a + b, 0) / 5;
    
    if (recentAvg > avgHitRate * 1.1) {
      trends.hitRateTrend = 'improving';
    } else if (recentAvg < avgHitRate * 0.9) {
      trends.hitRateTrend = 'declining';
    }
    
    // Generate predictions
    if (trends.sizeGrowth > 50) {
      trends.predictions.push('Cache size growing rapidly - may need size increase');
    }
    if (trends.hitRateTrend === 'declining') {
      trends.predictions.push('Hit rate declining - review cache timeout settings');
    }
    
    return trends;
  }

  /**
   * Start periodic stats collection
   * @private
   */
  startStatsCollection() {
    // Collect stats every 5 minutes
    this.statsInterval = setInterval(() => {
      this.recordSnapshot();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop stats collection
   */
  stopStatsCollection() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
      this.log('Stats collection stopped');
    }
  }

  /**
   * Generate cache report
   * @returns {string} - Formatted cache report
   */
  generateReport() {
    const stats = this.getDetailedStats();
    const trends = this.getCacheTrends(24);
    
    const lines = [
      '=== Cache Statistics Report ===',
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Basic Metrics ---',
      `Size: ${stats.size}/${stats.maxSize} (${stats.utilizationPercentage.toFixed(1)}%)`,
      `Hit Rate: ${stats.hitRate.toFixed(1)}%`,
      `Miss Rate: ${(100 - stats.hitRate).toFixed(1)}%`,
      `Evictions: ${stats.evictions}`,
      '',
      '--- Performance ---',
      `Requests/min: ${stats.performanceMetrics.requestsPerMinute}`,
      `Avg Lifetime: ${stats.performanceMetrics.averageLifetime} min`,
      `Eviction Rate: ${stats.performanceMetrics.evictionRate.toFixed(1)}%`,
      '',
      '--- Memory Usage ---',
      `Total: ${stats.memoryEstimate.totalMB} MB`,
      `Per Entry: ${stats.memoryEstimate.averageEntrySize} bytes`,
      '',
      '--- Age Distribution ---',
      `< 1 min: ${stats.ageDistribution.under1Min}`,
      `1-5 min: ${stats.ageDistribution.under5Min}`,
      `5-30 min: ${stats.ageDistribution.under30Min}`,
      `> 30 min: ${stats.ageDistribution.over30Min}`,
      '',
      '--- Type Distribution ---',
      `JWT Tokens: ${stats.typeDistribution.jwt}`,
      `API Keys: ${stats.typeDistribution.apiKey}`,
      '',
      '--- Usage Frequency ---',
      `Very Active: ${stats.usageFrequency.veryActive}`,
      `Active: ${stats.usageFrequency.active}`,
      `Moderate: ${stats.usageFrequency.moderate}`,
      `Inactive: ${stats.usageFrequency.inactive}`,
      '',
      '--- Health Status ---',
      `Status: ${stats.health.status} (Score: ${stats.health.score}/100)`,
      stats.health.issues.length > 0 ? `Issues: ${stats.health.issues.join(', ')}` : 'Issues: None',
      stats.health.recommendations.length > 0 ? 
        `Recommendations: ${stats.health.recommendations.join('; ')}` : ''
    ];
    
    if (trends) {
      lines.push(
        '',
        '--- 24 Hour Trends ---',
        `Size Growth: ${trends.sizeGrowth.toFixed(1)}%`,
        `Hit Rate Trend: ${trends.hitRateTrend}`,
        trends.predictions.length > 0 ? 
          `Predictions: ${trends.predictions.join('; ')}` : ''
      );
    }
    
    lines.push('', '=== End Report ===');
    
    return lines.join('\n');
  }

  /**
   * Export stats for monitoring
   * @returns {Object} - Monitoring-friendly stats
   */
  exportForMonitoring() {
    const stats = this.getDetailedStats();
    
    return {
      cache_size: stats.size,
      cache_utilization: stats.utilizationPercentage,
      hit_rate: stats.hitRate,
      miss_rate: 100 - stats.hitRate,
      eviction_count: stats.evictions,
      memory_usage_mb: stats.memoryEstimate.totalMB,
      health_score: stats.health.score,
      health_status: stats.health.status,
      requests_per_minute: stats.performanceMetrics.requestsPerMinute,
      age_distribution: stats.ageDistribution,
      type_distribution: stats.typeDistribution
    };
  }

  /**
   * Get top accessed entries
   * @param {number} limit - Number of entries to return
   * @returns {Array} - Top accessed cache entries
   */
  getTopAccessedEntries(limit = 10) {
    const entries = [];
    
    for (const [key, value] of this.cache.cache.entries()) {
      entries.push({
        keySnippet: this.cache.getKeySnippet(key),
        accessCount: value.accessCount || 0,
        lastUsed: new Date(value.lastUsed).toISOString(),
        createdAt: new Date(value.createdAt).toISOString(),
        ageMinutes: Math.round((Date.now() - value.createdAt) / 60000)
      });
    }
    
    return entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  /**
   * Clear statistics and history
   */
  clearStatistics() {
    this.history.hourly = [];
    this.history.daily = [];
    this.log('Cache statistics cleared');
  }

  /**
   * Destroy the statistics manager
   */
  destroy() {
    this.stopStatsCollection();
    this.clearStatistics();
    this.log('Cache statistics manager destroyed');
  }
}

export default CacheStatistics;