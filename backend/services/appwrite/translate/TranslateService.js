// src/services/appwrite/translate/TranslateService.js

import { TRANSLATION_EVENTS, SUPPORTED_LANGUAGES, TRANSLATION_LIMITS } from './TranslateConstants.js';

/**
 * Translation Service using Google Cloud Translate
 */
export class TranslateService {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.documentOps = dependencies.documentOperations;
    this.performanceMonitor = dependencies.performanceMonitor;
    this.errorAnalyzer = dependencies.errorAnalyzer;
    this.postHog = dependencies.postHogService;
    this.config = dependencies.configManager;
    this.retryManager = dependencies.retryManager;
    
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
      const { Translate } = require('@google-cloud/translate').v2;
      
      // Get Google Cloud credentials from config or environment
      const projectId = this.config?.get('google.projectId') || process.env.GOOGLE_CLOUD_PROJECT_ID;
      const apiKey = this.config?.get('google.apiKey') || process.env.GOOGLE_TRANSLATE_API_KEY;
      
      if (!apiKey) {
        throw new Error('Google Translate API key not configured');
      }
      
      this.translator = new Translate({
        projectId,
        key: apiKey
      });
      
      this.log('Google Translate service initialized');
    } catch (error) {
      this.log('Failed to initialize Google Translate:', error.message);
      throw error;
    }
  }

  /**
   * Translate a message
   * @param {string} jwtToken - User JWT token
   * @param {string} messageId - Message ID to translate
   * @param {string} targetLanguage - Target language code
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} - Translation result
   */
  async translateMessage(jwtToken, messageId, targetLanguage, options = {}) {
    const context = {
      methodName: 'translateMessage',
      messageId,
      targetLanguage,
      timestamp: new Date().toISOString()
    };

    return this.executeTranslation(async () => {
      // Validate target language
      if (!this.isLanguageSupported(targetLanguage)) {
        throw new Error(`Language ${targetLanguage} is not supported`);
      }

      // Get the original message from database
      const message = await this.documentOps.getDocument(
        jwtToken,
        'messages',
        messageId
      );

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if already translated to this language
      if (message.translatedBody && message.translatedLanguage === targetLanguage) {
        this.log(`Message ${messageId} already translated to ${targetLanguage}`);
        return {
          success: true,
          messageId,
          originalText: message.body,
          translatedText: message.translatedBody,
          targetLanguage: message.translatedLanguage,
          cached: true
        };
      }

      // Check cache first
      const cacheKey = this.getCacheKey(message.body, targetLanguage);
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
        
        return {
          success: true,
          messageId,
          originalText: message.body,
          translatedText: cachedTranslation.translatedText,
          targetLanguage,
          cached: true
        };
      }

      // Perform translation
      const translatedText = await this.performTranslation(
        message.body,
        targetLanguage,
        options.sourceLanguage
      );

      // Cache the translation
      this.cacheTranslation(message.body, targetLanguage, translatedText);

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
          original_length: message.body.length,
          translated_length: translatedText.length
        },
        message.userId
      );

      // Update statistics
      this.updateStatistics(targetLanguage);

      return {
        success: true,
        messageId,
        originalText: message.body,
        translatedText,
        targetLanguage,
        cached: false
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
   * Update message with translation in database
   * @private
   */
  async updateMessageTranslation(jwtToken, messageId, translatedText, targetLanguage) {
    return this.documentOps.updateDocument(
      jwtToken,
      'messages',
      messageId,
      {
        translatedBody: translatedText,
        translatedLanguage: targetLanguage,
        translatedAt: new Date().toISOString()
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
    // This could check user's translation quota, subscription level, etc.
    // For now, just a placeholder
    return true;
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