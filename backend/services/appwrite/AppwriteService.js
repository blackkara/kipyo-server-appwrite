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

// Messaging modules
import { MessagingService } from './messaging/MessagingService.js';

// Monitoring modules
import { ErrorAnalyzer } from './monitoring/ErrorAnalyzer.js';
import { PerformanceMonitor } from './monitoring/PerformanceMonitor.js';
import { HealthChecker } from './monitoring/HealthChecker.js';

// Notifications modules
import { NotificationService } from './notification/NotificationService.js';
import { NotificationTemplates } from './notification/NotificationTemplates.js';

// Translation modules
import { TranslateService } from './translate/TranslateService.js';

// Quota management
import { QuotaManager } from './quota/QuotaManager.js';

// Vision modules
import { ImageAnalysisService } from './vision/ImageAnalysisService.js';

// Utils
import { RetryManager } from './utils/RetryManager.js';
import NetworkUtils from './utils/NetworkUtils.js';

import PostHogService from '../../utils/posthog/PostHogService.js';

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

    // Notifications modules
    this.notificationService = new NotificationService({
      logger: this.log,
      clientManager: this.clientManager,
      performanceMonitor: this.performanceMonitor,
      errorAnalyzer: this.errorAnalyzer,
      postHogService: this.postHog,
      configManager: this.configManager
    });

    this.notificationTemplates = new NotificationTemplates(this.notificationService);

    // Quota management module
    this.quotaManager = new QuotaManager({
      logger: this.log,
      adminOperations: this.adminOps,
      postHogService: this.postHog
    });

    // Messaging modules
    this.messagingService = new MessagingService({
      logger: this.log,
      clientManager: this.clientManager,
      documentOperations: this.documentOps,
      adminOperations: this.adminOps,
      performanceMonitor: this.performanceMonitor,
      errorAnalyzer: this.errorAnalyzer,
      postHogService: this.postHog,
      configManager: this.configManager,
      quotaManager: this.quotaManager,
      notificationService: this.notificationService,
      notificationTemplates: this.notificationTemplates
    });

    // Translation module
    this.translateService = new TranslateService({
      logger: this.log,
      documentOperations: this.documentOps,
      clientManager: this.clientManager,
      performanceMonitor: this.performanceMonitor,
      errorAnalyzer: this.errorAnalyzer,
      postHogService: this.postHog,
      configManager: this.configManager,
      retryManager: this.retryManager,
      quotaManager: this.quotaManager
    });

    // Vision module
    this.imageAnalysisService = new ImageAnalysisService({
      logger: this.log,
      documentOperations: this.documentOps,
      storageService: null, // Can be added if needed
      performanceMonitor: this.performanceMonitor,
      errorAnalyzer: this.errorAnalyzer,
      postHogService: this.postHog,
      configManager: this.configManager,
      retryManager: this.retryManager
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

  async createDocument(jwtToken, collectionId, documentId, data, permissions = []) {
    return this.documentOps.createDocument(jwtToken, collectionId, documentId, data, permissions);
  }

  async updateDocument(jwtToken, collectionId, documentId, data) {
    return this.documentOps.updateDocument(jwtToken, collectionId, documentId, data);
  }

  async upsertDocument(jwtToken, collectionId, documentId, data, permissions = null) {
    return this.documentOps.upsertDocument(jwtToken, collectionId, documentId, data, permissions);
  }

  async deleteDocument(jwtToken, collectionId, documentId) {
    return this.documentOps.deleteDocument(jwtToken, collectionId, documentId);
  }

  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    return this.documentOps.deleteUserDocuments(jwtToken, collectionId, additionalQueries);
  }

  async bulkUpsertDocuments(jwtToken, collectionId, documents) {
    return this.documentOps.bulkUpsertDocuments(jwtToken, collectionId, documents);
  }

  // ======================
  // Admin Operations (Backward Compatibility)
  // ======================

  async createDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    return this.adminOps.createDocumentWithAdminPrivileges(
      jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers
    );
  }

  async updateDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    return this.adminOps.updateDocumentWithAdminPrivileges(
      jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers
    );
  }

  async upsertDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    return this.adminOps.upsertDocumentWithAdminPrivileges(
      jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers
    );
  }

  async deleteDocumentWithAdminPrivileges(jwtToken, collectionId, documentId) {
    return this.adminOps.deleteDocumentWithAdminPrivileges(jwtToken, collectionId, documentId);
  }

  async bulkUpsertDocumentsWithAdminPrivileges(jwtToken, collectionId, documents) {
    return this.adminOps.bulkUpsertDocumentsWithAdminPrivileges(jwtToken, collectionId, documents);
  }

  buildPermissions(ownerId, additionalUsers = []) {
    return this.adminOps.buildPermissions(ownerId, additionalUsers);
  }

  requireSystemUser(userInfo) {
    // DEPRECATED: Admin operations now use API key internally, not user status
    console.warn('requireSystemUser is deprecated. Admin operations use API key internally regardless of user status.');
    if (!userInfo.isSystemUser) {
      throw new Error('Unauthorized: Admin privileges required');
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
  // Notification Operations (Backward Compatibility)
  // ======================

  async sendNotification(title, body, userIds, data = {}, options = {}) {
    return this.notificationService.sendToUsers(title, body, userIds, data, options);
  }

  async sendMatchNotification(userId1, userId2, matchData) {
    return this.notificationTemplates.sendMatchNotification(userId1, userId2, matchData);
  }

  async sendLikeNotification(likerId, likedId, likerName) {
    return this.notificationTemplates.sendLikeNotification(likerId, likedId, likerName);
  }

  async sendMessageNotification(senderId, receiverId, senderName, messagePreview) {
    return this.notificationTemplates.sendMessageNotification(senderId, receiverId, senderName, messagePreview);
  }

  async sendDirectMessageNotification(senderId, receiverId, senderName, messagePreview, directMessageData = {}) {
    return this.notificationTemplates.sendDirectMessageNotification(senderId, receiverId, senderName, messagePreview, directMessageData);
  }

  async sendTopicNotification(topic, title, body, data = {}, options = {}) {
    return this.notificationService.sendToTopics([topic], title, body, data, options);
  }

  async sendBatchNotifications(notifications) {
    return this.notificationService.sendBatch(notifications);
  }

  async sendChatNotification(senderId, receiverId, senderName, messagePreview, options = {}) {
    if (options.isDirectMessage) {
      return this.notificationTemplates.sendDirectMessageNotification(
        senderId,
        receiverId,
        senderName,
        messagePreview,
        options
      );
    } else {
      return this.notificationTemplates.sendMessageNotification(
        senderId,
        receiverId,
        senderName,
        messagePreview,
        options
      );
    }
  }

  getNotificationStatistics() {
    return this.notificationService.getStatistics();
  }

  // ======================
  // Translation Operations (Backward Compatibility)
  // ======================

  async translateMessage(jwtToken, messageId, targetLanguage, options = {}) {
    return this.translateService.translateMessage(jwtToken, messageId, targetLanguage, options);
  }

  async translateBatch(jwtToken, messageIds, targetLanguage) {
    return this.translateService.translateBatch(jwtToken, messageIds, targetLanguage);
  }

  async translateConversation(jwtToken, conversationId, targetLanguage) {
    return this.translateService.translateConversation(jwtToken, conversationId, targetLanguage);
  }

  async detectLanguage(text) {
    return this.translateService.detectLanguage(text);
  }

  async getSupportedLanguages(displayLanguage = 'en') {
    return this.translateService.getSupportedLanguages(displayLanguage);
  }

  getTranslationStatistics() {
    return this.translateService.getStatistics();
  }

  clearTranslationCache() {
    return this.translateService.clearCache();
  }

  // ======================
  // Image Analysis Operations (Backward Compatibility)
  // ======================

  async analyzeImage(image, options = {}) {
    return this.imageAnalysisService.analyzeImage(image, options);
  }

  async analyzeProfilePhoto(jwtToken, image, options = {}) {
    return this.imageAnalysisService.analyzeProfilePhoto(jwtToken, image, options);
  }

  async analyzeBatch(images, options = {}) {
    return this.imageAnalysisService.analyzeBatch(images, options);
  }

  async moderateContent(jwtToken, contentId, contentType, image) {
    return this.imageAnalysisService.moderateContent(jwtToken, contentId, contentType, image);
  }

  getImageAnalysisStatistics() {
    return this.imageAnalysisService.getStatistics();
  }

  clearImageAnalysisCache() {
    return this.imageAnalysisService.clearCache();
  }

  // ======================
  // Messaging Operations (YENİ BÖLÜM)
  // ======================

  /**
   * Send a regular message between matched/liked users
   * @param {string} jwtToken - User JWT token
   * @param {string} senderId - Sender user ID
   * @param {string} receiverId - Receiver user ID
   * @param {string} message - Message content
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Message result with notification status
   */
  async sendMessage(jwtToken, senderId, receiverId, message, options = {}) {
    return this.messagingService.sendMessage(jwtToken, senderId, receiverId, message, options);
  }

  /**
   * Send a direct message (special privilege message without match/like requirement)
   * @param {string} jwtToken - User JWT token
   * @param {string} senderId - Sender user ID
   * @param {string} receiverId - Receiver user ID
   * @param {string} message - Message content
   * @param {Object} options - Additional options including quota info
   * @returns {Promise<Object>} - Direct message result with notification status
   */
  async sendDirectMessage(jwtToken, senderId, receiverId, message, options = {}) {
    return this.messagingService.sendDirectMessage(jwtToken, senderId, receiverId, message, options);
  }

  /**
   * Get messaging statistics
   * @returns {Object} - Messaging statistics
   */
  getMessagingStatistics() {
    return this.messagingService.getStatistics();
  }

  /**
   * Get or create conversation between two users
   * @param {string} jwtToken - User JWT token
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {Promise<string>} - Conversation ID
   */
  async getOrCreateConversation(jwtToken, userId1, userId2) {
    return this.messagingService.getOrCreateConversation(jwtToken, userId1, userId2);
  }

  /**
   * Get or create direct message conversation
   * @param {string} jwtToken - User JWT token
   * @param {string} senderId - Sender user ID
   * @param {string} receiverId - Receiver user ID
   * @returns {Promise<string>} - Direct conversation ID
   */
  async getOrCreateDirectConversation(jwtToken, senderId, receiverId) {
    return this.messagingService.getOrCreateDirectConversation(jwtToken, senderId, receiverId);
  }

  /**
   * Get unread message count for user
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Unread count
   */
  async getUnreadMessageCount(userId) {
    return this.messagingService.getUnreadCount(userId);
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



/**
 * 
 * 
 *   const likeId = generateDocumentId('like', senderId, receiverId);
      const reverseLikeId = generateDocumentId('like', receiverId, senderId);
      const matchId = generateDocumentId('match', senderId, receiverId);
      const dialogId = generateDocumentId('dialog', senderId, receiverId);
 */