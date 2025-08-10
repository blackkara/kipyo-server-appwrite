// src/services/appwrite/AppwriteService.js

import { Query, Permission, Role } from 'node-appwrite';

// Core modules
import { ConfigManager } from './core/ConfigManager.js';
import { ConnectionManager } from './core/ConnectionManager.js';
import { ClientManager } from './core/ClientManager.js';

// Cache modules
import { ClientCache } from './cache/ClientCache.js';
import { CacheStatistics } from './cache/CacheStatistics.js';

// Auth modules
import { AuthorizationExtractor } from './auth/AuthorizationExtractor.js';
import { JWTCleaner } from './auth/JWTCleaner.js';
import { JWTAnalyzer } from './auth/JWTAnalyzer.js';
import { JWTValidator } from './auth/JWTValidator.js';

// Operations modules
import { DocumentOperations } from './operations/DocumentOperations.js';
import { AdminOperations } from './operations/AdminOperations.js';

// Monitoring modules
import { ErrorAnalyzer } from './monitoring/ErrorAnalyzer.js';
import { PerformanceMonitor } from './monitoring/PerformanceMonitor.js';
import { HealthChecker } from './monitoring/HealthChecker.js';

// Utils
import { RetryManager } from './utils/RetryManager.js';
import NetworkUtils from './utils/NetworkUtils.js';

/**
 * Main AppwriteService coordinator
 * Provides backward compatibility while using modular architecture
 */
class AppwriteService {
  constructor(logger, postHogConfig = {}) {
    // Singleton pattern
    if (AppwriteService.instance) {
      return AppwriteService.instance;
    }

    this.log = logger || console.log;
    
    // Initialize PostHog if available
    try {
      const PostHogService = require('./utils/posthog/PostHogService.js').default;
      this.postHog = new PostHogService(postHogConfig);
    } catch (e) {
      this.log('PostHog service not available');
      this.postHog = null;
    }

    // Initialize all modules
    this.initializeModules();
    
    // Set singleton instance
    AppwriteService.instance = this;
    this.log('AppwriteService singleton instance created');
  }

  /**
   * Initialize all service modules
   * @private
   */
  initializeModules() {
    // Core modules
    this.configManager = new ConfigManager();
    this.connectionManager = new ConnectionManager(this.log, this.postHog);
    
    // Cache modules
    this.clientCache = new ClientCache(this.log, this.postHog, {
      maxCacheSize: this.configManager.get('runtime.maxCacheSize'),
      cacheTimeout: this.configManager.get('runtime.cacheTimeout')
    });
    this.cacheStatistics = new CacheStatistics(this.clientCache, this.log);
    
    // Client manager
    this.clientManager = new ClientManager({
      logger: this.log,
      clientCache: this.clientCache,
      configManager: this.configManager,
      connectionManager: this.connectionManager
    });
    
    // Auth modules
    this.authExtractor = new AuthorizationExtractor(this.log);
    this.jwtCleaner = new JWTCleaner(this.log);
    this.jwtAnalyzer = new JWTAnalyzer(this.log, this.jwtCleaner);
    this.jwtValidator = new JWTValidator({
      logger: this.log,
      postHogService: this.postHog,
      jwtCleaner: this.jwtCleaner,
      jwtAnalyzer: this.jwtAnalyzer,
      authExtractor: this.authExtractor,
      retryManager: null, // Will be set after RetryManager init
      clientManager: this.clientManager
    });
    
    // Monitoring modules
    this.errorAnalyzer = new ErrorAnalyzer(this.log, this.postHog);
    this.performanceMonitor = new PerformanceMonitor(this.log);
    this.healthChecker = new HealthChecker({
      logger: this.log,
      connectionManager: this.connectionManager,
      cacheStatistics: this.cacheStatistics,
      performanceMonitor: this.performanceMonitor,
      errorAnalyzer: this.errorAnalyzer
    });
    
    // Retry manager
    this.retryManager = new RetryManager(this.log, this.postHog);
    this.jwtValidator.retryManager = this.retryManager;
    
    // Operations modules
    this.documentOps = new DocumentOperations({
      logger: this.log,
      clientManager: this.clientManager,
      jwtValidator: this.jwtValidator,
      retryManager: this.retryManager,
      performanceMonitor: this.performanceMonitor,
      postHogService: this.postHog,
      configManager: this.configManager
    });
    
    this.adminOps = new AdminOperations({
      logger: this.log,
      clientManager: this.clientManager,
      jwtValidator: this.jwtValidator,
      retryManager: this.retryManager,
      performanceMonitor: this.performanceMonitor,
      postHogService: this.postHog,
      configManager: this.configManager
    });
  }

