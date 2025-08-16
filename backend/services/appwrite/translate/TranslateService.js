import { v2 as Translate } from '@google-cloud/translate';
import { TRANSLATION_EVENTS, SUPPORTED_LANGUAGES } from './TranslateConstants.js';
import fs from 'fs';
import path from 'path';

/**
 * Translation Service using Google Cloud Translate
 */
export class TranslateService {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.documentOps = dependencies.documentOperations;
    this.clientManager = dependencies.clientManager;
    this.performanceMonitor = dependencies.performanceMonitor;
    this.errorAnalyzer = dependencies.errorAnalyzer;
    this.postHog = dependencies.postHogService;
    this.config = dependencies.configManager;
    this.quotaManager = dependencies.quotaManager;

    // Initialize Google Translate client
    this.translator = null;
    this.initializeTranslator();

    // Translation cache for optimization
    this.translationCache = new Map();
    this.maxCacheSize = 1000;

    // Statistics
    this.stats = {
      totalTranslations: 0,
      cachedResponses: 0,
      failedTranslations: 0,
      byLanguage: {}
    };
  }

  /**
   * Initialize Google Cloud Translate
   * @private
   */
  initializeTranslator() {
    try {
      // First try to use keyfile if available
      const keyfilePath = this.config?.get('google.keyFilename') || process.env.GOOGLE_CLOUD_KEY_FILE;

      if (keyfilePath) {
        // Use service account keyfile
        const absolutePath = path.isAbsolute(keyfilePath)
          ? keyfilePath
          : path.join(process.cwd(), keyfilePath);

        if (fs.existsSync(absolutePath)) {
          // Read and parse keyfile
          const keyfileContent = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

          // v2 API için doğru constructor
          this.translator = new Translate.Translate({
            projectId: keyfileContent.project_id,
            keyFilename: absolutePath
          });

          this.log('Google Translate initialized with service account keyfile');
          return;
        } else {
          this.log(`Keyfile not found at ${absolutePath}, falling back to API key`);
        }
      }

      // Fallback to API key method
      const projectId = this.config?.get('google.projectId') || process.env.GOOGLE_CLOUD_PROJECT_ID;
      const apiKey = this.config?.get('google.apiKey') || process.env.GOOGLE_TRANSLATE_API_KEY;

      if (!apiKey) {
        throw new Error('Google Translate API key or keyfile not configured');
      }

      // v2 API için doğru constructor
      this.translator = new Translate.Translate({
        projectId,
        key: apiKey
      });

      this.log('Google Translate initialized with API key');
    } catch (error) {
      this.log('Failed to initialize Google Translate:', error.message);
      console.error('Full error:', error);
      throw error;
    }
  }

  // Rest of the methods remain the same...

  /**
   * Translate a message
   * @param {string} jwtToken - User JWT token
   * @param {string} messageId - Message ID to translate
   * @param {string} targetLanguage - Target language code
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} - Translation result
   */
  async translateMessage(jwtToken, requestedUserId, messageId, targetLanguage, options = {}) {
    const context = {
      methodName: 'translateMessage',
      messageId,
      targetLanguage,
      timestamp: new Date().toISOString()
    };

    return this.executeTranslation(async () => {
      // Get the original message from database first
      const message = await this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_MESSAGES_ID,
        messageId
      );

      if (!message) {
        throw new Error('Message not found');
      }

      // Check and consume translation quota
      if (this.quotaManager) {
        const quotaResult = await this.quotaManager.checkAndConsumeQuota(
          jwtToken,
          requestedUserId,
          'TRANSLATE',
          1
        );

        if (!quotaResult.success) {
          return {
            success: false,
            error: 'QUOTA_EXCEEDED',
            message: quotaResult.message,
            quotaInfo: {
              remaining: quotaResult.remaining,
              dailyLimit: quotaResult.dailyLimit,
              nextResetAt: quotaResult.nextResetAt,
              nextResetIn: quotaResult.nextResetIn
            }
          };
        }
      }

      // Validate target language
      if (!this.isLanguageSupported(targetLanguage)) {
        throw new Error(`Language ${targetLanguage} is not supported`);
      }

      // Check if already translated to this language
      if (message.translatedBody && message.translatedLanguage === targetLanguage) {
        this.log(`Message ${messageId} already translated to ${targetLanguage}`);

        const quotaStatus = await this.getQuotaStatus(jwtToken, requestedUserId);

        return {
          success: true,
          messageId,
          originalText: message.message,
          translatedText: message.translatedBody,
          targetLanguage: message.translatedLanguage,
          cached: true,
          quotaInfo: quotaStatus
        };
      }

      // Check cache first
      const cacheKey = this.getCacheKey(message.message, targetLanguage);
      const cachedTranslation = this.translationCache.get(cacheKey);

      if (cachedTranslation && !options.forceRefresh) {
        this.stats.cachedResponses++;

        // Update message with cached translation
        await this.updateMessageTranslation(
          jwtToken,
          messageId,
          cachedTranslation.translatedText,
          targetLanguage
        );

        const quotaStatus = await this.getQuotaStatus(jwtToken, requestedUserId);

        return {
          success: true,
          messageId,
          originalText: message.message,
          translatedText: cachedTranslation.translatedText,
          targetLanguage,
          cached: true,
          quotaInfo: quotaStatus
        };
      }

      // Perform translation
      const translatedText = await this.performTranslation(
        message.message,
        targetLanguage,
        options.sourceLanguage
      );

      // Cache the translation
      this.cacheTranslation(message.message, targetLanguage, translatedText);

      // Update message in database
      await this.updateMessageTranslation(
        jwtToken,
        messageId,
        translatedText,
        targetLanguage
      );

      // Track event
      await this.trackTranslationEvent(
        TRANSLATION_EVENTS.MESSAGE_TRANSLATED,
        {
          message_id: messageId,
          target_language: targetLanguage,
          original_length: message.message.length,
          translated_length: translatedText.length
        },
        requestedUserId
      );

      // Update statistics
      this.updateStatistics(targetLanguage);

      const quotaStatus = await this.getQuotaStatus(jwtToken, requestedUserId);

      return {
        success: true,
        messageId,
        originalText: message.message,
        translatedText,
        targetLanguage,
        cached: false,
        quotaInfo: quotaStatus
      };

    }, context, jwtToken);
  }

  /**
   * Translate multiple messages
   * @param {string} jwtToken - User JWT token
   * @param {Array<string>} messageIds - Message IDs to translate
   * @param {string} targetLanguage - Target language code
   * @returns {Promise<Object>} - Batch translation results
   */
  async translateBatch(jwtToken, messageIds, targetLanguage) {
    const context = {
      methodName: 'translateBatch',
      messageCount: messageIds.length,
      targetLanguage
    };

    return this.executeTranslation(async () => {
      const results = {
        successful: [],
        failed: [],
        totalProcessed: 0
      };

      for (const messageId of messageIds) {
        try {
          const result = await this.translateMessage(
            jwtToken,
            messageId,
            targetLanguage
          );

          results.successful.push({
            messageId,
            translatedText: result.translatedText
          });
        } catch (error) {
          results.failed.push({
            messageId,
            error: error.message
          });
        }

        results.totalProcessed++;
      }

      results.successRate = (results.successful.length / results.totalProcessed) * 100;

      // Track batch event
      await this.trackTranslationEvent(
        TRANSLATION_EVENTS.BATCH_TRANSLATED,
        {
          total_messages: messageIds.length,
          successful_count: results.successful.length,
          failed_count: results.failed.length,
          target_language: targetLanguage,
          success_rate: results.successRate
        }
      );

      return results;
    }, context, jwtToken);
  }

  /**
   * Translate conversation (all messages between two users)
   * @param {string} jwtToken - User JWT token
   * @param {string} conversationId - Conversation ID
   * @param {string} targetLanguage - Target language code
   * @returns {Promise<Object>} - Conversation translation result
   */
  async translateConversation(jwtToken, conversationId, targetLanguage) {
    const context = {
      methodName: 'translateConversation',
      conversationId,
      targetLanguage
    };

    return this.executeTranslation(async () => {
      // Get all messages in conversation
      const messages = await this.documentOps.listDocuments(
        jwtToken,
        'messages',
        [
          { field: 'conversationId', operator: 'equal', value: conversationId },
          { field: '$createdAt', operator: 'orderDesc' }
        ]
      );

      if (!messages.documents || messages.documents.length === 0) {
        throw new Error('No messages found in conversation');
      }

      // Translate all messages
      const messageIds = messages.documents.map(msg => msg.$id);
      const results = await this.translateBatch(jwtToken, messageIds, targetLanguage);

      // Track conversation translation
      await this.trackTranslationEvent(
        TRANSLATION_EVENTS.CONVERSATION_TRANSLATED,
        {
          conversation_id: conversationId,
          message_count: messageIds.length,
          target_language: targetLanguage,
          success_rate: results.successRate
        }
      );

      return {
        conversationId,
        totalMessages: messageIds.length,
        ...results
      };
    }, context, jwtToken);
  }

  /**
   * Detect language of text
   * @param {string} text - Text to detect language
   * @returns {Promise<Object>} - Detection result
   */
  async detectLanguage(text) {
    try {
      const [detections] = await this.translator.detect(text);
      const detection = Array.isArray(detections) ? detections[0] : detections;

      return {
        language: detection.language,
        confidence: detection.confidence,
        isSupported: this.isLanguageSupported(detection.language)
      };
    } catch (error) {
      this.log('Language detection failed:', error.message);
      throw error;
    }
  }

  /**
   * Get supported languages
   * @param {string} displayLanguage - Language for display names
   * @returns {Promise<Array>} - Supported languages
   */
  async getSupportedLanguages(displayLanguage = 'en') {
    try {
      const [languages] = await this.translator.getLanguages(displayLanguage);
      return languages.map(lang => ({
        code: lang.code,
        name: lang.name,
        isActive: SUPPORTED_LANGUAGES[lang.code]?.active || false
      }));
    } catch (error) {
      // Return static list if API fails
      return Object.entries(SUPPORTED_LANGUAGES).map(([code, data]) => ({
        code,
        name: data.name,
        isActive: data.active
      }));
    }
  }

  // Private helper methods

  /**
   * Perform actual translation
   * @private
   */
  async performTranslation(text, targetLanguage, sourceLanguage = null) {
    try {
      // Translator'ın düzgün initialize edildiğini kontrol et
      if (!this.translator) {
        throw new Error('Translator not initialized');
      }

      const options = {
        to: targetLanguage,
        ...(sourceLanguage && { from: sourceLanguage })
      };

      const [translation] = await this.translator.translate(text, options);
      return translation;
    } catch (error) {
      this.stats.failedTranslations++;
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  /**
   * Update message with translation in database using admin privileges
   * @private
   */
  async updateMessageTranslation(jwtToken, messageId, translatedText, targetLanguage) {
    // Use admin operations to update the message regardless of who created it
    // This allows us to update messages created by any user
    const databases = this.clientManager.getAdminDatabases();
    const databaseId = process.env.APPWRITE_DB_ID;
    
    return databases.updateDocument(
      databaseId,
      process.env.DB_COLLECTION_MESSAGES_ID,
      messageId,
      {
        translatedBody: translatedText,
        translatedLanguage: targetLanguage
      }
    );
  }

  /**
   * Cache translation for optimization
   * @private
   */
  cacheTranslation(originalText, targetLanguage, translatedText) {
    const cacheKey = this.getCacheKey(originalText, targetLanguage);

    // Limit cache size
    if (this.translationCache.size >= this.maxCacheSize) {
      const firstKey = this.translationCache.keys().next().value;
      this.translationCache.delete(firstKey);
    }

    this.translationCache.set(cacheKey, {
      translatedText,
      timestamp: Date.now()
    });
  }

  /**
   * Get cache key
   * @private
   */
  getCacheKey(text, language) {
    return `${language}:${text.substring(0, 100)}`;
  }

  /**
   * Check if language is supported
   * @private
   */
  isLanguageSupported(languageCode) {
    return SUPPORTED_LANGUAGES[languageCode]?.active || false;
  }

  /**
   * Execute translation with error handling
   * @private
   */
  async executeTranslation(operation, context, jwtToken = null) {
    try {
      // Check user translation limits if JWT provided
      if (jwtToken) {
        await this.checkTranslationLimits(jwtToken);
      }

      // Performance tracking
      if (this.performanceMonitor) {
        return await this.performanceMonitor.trackOperation(
          context.methodName,
          operation,
          context
        );
      }

      return await operation();

    } catch (error) {
      // Error analysis
      if (this.errorAnalyzer) {
        await this.errorAnalyzer.trackError(error, context);
      }

      this.log(`Translation operation failed: ${error.message}`, context);
      throw error;
    }
  }

  /**
   * Check user translation limits
   * @private
   */
  async checkTranslationLimits(jwtToken) {
    // Quota checking is now handled by QuotaManager
    return true;
  }

  /**
   * Get current quota status for user
   * @private
   */
  async getQuotaStatus(jwtToken, userId) {
    if (!this.quotaManager) {
      return null;
    }

    try {
      const status = await this.quotaManager.getQuotaStatus(
        jwtToken,
        userId,
        'TRANSLATE'
      );

      return {
        remaining: status.remaining,
        dailyLimit: status.dailyLimit,
        nextResetAt: status.nextResetAt,
        nextResetIn: status.nextResetIn
      };
    } catch (error) {
      this.log('Failed to get quota status:', error.message);
      return null;
    }
  }

  /**
   * Update statistics
   * @private
   */
  updateStatistics(language) {
    this.stats.totalTranslations++;

    if (!this.stats.byLanguage[language]) {
      this.stats.byLanguage[language] = 0;
    }
    this.stats.byLanguage[language]++;
  }

  /**
   * Track translation event
   * @private
   */
  async trackTranslationEvent(eventName, data, userId = 'system') {
    if (!this.postHog) return;

    try {
      await this.postHog.trackBusinessEvent(eventName, data, userId);
    } catch (error) {
      this.log('Failed to track translation event:', error.message);
    }
  }

  /**
   * Get translation statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      cacheSize: this.translationCache.size,
      cacheHitRate: this.stats.cachedResponses > 0 ?
        (this.stats.cachedResponses / this.stats.totalTranslations) * 100 : 0
    };
  }

  /**
   * Clear translation cache
   */
  clearCache() {
    const size = this.translationCache.size;
    this.translationCache.clear();
    this.log(`Cleared ${size} cached translations`);
    return size;
  }
}

export default TranslateService;