// src/services/appwrite/cache/ClientCache.js

import { CACHE_CONFIG, TRACKING_EVENTS } from '../utils/Constants.js';

/**
 * Manages client caching with LRU eviction
 */
export class ClientCache {
  constructor(logger = console.log, postHogService = null, config = {}) {
    this.log = logger;
    this.postHog = postHogService;
    this.config = { ...CACHE_CONFIG, ...config };
    
    // Main cache storage
    this.cache = new Map();
    
    // Creation locks for preventing race conditions
    this.creationLocks = new Map();
    
    // Statistics tracking
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      additions: 0,
      createdAt: Date.now()
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get a client from cache
   * @param {string} key - Cache key (auth token)
   * @returns {Object|null} - Cached client data or null
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (entry && this.isValid(entry)) {
      // Update last used time
      entry.lastUsed = Date.now();
      this.stats.hits++;
      
      this.trackCacheEvent(TRACKING_EVENTS.CACHE_HIT, {
        key_snippet: this.getKeySnippet(key),
        age_ms: Date.now() - entry.createdAt
      });
      
      return entry;
    }
    
    if (entry) {
      // Entry exists but expired
      this.cache.delete(key);
      this.log(`Cache entry expired for key: ${this.getKeySnippet(key)}`);
    }
    
    this.stats.misses++;
    this.trackCacheEvent(TRACKING_EVENTS.CACHE_MISS, {
      key_snippet: this.getKeySnippet(key),
      reason: entry ? 'expired' : 'not_found'
    });
    
    return null;
  }

  /**
   * Add a client to cache with race condition protection
   * @param {string} key - Cache key
   * @param {Object} clientData - Client data to cache
   * @returns {Promise<void>}
   */
  async add(key, clientData) {
    // Check if we're already creating this client
    const lockKey = this.getLockKey(key);
    
    if (this.creationLocks.has(lockKey)) {
      // Wait for existing creation to complete
      await this.creationLocks.get(lockKey);
      return;
    }
    
    // Create lock
    let resolveLock;
    const lockPromise = new Promise(resolve => { resolveLock = resolve; });
    this.creationLocks.set(lockKey, lockPromise);
    
    try {
      // Check cache size and evict if necessary
      if (this.cache.size >= this.config.maxCacheSize) {
        await this.evictOldest();
      }
      
      // Add to cache
      const cacheEntry = {
        ...clientData,
        lastUsed: Date.now(),
        createdAt: Date.now(),
        accessCount: 0
      };
      
      this.cache.set(key, cacheEntry);
      this.stats.additions++;
      
      this.log(`Added client to cache: ${this.getKeySnippet(key)}`);
      
    } finally {
      // Release lock
      this.creationLocks.delete(lockKey);
      resolveLock();
    }
  }

  /**
   * Check if a cache entry is valid
   * @param {Object} entry - Cache entry
   * @returns {boolean} - Whether the entry is valid
   */
  isValid(entry) {
    const age = Date.now() - entry.lastUsed;
    return age < this.config.cacheTimeout;
  }

  /**
   * Evict the oldest cache entry
   * @returns {Promise<void>}
   */
  async evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, value] of this.cache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      const evicted = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      
      await this.trackCacheEvent(TRACKING_EVENTS.CLIENT_CACHE_EVICTION, {
        evicted_key_snippet: this.getKeySnippet(oldestKey),
        last_used_minutes_ago: Math.round((Date.now() - evicted.lastUsed) / 60000),
        cache_size_before: this.cache.size + 1,
        cache_size_after: this.cache.size
      });
      
      this.log(`Evicted oldest cache entry: ${this.getKeySnippet(oldestKey)}`);
    }
  }

  /**
   * Clean up expired cache entries
   * @returns {number} - Number of entries cleaned
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.lastUsed > this.config.cacheTimeout) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      this.log(`Cleaned up ${keysToDelete.length} expired client connections`);
    }
    
    return keysToDelete.length;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.creationLocks.clear();
    this.log(`Cleared ${size} cached clients`);
    return size;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries = [];
    
    for (const [key, value] of this.cache.entries()) {
      entries.push({
        keySnippet: this.getKeySnippet(key),
        lastUsed: new Date(value.lastUsed).toISOString(),
        createdAt: new Date(value.createdAt).toISOString(),
        ageMinutes: Math.round((now - value.createdAt) / 60000),
        idleMinutes: Math.round((now - value.lastUsed) / 60000),
        accessCount: value.accessCount || 0
      });
    }
    
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      utilizationPercentage: (this.cache.size / this.config.maxCacheSize) * 100,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits > 0 ? 
        (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0,
      evictions: this.stats.evictions,
      additions: this.stats.additions,
      uptime: now - this.stats.createdAt,
      entries: entries.sort((a, b) => b.accessCount - a.accessCount)
    };
  }

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} - Whether the key exists
   */
  has(key) {
    const entry = this.cache.get(key);
    return entry && this.isValid(entry);
  }

  /**
   * Get the size of the cache
   * @returns {number} - Number of entries
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Start cleanup interval
   * @private
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.log('Cache cleanup interval stopped');
    }
  }

  /**
   * Get a lock key for a cache key
   * @private
   */
  getLockKey(key) {
    // Simple hash for lock key
    let hash = 0;
    for (let i = 0; i < Math.min(key.length, 50); i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `lock_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Get a snippet of a key for logging
   * @private
   */
  getKeySnippet(key) {
    if (!key) return 'null';
    if (key.length <= 20) return key;
    return key.slice(0, 12) + '...' + key.slice(-4);
  }

  /**
   * Track cache events
   * @private
   */
  async trackCacheEvent(eventName, data) {
    if (!this.postHog) return;
    
    try {
      await this.postHog.trackBusinessEvent(eventName, {
        ...data,
        cache_size: this.cache.size,
        cache_utilization: (this.cache.size / this.config.maxCacheSize) * 100
      }, 'system');
    } catch (error) {
      this.log('Failed to track cache event:', error.message);
    }
  }

  /**
   * Wait for all pending operations
   * @returns {Promise<void>}
   */
  async waitForPendingOperations() {
    if (this.creationLocks.size > 0) {
      this.log(`Waiting for ${this.creationLocks.size} pending cache operations...`);
      await Promise.all(Array.from(this.creationLocks.values()));
      this.log('All pending cache operations completed');
    }
  }

  /**
   * Destroy the cache manager
   */
  async destroy() {
    this.stopCleanupInterval();
    await this.waitForPendingOperations();
    this.clear();
    this.log('Cache manager destroyed');
  }
}