  // ======================
  // Singleton Management
  // ======================
  
  static getInstance(logger, postHogConfig = {}) {
    if (!AppwriteService.instance) {
      AppwriteService.instance = new AppwriteService(logger, postHogConfig);
    }
    return AppwriteService.instance;
  }

  static resetInstance() {
    if (AppwriteService.instance) {
      AppwriteService.instance.shutdown();
      AppwriteService.instance = null;
    }
  }

  // ======================
  // JWT Methods (Backward Compatibility)
  // ======================
  
  cleanJWTToken(rawToken) {
    return this.jwtCleaner.cleanToken(rawToken);
  }

  safeDecodeJWTPayload(jwtToken) {
    return this.jwtAnalyzer.safeDecodePayload(jwtToken);
  }

  async validateJWT(jwtToken) {
    return this.jwtValidator.validateJWT(jwtToken);
  }

  async validateAndExtractUser(headers, requestId) {
    return this.jwtValidator.validateAndExtractUser(headers, requestId);
  }

  async checkJWTHealth(jwtToken) {
    return this.jwtAnalyzer.checkHealth(jwtToken);
  }

  async debugJWTIssue(headers, requestId = 'debug') {
    return this.jwtAnalyzer.debugJWTIssue(headers, requestId, this.authExtractor);
  }

  async getJWTDiagnostics(jwtToken) {
    return this.jwtAnalyzer.getDiagnostics(jwtToken);
  }

  // ======================
  // Client Management (Backward Compatibility)
  // ======================
  
  createClient(auth) {
    return this.clientManager.getClient(auth);
  }

  createClientSafe(auth) {
    return this.clientManager.getClient(auth);
  }

  getDatabases(auth) {
    return this.clientManager.getDatabases(auth);
  }

  getDatabasesSafe(auth) {
    return this.clientManager.getDatabases(auth);
  }

  getAccount(auth) {
    return this.clientManager.getAccount(auth);
  }

  getAccountSafe(auth) {
    return this.clientManager.getAccount(auth);
  }

  getAdminDatabases() {
    return this.clientManager.getAdminDatabases();
  }

  isJWTToken(auth) {
    return this.clientManager.isJWTToken(auth);
  }

  // ======================
  // Network & Retry (Backward Compatibility)
  // ======================
  
  async executeWithRetry(operation, context = {}, customRetryConfig = {}) {
    return this.retryManager.executeWithRetry(operation, context, customRetryConfig);
  }

  async executeWithCircuitBreaker(operation, context = {}) {
    const healthCheck = () => this.connectionManager.isCircuitOpen();
    return this.retryManager.executeWithCircuitBreaker(operation, context, healthCheck);
  }

  isRetryableNetworkError(error) {
    return NetworkUtils.isRetryableNetworkError(error);
  }

  analyzeNetworkError(error) {
    return NetworkUtils.analyzeNetworkError(error, this.connectionManager.connectionHealth);
  }

  analyzeAppwriteError(error) {
    return NetworkUtils.analyzeAppwriteError(error);
  }

  // ======================
  // Document Operations (Backward Compatibility)
  // ======================
  
  async listDocuments(jwtToken, collectionId, queries = []) {
    return this.documentOps.listDocuments(jwtToken, collectionId, queries);
  }

  async getDocument(jwtToken, collectionId, documentId) {
    return this.documentOps.getDocument(jwtToken, collectionId, documentId);
  }

  async updateDocument(jwtToken, collectionId, documentId, data) {
    return this.documentOps.updateDocument(jwtToken, collectionId, documentId, data);
  }

