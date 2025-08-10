// src/services/appwrite/auth/JWTValidator.js

import { TRACKING_EVENTS, ERROR_CATEGORIES } from '../utils/Constants.js';
import NetworkUtils from '../utils/NetworkUtils.js';

/**
 * JWT validation with Appwrite integration
 */
export class JWTValidator {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.postHog = dependencies.postHogService;
    this.cleaner = dependencies.jwtCleaner;
    this.analyzer = dependencies.jwtAnalyzer;
    this.extractor = dependencies.authExtractor;
    this.retryManager = dependencies.retryManager;
    this.clientManager = dependencies.clientManager;
  }

  /**
   * Validate JWT token with Appwrite
   * @param {string} jwtToken - JWT token to validate
   * @returns {Promise<Object>} - User information
   */
  async validateJWT(jwtToken) {
    const startTime = Date.now();
    const context = {
      methodName: 'validateJWT',
      additionalData: {
        hasToken: !!jwtToken,
        tokenSnippet: jwtToken ? jwtToken.slice(0, 12) + '...' : null,
        tokenLength: jwtToken ? jwtToken.length : 0,
        timestamp: new Date().toISOString()
      }
    };

    // Use retry manager if available
    if (this.retryManager) {
      return this.retryManager.executeWithRetry(
        async () => this._performValidation(jwtToken, context, startTime),
        context,
        { maxRetries: 2, baseDelay: 500, maxDelay: 3000 }
      );
    }

    return this._performValidation(jwtToken, context, startTime);
  }

  /**
   * Internal validation logic
   * @private
   */
  async _performValidation(jwtToken, context, startTime) {
    let cleanedToken = null;
    let payloadDecodeResult = null;

    try {
      // Step 1: Token existence check
      if (!jwtToken) {
        const err = new Error('JWT token is missing');
        await this.trackError(err, context);
        throw err;
      }

      // Step 2: Token cleaning
      if (this.cleaner) {
        cleanedToken = this.cleaner.cleanToken(jwtToken);
        if (!cleanedToken) {
          const cleanError = new Error('JWT token could not be cleaned or is malformed');
          
          const cleaningAnalysis = this.analyzeCleaningIssues(jwtToken);
          await this.trackError(cleanError, {
            ...context,
            cleaningAnalysis,
            additionalData: {
              ...context.additionalData,
              cleaningFailed: true
            }
          });

          throw cleanError;
        }

        context.additionalData.tokenWasCleaned = cleanedToken !== jwtToken;
        context.additionalData.cleanedTokenLength = cleanedToken.length;
      } else {
        cleanedToken = jwtToken;
      }

      // Step 3: JWT format validation
      const tokenParts = cleanedToken.split('.');
      if (tokenParts.length !== 3) {
        const formatError = new Error(`JWT token format is invalid (${tokenParts.length} parts instead of 3)`);
        
        const formatAnalysis = this.analyzeFormatIssues(tokenParts, cleanedToken);
        await this.trackError(formatError, {
          ...context,
          formatAnalysis
        });

        throw formatError;
      }

      // Step 4: Payload decode
      if (this.analyzer) {
        payloadDecodeResult = this.analyzer.safeDecodePayload(cleanedToken);
        
        // Step 5: Claims validation
        if (payloadDecodeResult.success && payloadDecodeResult.payload) {
          const validationErrors = this.analyzer.validateClaims(payloadDecodeResult.payload);
          if (validationErrors.length > 0) {
            const claimsError = new Error(`JWT claims validation failed: ${validationErrors.join(', ')}`);
            
            await this.trackError(claimsError, this.createErrorContext(
              context, payloadDecodeResult, claimsError, cleanedToken
            ));

            throw claimsError;
          }
        }
      }

      // Step 6: Appwrite validation
      const account = await this.getAccount(cleanedToken);
      const user = await account.get();

      const result = {
        ...user,
        userId: user.$id,
      };

      const duration = Date.now() - startTime;

      // Success tracking
      await this.trackSuccess(result, cleanedToken, jwtToken, payloadDecodeResult, duration);

      this.log(`JWT validation successful for user ${result.userId} (${duration}ms)`);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Enhanced error handling
      await this.handleValidationError(
        error, 
        context, 
        payloadDecodeResult, 
        cleanedToken || jwtToken,
        duration
      );

      throw error;
    }
  }

  /**
   * Validate and extract user from headers
   * @param {Object} headers - Request headers
   * @param {string} requestId - Request ID
   * @returns {Promise<Object>} - User info and JWT token
   */
  async validateAndExtractUser(headers, requestId) {
    const context = {
      methodName: 'validateAndExtractUser',
      requestId,
      additionalData: { hasHeaders: !!headers }
    };

    try {
      // Extract JWT from headers
      let jwtToken;
      if (this.extractor) {
        jwtToken = this.extractor.extractJWT(headers);
      } else {
        // Fallback extraction
        const authHeader = headers.authorization || headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new Error('Invalid authorization header');
        }
        jwtToken = authHeader.substring(7);
      }

      // Health check in debug mode
      if (process.env.NODE_ENV !== 'production' && process.env.JWT_DEBUG_MODE === 'true') {
        await this.performHealthCheck(jwtToken, requestId);
      }

      // Validate JWT
      const userInfo = await this.validateJWT(jwtToken);

      if (!userInfo.userId) {
        throw new Error('Failed to extract user info from JWT');
      }

      this.log(`[${requestId}] JWT validation successful for user: ${userInfo.userId}`);
      return { jwtToken, userInfo };

    } catch (error) {
      const errorCategory = this.categorizeError(error);
      
      // Debug analysis in specific cases
      if (errorCategory === ERROR_CATEGORIES.TOKEN_FORMAT && process.env.JWT_DEBUG_MODE === 'true') {
        await this.performDebugAnalysis(headers, requestId, error, context);
      }

      await this.trackError(error, {
        ...context,
        errorCategory
      });

      throw error;
    }
  }

  // Helper methods

  /**
   * Get account from client manager
   * @private
   */
  async getAccount(jwtToken) {
    if (this.clientManager) {
      return this.clientManager.getAccount(jwtToken);
    }
    throw new Error('Client manager not configured');
  }

  /**
   * Analyze cleaning issues
   * @private
   */
  analyzeCleaningIssues(jwtToken) {
    return {
      originalLength: jwtToken.length,
      originalParts: jwtToken.split('.').length,
      hasWhitespace: /\s/.test(jwtToken),
      hasNewlines: /[\n\r]/.test(jwtToken),
      hasTabs: /\t/.test(jwtToken),
      hasBearer: /bearer/i.test(jwtToken),
      hasUrlEncoding: /%/.test(jwtToken)
    };
  }

  /**
   * Analyze format issues
   * @private
   */
  analyzeFormatIssues(tokenParts, cleanedToken) {
    return {
      tokenLength: cleanedToken.length,
      partsCount: tokenParts.length,
      tokenSnippet: cleanedToken.slice(0, 100) + (cleanedToken.length > 100 ? '...' : ''),
      parts: tokenParts.map((part, index) => ({
        index,
        length: part.length,
        snippet: part.slice(0, 30) + (part.length > 30 ? '...' : ''),
        isEmpty: part === '',
        isWhitespace: part.trim() === '',
        hasInvalidChars: !/^[A-Za-z0-9+/=_-]*$/.test(part)
      }))
    };
  }

  /**
   * Create error context
   * @private
   */
  createErrorContext(context, payloadDecodeResult, error, jwtToken) {
    return {
      ...context,
      timestamp: new Date().toISOString(),
      jwtMeta: payloadDecodeResult?.success ? {
        hasPayload: true,
        payloadKeyCount: payloadDecodeResult.metadata?.payloadKeyCount
      } : {
        decodeError: payloadDecodeResult?.error
      },
      tokenMeta: {
        tokenLength: jwtToken?.length || 0,
        tokenParts: jwtToken?.split('.').length || 0
      },
      errorSummary: {
        message: error.message,
        code: error.code,
        type: error.type
      }
    };
  }

  /**
   * Handle validation error
   * @private
   */
  async handleValidationError(error, context, payloadDecodeResult, token, duration) {
    const errorContext = this.createErrorContext(context, payloadDecodeResult, error, token);
    errorContext.performanceMeta = { validationDuration: duration };

    const appwriteAnalysis = NetworkUtils.analyzeAppwriteError(error);
    const isNetworkError = NetworkUtils.isRetryableNetworkError(error);

    errorContext.errorClassification = {
      isNetworkError,
      isAppwriteError: appwriteAnalysis.isAppwriteError,
      isAuthError: appwriteAnalysis.httpStatus === 401,
      isPermissionError: appwriteAnalysis.httpStatus === 403,
      errorCategory: this.categorizeError(error)
    };

    await this.trackError(error, errorContext);

    if (process.env.NODE_ENV !== 'production') {
      this.log('JWT Validation Failed - Debug Info:', {
        errorCategory: errorContext.errorClassification.errorCategory,
        appwriteAnalysis,
        duration
      });
    }
  }

  /**
   * Categorize validation error
   * @private
   */
  categorizeError(error) {
    if (error.message.includes('Authorization header')) {
      return ERROR_CATEGORIES.TOKEN_FORMAT;
    }
    if (error.message.includes('JWT token format is invalid')) {
      return ERROR_CATEGORIES.TOKEN_FORMAT;
    }
    if (error.message.includes('JWT validation failed')) {
      return ERROR_CATEGORIES.AUTH;
    }
    if (error.message.includes('could not be cleaned')) {
      return ERROR_CATEGORIES.TOKEN_CLEANING;
    }
    return ERROR_CATEGORIES.UNKNOWN;
  }

  /**
   * Perform health check
   * @private
   */
  async performHealthCheck(jwtToken, requestId) {
    if (!this.analyzer) return;

    const healthReport = await this.analyzer.checkHealth(jwtToken);
    
    if (healthReport.overallScore < 70) {
      this.log(`[${requestId}] JWT Health Issues (Score: ${healthReport.overallScore}/100):`, healthReport);
    }
    
    await this.trackBusinessEvent(TRACKING_EVENTS.JWT_HEALTH_CHECK, {
      health_score: healthReport.overallScore,
      checks_performed: healthReport.metadata.totalChecks,
      warnings_count: healthReport.warnings.length,
      errors_count: healthReport.errors.length,
      is_valid: healthReport.isValid
    }, requestId);
  }

  /**
   * Perform debug analysis
   * @private
   */
  async performDebugAnalysis(headers, requestId, error, context) {
    if (!this.analyzer) return;

    this.log(`[${requestId}] Running detailed JWT debug analysis...`);
    const debugReport = await this.analyzer.debugJWTIssue(headers, requestId, this.extractor);
    this.log(`[${requestId}] JWT Debug Report:`, debugReport);

    await this.trackError(error, {
      ...context,
      debugReport,
      additionalData: {
        ...context.additionalData,
        debugAnalysisPerformed: true
      }
    });
  }

  // Tracking helpers

  async trackSuccess(result, cleanedToken, originalToken, payloadDecodeResult, duration) {
    if (!this.postHog) return;

    await this.postHog.trackBusinessEvent(TRACKING_EVENTS.USER_AUTHENTICATED, {
      user_id: result.userId,
      authentication_method: 'jwt',
      validation_duration_ms: duration,
      token_length: cleanedToken.length,
      token_was_cleaned: cleanedToken !== originalToken,
      payload_decode_success: payloadDecodeResult?.success || false
    }, result.userId);
  }

  async trackError(error, context) {
    if (!this.postHog) return;
    await this.postHog.trackError(error, context);
  }

  async trackBusinessEvent(eventName, data, userId) {
    if (!this.postHog) return;
    await this.postHog.trackBusinessEvent(eventName, data, userId);
  }
}

export default JWTValidator;