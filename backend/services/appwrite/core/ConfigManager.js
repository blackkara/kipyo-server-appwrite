// src/services/appwrite/core/ConfigManager.js

/**
 * Manages Appwrite configuration and environment variables
 */
export class ConfigManager {
  constructor() {
    this.config = null;
    this.validated = false;
    this.initialize();
  }

  /**
   * Initialize configuration
   * @private
   */
  initialize() {
    this.config = {
      // Appwrite Configuration
      appwrite: {
        endpoint: process.env.APPWRITE_END_POINT,
        projectId: process.env.APPWRITE_PROJECT_ID,
        databaseId: process.env.APPWRITE_DB_ID,
        apiKey: process.env.APPWRITE_DEV_KEY
      },

      // Google Cloud Configuration
      google: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        apiKey: process.env.GOOGLE_TRANSLATE_API_KEY
      },

      // Feature Flags
      features: {
        jwtDebugMode: process.env.JWT_DEBUG_MODE === 'true',
        enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
        enableMetrics: process.env.ENABLE_METRICS !== 'false',
        enableCaching: process.env.ENABLE_CACHING !== 'false'
      },

      // Environment
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production',
        isDevelopment: process.env.NODE_ENV !== 'production',
        isTest: process.env.NODE_ENV === 'test'
      },