  async deleteDocument(jwtToken, collectionId, documentId) {
    return this.documentOps.deleteDocument(jwtToken, collectionId, documentId);
  }

  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    return this.documentOps.deleteUserDocuments(jwtToken, collectionId, additionalQueries);
  }

  // ======================
  // Admin Operations (Backward Compatibility)
  // ======================
  
  async createDocumentWithAdminPrivileges(authToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    return this.adminOps.createDocumentWithAdminPrivileges(
      authToken, requestingUserId, collectionId, documentId, data, additionalUsers
    );
  }

  async updateDocumentWithAdminPrivileges(authToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    return this.adminOps.updateDocumentWithAdminPrivileges(
      authToken, requestingUserId, collectionId, documentId, data, additionalUsers
    );
  }

  async deleteDocumentWithAdminPrivileges(authToken, collectionId, documentId) {
    return this.adminOps.deleteDocumentWithAdminPrivileges(authToken, collectionId, documentId);
  }

  buildPermissions(ownerId, additionalUsers = []) {
    return this.adminOps.buildPermissions(ownerId, additionalUsers);
  }

  requireSystemUser(userInfo) {
    // DEPRECATED: Now we check for API key usage instead
    console.warn('requireSystemUser is deprecated. Admin operations now require API key authentication.');
    if (!userInfo.isSystemUser) {
      throw new Error('Unauthorized: Admin privileges required (use API key instead of JWT)');
    }
  }

  // ======================
  // Health & Monitoring (Backward Compatibility)
  // ======================
  
  async testConnection() {
    const testFunction = async () => {
      const databases = this.clientManager.getAdminDatabases();
      await databases.list();
    };
    
    return this.connectionManager.testConnection(testFunction);
  }

  async getSystemHealth() {
    return this.healthChecker.getSystemHealth();
  }

  getNetworkHealth() {
    return this.connectionManager.getNetworkHealth();
  }

  getCacheStats() {
    return this.cacheStatistics.getDetailedStats();
  }

  isCircuitOpen() {
    return this.connectionManager.isCircuitOpen();
  }

  async emergencyJWTAnalysis(headers, requestId = 'emergency') {
    const report = {
      timestamp: new Date().toISOString(),
      requestId,
      systemHealth: await this.getSystemHealth(),
      networkHealth: this.getNetworkHealth(),
      cacheStats: this.getCacheStats(),
      jwtDebug: await this.debugJWTIssue(headers, requestId)
    };
    
    return report;
  }

  // ======================
  // Error Context Creation (Backward Compatibility)
  // ======================
  
  createSafeErrorContext(context, payloadDecodeResult, error, jwtToken) {
    return this.errorAnalyzer.createSafeErrorContext(
      context,
      { ...payloadDecodeResult, jwtToken },
      error
    );
  }

  categorizeValidationError(error, appwriteAnalysis) {
    return NetworkUtils.categorizeError(error, appwriteAnalysis);
  }

  // ======================
  // Cache Management
  // ======================
  
  cleanupCache() {
    return this.clientCache.cleanup();
  }

  // ======================
  // Static Helpers
  // ======================
  
  static createQuery() {
    return Query;
  }

  static createPermission() {
    return Permission;
  }

  static createRole() {
    return Role;
  }

  // ======================
  // PostHog Access
  // ======================
  
  getPostHogService() {
    return this.postHog;
  }

  // ======================
  // Shutdown
  // ======================
  
  async shutdown() {
    const shutdownStartTime = Date.now();
    this.log('AppwriteService shutdown initiated...');

    try {
      // Stop health checks
      if (this.healthChecker) {
        this.healthChecker.destroy();
      }

      // Clear cache
      if (this.clientCache) {
        await this.clientCache.destroy();
      }

      // Stop cache statistics
      if (this.cacheStatistics) {
        this.cacheStatistics.destroy();
      }

      // Flush PostHog
      if (this.postHog) {
        await this.postHog.flush();
        await this.postHog.shutdown();
      }

      const shutdownDuration = Date.now() - shutdownStartTime;
      this.log(`AppwriteService shutdown completed in ${shutdownDuration}ms`);

      // Clear singleton instance
      AppwriteService.instance = null;

    } catch (error) {
      console.error('Error during AppwriteService shutdown:', error);
      // Force clear singleton even on error
      AppwriteService.instance = null;
      throw error;
    }
  }
}

// Singleton instance holder
AppwriteService.instance = null;

// ======================
// Export Helper Functions (Backward Compatibility)
// ======================

export function extractJWTFromHeaders(headers) {
  const extractor = new AuthorizationExtractor(console.log);
  return extractor.extractJWT(headers);
}

export default AppwriteService;