      // Runtime Configuration (can be updated)
      runtime: {
        maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE || '50'),
        cacheTimeout: parseInt(process.env.CACHE_TIMEOUT || '1800000'), // 30 minutes
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(process.env.RETRY_DELAY || '1000')
      }
    };

    this.validateConfiguration();
  }

  /**
   * Validate configuration
   * @returns {Object} - Validation result
   */
  validateConfiguration() {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Required fields
    const required = [
      { path: 'appwrite.endpoint', name: 'APPWRITE_END_POINT' },
      { path: 'appwrite.projectId', name: 'APPWRITE_PROJECT_ID' },
      { path: 'appwrite.databaseId', name: 'APPWRITE_DB_ID' }
    ];

    for (const field of required) {
      const value = this.getNestedValue(this.config, field.path);
      if (!value) {
        result.isValid = false;
        result.errors.push(`Missing required configuration: ${field.name}`);
      }
    }

    // Optional but recommended
    if (!this.config.appwrite.apiKey) {
      result.warnings.push('APPWRITE_DEV_KEY not configured - admin operations will be unavailable');
    }

    // Validate formats
    if (this.config.appwrite.endpoint && !this.isValidUrl(this.config.appwrite.endpoint)) {
      result.errors.push('APPWRITE_END_POINT is not a valid URL');
      result.isValid = false;
    }

    // Validate runtime values
    if (this.config.runtime.maxCacheSize < 1) {
      result.warnings.push('MAX_CACHE_SIZE should be at least 1');
      this.config.runtime.maxCacheSize = 1;
    }

    if (this.config.runtime.retryAttempts < 0) {
      result.warnings.push('RETRY_ATTEMPTS cannot be negative');
      this.config.runtime.retryAttempts = 0;
    }

    this.validated = result.isValid;
    this.validationResult = result;

    return result;
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key (dot notation)
   * @param {*} defaultValue - Default value if not found
   * @returns {*} - Configuration value
   */
  get(key, defaultValue = null) {
    if (!this.validated) {
      this.validateConfiguration();
    }

    const value = this.getNestedValue(this.config, key);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set runtime configuration value
   * @param {string} key - Configuration key
   * @param {*} value - New value
   * @returns {boolean} - Success status
   */
  set(key, value) {
    // Only allow runtime configuration updates
    if (!key.startsWith('runtime.')) {
      console.warn(`Cannot update non-runtime configuration: ${key}`);
      return false;
    }

    const path = key.split('.');
    let current = this.config;

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {};
      }
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
    return true;
  }

  /**
   * Get all configuration
   * @returns {Object} - Complete configuration
   */
  getAll() {
    if (!this.validated) {
      this.validateConfiguration();
    }
    return { ...this.config };
  }

  /**
   * Get Appwrite-specific configuration
   * @returns {Object} - Appwrite configuration
   */
  getAppwriteConfig() {
    return {
      endpoint: this.config.appwrite.endpoint,
      projectId: this.config.appwrite.projectId,
      databaseId: this.config.appwrite.databaseId,
      hasApiKey: !!this.config.appwrite.apiKey
    };
  }

  /**
   * Check if a feature is enabled
   * @param {string} feature - Feature name
   * @returns {boolean} - Whether feature is enabled
   */
  isFeatureEnabled(feature) {
    return this.config.features[feature] === true;
  }

  /**
   * Get environment info
   * @returns {Object} - Environment information
   */
  getEnvironment() {
    return { ...this.config.environment };
  }

  /**
   * Check if configuration is valid
   * @returns {boolean} - Validation status
   */
  isValid() {
    if (!this.validated) {
      this.validateConfiguration();
    }
    return this.validated;
  }

  /**
   * Get validation errors
   * @returns {Array<string>} - Validation errors
   */
  getValidationErrors() {
    if (!this.validationResult) {
      this.validateConfiguration();
    }
    return this.validationResult.errors;
  }

  /**
   * Get validation warnings
   * @returns {Array<string>} - Validation warnings
   */
  getValidationWarnings() {
    if (!this.validationResult) {
      this.validateConfiguration();
    }
    return this.validationResult.warnings;
  }

  /**
   * Reload configuration from environment
   */
  reload() {
    this.validated = false;
    this.initialize();
  }

  /**
   * Export configuration for logging
   * @returns {Object} - Safe configuration for logging
   */
  exportForLogging() {
    return {
      endpoint: this.config.appwrite.endpoint,
      projectId: this.config.appwrite.projectId,
      databaseId: this.config.appwrite.databaseId,
      hasApiKey: !!this.config.appwrite.apiKey,
      features: this.config.features,
      environment: this.config.environment,
      runtime: this.config.runtime,
      isValid: this.validated,
      errors: this.validationResult?.errors || [],
      warnings: this.validationResult?.warnings || []
    };
  }

  // Helper methods

  /**
   * Get nested value from object
   * @private
   */
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Validate URL format
   * @private
   */
  isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  /**
   * Create configuration summary
   * @returns {string} - Configuration summary
   */
  getSummary() {
    const lines = [
      '=== Appwrite Configuration ===',
      `Endpoint: ${this.config.appwrite.endpoint || 'NOT SET'}`,
      `Project ID: ${this.config.appwrite.projectId || 'NOT SET'}`,
      `Database ID: ${this.config.appwrite.databaseId || 'NOT SET'}`,
      `API Key: ${this.config.appwrite.apiKey ? 'SET' : 'NOT SET'}`,
      '',
      '=== Environment ===',
      `Node Environment: ${this.config.environment.nodeEnv}`,
      `Production: ${this.config.environment.isProduction}`,
      '',
      '=== Features ===',
      `JWT Debug Mode: ${this.config.features.jwtDebugMode}`,
      `Health Checks: ${this.config.features.enableHealthChecks}`,
      `Metrics: ${this.config.features.enableMetrics}`,
      `Caching: ${this.config.features.enableCaching}`,
      '',
      '=== Runtime ===',
      `Max Cache Size: ${this.config.runtime.maxCacheSize}`,
      `Cache Timeout: ${this.config.runtime.cacheTimeout}ms`,
      `Retry Attempts: ${this.config.runtime.retryAttempts}`,
      `Retry Delay: ${this.config.runtime.retryDelay}ms`,
      '',
      '=== Validation ===',
      `Valid: ${this.validated}`,
      `Errors: ${this.validationResult?.errors?.length || 0}`,
      `Warnings: ${this.validationResult?.warnings?.length || 0}`
    ];

    return lines.join('\n');
  }
}

// Singleton instance
let instance = null;

/**
 * Get configuration manager instance
 * @returns {ConfigManager} - ConfigManager instance
 */
export function getConfigManager() {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

export default ConfigManager;