import { Client, Databases, Account, Query, Permission, Role } from 'node-appwrite';
import PostHogService from './utils/posthog/PostHogService.js';

class AppwriteService {
  constructor(logger, postHogConfig = {}) {
    // Singleton kontrolü - zaten bir instance varsa onu döndür
    if (AppwriteService.instance) {
      return AppwriteService.instance;
    }

    this.log = logger || console.log;
    this.postHog = new PostHogService(postHogConfig);

    // Client cache - key: auth token, value: { client, lastUsed, databases, account }
    this.clientCache = new Map();
    this.maxCacheSize = 50; // Maksimum cache boyutu
    this.cacheTimeout = 30 * 60 * 1000; // 30 dakika (milisaniye)

    // Admin client singleton
    this.adminClient = null;
    this.adminDatabases = null;

    // Network & Retry Configuration
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // 1 saniye
      maxDelay: 10000, // 10 saniye
      backoffMultiplier: 2,
      retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED']
    };

    // Connection health tracking
    this.connectionHealth = {
      lastSuccessful: null,
      failureCount: 0,
      lastFailure: null,
      endpoint: process.env.APPWRITE_END_POINT
    };

    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // 10 dakikada bir

    AppwriteService.instance = this;
    this.log('AppwriteService singleton instance created');
  }

  static getInstance(logger, postHogConfig = {}) {
    if (!AppwriteService.instance) {
      AppwriteService.instance = new AppwriteService(logger, postHogConfig);
    }
    return AppwriteService.instance;
  }

  // Instance'ı reset etmek için (test ortamları için yararlı)
  static resetInstance() {
    if (AppwriteService.instance) {
      AppwriteService.instance.shutdown();
      AppwriteService.instance = null;
    }
  }

  // ======================
  // Network Retry Logic
  // ======================
   async executeWithRetry(operation, context = {}, customRetryConfig = {}) {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError = null;
    let attempt = 0;

    const operationContext = {
      ...context,
      retryAttempt: 0,
      maxRetries: config.maxRetries
    };

    while (attempt <= config.maxRetries) {
      try {
        operationContext.retryAttempt = attempt;

        if (attempt > 0) {
          this.log(`[RETRY ${attempt}/${config.maxRetries}] Retrying ${context.methodName || 'operation'}...`);
        }

        const result = await operation();

        // Başarılı operation - connection health güncelle
        this.connectionHealth.lastSuccessful = Date.now();
        this.connectionHealth.failureCount = 0;

        if (attempt > 0) {
          // Retry başarılı oldu
          await this.postHog.trackBusinessEvent('network_retry_success', {
            method_name: context.methodName,
            attempt_number: attempt,
            total_attempts: attempt + 1,
            endpoint: this.connectionHealth.endpoint
          }, context.userId || 'system');
        }

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Network error analizi
        const isNetworkError = this.isRetryableNetworkError(error);
        const errorDetails = this.analyzeNetworkError(error);

        // Connection health güncelle
        this.connectionHealth.lastFailure = Date.now();
        this.connectionHealth.failureCount++;

        this.log(`[NETWORK ERROR] Attempt ${attempt}/${config.maxRetries + 1}:`, {
          error: error.message,
          code: error.code,
          isRetryable: isNetworkError,
          ...errorDetails
        });

        // Son deneme mi?
        if (attempt > config.maxRetries) {
          // Final error tracking
          await this.postHog.trackError(error, {
            ...operationContext,
            networkAnalysis: errorDetails,
            connectionHealth: this.connectionHealth,
            finalAttempt: true,
            totalAttempts: attempt
          });

          throw new Error(`Operation failed after ${attempt} attempts: ${error.message} (${error.code || 'Unknown'})`);
        }

        // Retry yapılabilir mi?
        if (!isNetworkError) {
          // Non-retryable error (auth, validation vs.)
          await this.postHog.trackError(error, {
            ...operationContext,
            networkAnalysis: errorDetails,
            nonRetryable: true
          });
          throw error;
        }

        // Retry delay hesapla
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );

        this.log(`[RETRY DELAY] Waiting ${delay}ms before retry ${attempt}...`);
        await this.sleep(delay);
      }
    }
  }
  isRetryableNetworkError(error) {
    if (!error) return false;

    // Error code kontrolü
    if (error.code && this.retryConfig.retryableErrors.includes(error.code)) {
      return true;
    }

    // Error message kontrolü
    const retryableMessages = [
      'network socket disconnected',
      'socket disconnected',
      'connection reset',
      'connection refused',
      'timeout',
      'dns lookup failed',
      'fetch failed'
    ];

    const errorMessage = (error.message || '').toLowerCase();
    return retryableMessages.some(msg => errorMessage.includes(msg));
  }

  analyzeNetworkError(error) {
    return {
      errorCode: error.code || null,
      errorMessage: error.message || null,
      errorType: error.name || null,
      isNetworkError: this.isRetryableNetworkError(error),
      endpoint: error.hostname || this.connectionHealth.endpoint,
      port: error.port || 443,
      timestamp: new Date().toISOString(),
      connectionHealthSnapshot: { ...this.connectionHealth }
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  // ======================
  // Client Pool/Cache Management
  // ======================

  createClient(auth) {
    const context = { methodName: 'createClient' };

    try {
      if (!auth) {
        throw new Error('Authentication is required (JWT token or API key)');
      }

      // Cache'den kontrol et
      const cached = this.clientCache.get(auth);
      if (cached && (Date.now() - cached.lastUsed < this.cacheTimeout)) {
        cached.lastUsed = Date.now();
        return cached.client;
      }

      // Yeni client oluştur
      const client = new Client()
        .setEndpoint(process.env.APPWRITE_END_POINT)
        .setProject(process.env.APPWRITE_PROJECT_ID);

      if (this.isJWTToken(auth)) {
        client.setJWT(auth);
      } else {
        client.setKey(auth);
      }

      // Cache'e ekle
      this.addToCache(auth, client);

      return client;
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }


  addToCache(auth, client) {
    // Cache boyutu kontrolü
    if (this.clientCache.size >= this.maxCacheSize) {
      this.evictOldestCache();
    }

    this.clientCache.set(auth, {
      client,
      databases: new Databases(client),
      account: new Account(client),
      lastUsed: Date.now()
    });
  }

  evictOldestCache() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, value] of this.clientCache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.clientCache.delete(oldestKey);
    }
  }

  cleanupCache() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, value] of this.clientCache.entries()) {
      if (now - value.lastUsed > this.cacheTimeout) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.clientCache.delete(key));

    if (keysToDelete.length > 0) {
      this.log(`Cleaned up ${keysToDelete.length} expired client connections`);
    }
  }

  isJWTToken(auth) {
    return auth.split('.').length === 3;
  }

  getDatabases(auth) {
    const cached = this.clientCache.get(auth);
    if (cached && (Date.now() - cached.lastUsed < this.cacheTimeout)) {
      cached.lastUsed = Date.now();
      return cached.databases;
    }

    // Cache miss - yeni client oluştur ve databases döndür
    const client = this.createClient(auth);
    return this.clientCache.get(auth).databases;
  }

  getAccount(auth) {
    const cached = this.clientCache.get(auth);
    if (cached && (Date.now() - cached.lastUsed < this.cacheTimeout)) {
      cached.lastUsed = Date.now();
      return cached.account;
    }

    // Cache miss - yeni client oluştur ve account döndür
    const client = this.createClient(auth);
    return this.clientCache.get(auth).account;
  }

  getAdminDatabases() {
    const context = { methodName: 'getAdminDatabases' };

    try {
      if (!process.env.APPWRITE_DEV_KEY) {
        throw new Error('APPWRITE_DEV_KEY is not configured');
      }

      // Admin client singleton pattern
      if (!this.adminClient) {
        this.adminClient = this.createClient(process.env.APPWRITE_DEV_KEY);
        this.adminDatabases = new Databases(this.adminClient);
      }

      return this.adminDatabases;
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // Cache Statistics & JWT Monitoring
  // ======================
  getCacheStats() {
    return {
      size: this.clientCache.size,
      maxSize: this.maxCacheSize,
      entries: Array.from(this.clientCache.entries()).map(([key, value]) => ({
        keyType: this.isJWTToken(key) ? 'JWT' : 'API_KEY',
        keySnippet: key.slice(0, 12) + '...' + key.slice(-4),
        lastUsed: new Date(value.lastUsed).toISOString(),
        ageMinutes: Math.round((Date.now() - value.lastUsed) / 60000)
      }))
    };
  }


  async getJWTDiagnostics(jwtToken) {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        endpoint: process.env.APPWRITE_END_POINT,
        projectId: process.env.APPWRITE_PROJECT_ID,
        nodeEnv: process.env.NODE_ENV
      },
      cache: {
        isCached: this.clientCache.has(jwtToken),
        cacheSize: this.clientCache.size
      },
      healthCheck: null,
      lastError: null
    };

    // Health check
    try {
      diagnostics.healthCheck = await this.checkJWTHealth(jwtToken);
    } catch (error) {
      diagnostics.lastError = {
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }

    return diagnostics;
  }

  // ======================
  // JWT Validation with Enhanced Debugging
  // ======================
  // ======================
  // JWT Validation with Enhanced Debugging & Retry
  // ======================
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

    return this.executeWithRetry(async () => {
      try {
        // İlk kontrol: Token varlığı
        if (!jwtToken) {
          const err = new Error('JWT token is missing');
          await this.postHog.trackError(err, context);
          throw err;
        }

        // JWT format kontrolü (daha detaylı)
        const tokenParts = jwtToken.split('.');
        if (tokenParts.length !== 3) {
          const formatError = new Error(`JWT token format is invalid (${tokenParts.length} parts instead of 3)`);

          // Çok detaylı format analizi
          const formatAnalysis = {
            tokenLength: jwtToken.length,
            partsCount: tokenParts.length,
            tokenSnippet: jwtToken.slice(0, 100) + (jwtToken.length > 100 ? '...' : ''),
            parts: tokenParts.map((part, index) => ({
              index,
              length: part.length,
              snippet: part.slice(0, 30) + (part.length > 30 ? '...' : ''),
              isEmpty: part === '',
              isWhitespace: part.trim() === '',
              hasInvalidChars: !/^[A-Za-z0-9+/=_-]*$/.test(part)
            })),
            possibleCauses: []
          };

          // Muhtemel sebepler
          if (tokenParts.length === 1) {
            formatAnalysis.possibleCauses.push('No dots found - not a JWT format');
            formatAnalysis.possibleCauses.push('Might be a simple API key or session token');
          } else if (tokenParts.length === 2) {
            formatAnalysis.possibleCauses.push('Missing signature part');
            formatAnalysis.possibleCauses.push('Token might be truncated');
          } else if (tokenParts.length > 3) {
            formatAnalysis.possibleCauses.push('Extra dots in token');
            formatAnalysis.possibleCauses.push('Token might be corrupted or double-encoded');
            formatAnalysis.possibleCauses.push('Multiple tokens concatenated');
          }

          // String analizi
          const dotCount = (jwtToken.match(/\./g) || []).length;
          const spaceCount = (jwtToken.match(/ /g) || []).length;
          const newlineCount = (jwtToken.match(/\n/g) || []).length;

          if (spaceCount > 0) {
            formatAnalysis.possibleCauses.push(`Token contains ${spaceCount} space(s) - might be corrupted`);
          }
          if (newlineCount > 0) {
            formatAnalysis.possibleCauses.push(`Token contains ${newlineCount} newline(s) - might be corrupted`);
          }

          await this.postHog.trackError(formatError, {
            ...context,
            formatAnalysis,
            additionalData: {
              ...context.additionalData,
              formatError: 'Invalid JWT structure - detailed analysis',
              dotCount,
              spaceCount,
              newlineCount
            }
          });

          if (process.env.NODE_ENV !== 'production') {
            this.log('JWT Format Error - Full Analysis:', formatAnalysis);
          }

          throw formatError;
        }

        // JWT payload decode (debug için)
        let decodedPayload = null;
        try {
          const payload = tokenParts[1];
          decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());
        } catch (decodeError) {
          this.log(`Warning: Could not decode JWT payload for debugging: ${decodeError.message}`);
        }

        // Actual Appwrite validation
        const account = this.getAccount(jwtToken);
        const user = await account.get();

        const result = {
          ...user,
          userId: user.$id,
        };

        const duration = Date.now() - startTime;

        await this.postHog.trackBusinessEvent('user_authenticated', {
          user_id: result.userId,
          authentication_method: 'jwt',
          validation_duration_ms: duration,
          token_length: jwtToken.length
        }, result.userId);

        this.log(`JWT validation successful for user ${result.userId} (${duration}ms)`);

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;

        // Network error analizi
        const isNetworkError = this.isRetryableNetworkError(error);
        const networkAnalysis = this.analyzeNetworkError(error);

        // Katman 1
        const appwriteMeta = {
          appwriteCode: error.code || null,
          appwriteType: error.type || null,
          appwriteMessage: error.message || null,
          appwriteResponse: error.response || null,
          httpStatus: error.response?.status || null
        };

        // Katman 2
        const requestMeta = {
          endpoint: process.env.APPWRITE_END_POINT,
          projectId: process.env.APPWRITE_PROJECT_ID,
          method: 'account.get',
          tokenSnippet: jwtToken.slice(0, 12) + '...' + jwtToken.slice(-4),
          tokenLength: jwtToken.length,
          tokenParts: jwtToken.split('.').length,
          validationDuration: duration
        };

        // Katman 3
        const jwtMeta = (typeof decodedPayload === 'object' && decodedPayload !== null) ? {
          jwtIssuer: decodedPayload.iss || null,
          jwtAudience: decodedPayload.aud || null,
          jwtExpiration: decodedPayload.exp ? new Date(decodedPayload.exp * 1000).toISOString() : null,
          jwtIssuedAt: decodedPayload.iat ? new Date(decodedPayload.iat * 1000).toISOString() : null,
          jwtUserId: decodedPayload.userId || decodedPayload.sub || null,
          jwtSessionId: decodedPayload.sessionId || null,
          isExpired: decodedPayload.exp ? Date.now() > (decodedPayload.exp * 1000) : null
        } : { jwtDecodeError: 'Could not decode JWT payload' };

        // Katman 4
        let probableCause = 'Unknown';
        let debugSuggestions = [];

        if (isNetworkError) {
          probableCause = 'Network Connection Error';
          debugSuggestions.push('TLS connection failed to Appwrite endpoint');
          debugSuggestions.push('Check network connectivity and endpoint availability');
          debugSuggestions.push('Verify firewall/proxy settings');
          if (error.code === 'ECONNRESET') {
            debugSuggestions.push('Connection was reset - server might be overloaded');
          }
        } else if (error.code === 401) {
          if (error.message?.toLowerCase().includes('jwt')) {
            if (jwtMeta.isExpired === true) {
              probableCause = 'JWT Expired';
              debugSuggestions.push('Token has expired, user needs to re-authenticate');
            } else if (error.message.toLowerCase().includes('invalid')) {
              probableCause = 'JWT Invalid Signature or Format';
              debugSuggestions.push('Check if JWT was signed with correct secret');
              debugSuggestions.push('Verify JWT issuer matches Appwrite project');
            } else {
              probableCause = 'JWT Authentication Failed';
              debugSuggestions.push('Token may be revoked or invalid for this project');
              debugSuggestions.push('Check if user session is still active in Appwrite');
            }
          } else if (error.message?.toLowerCase().includes('session')) {
            probableCause = 'Session Invalid or Expired';
            debugSuggestions.push('User session may have been terminated');
          } else {
            probableCause = 'Authentication Failed';
            debugSuggestions.push('General authentication error');
          }
        } else if (error.code >= 500) {
          probableCause = 'Appwrite Server Error';
          debugSuggestions.push('Check Appwrite service status');
          debugSuggestions.push('Retry the request after a short delay');
        } else if (error.code === 429) {
          probableCause = 'Rate Limit Exceeded';
          debugSuggestions.push('Too many requests, implement backoff strategy');
        } else if (error.message?.toLowerCase().includes('fetch failed')) {
          probableCause = 'Fetch Operation Failed';
          debugSuggestions.push('Underlying HTTP request failed');
          debugSuggestions.push('Check network connectivity and DNS resolution');
        }

        // Katman 5
        const cacheMeta = {
          isCachedClient: this.clientCache.has(jwtToken),
          cacheSize: this.clientCache.size,
          cacheHitInfo: this.clientCache.has(jwtToken)
            ? `Last used: ${new Date(this.clientCache.get(jwtToken).lastUsed).toISOString()}`
            : 'No cache entry'
        };

        const enhancedContext = {
          ...context,
          appwriteMeta,
          requestMeta,
          jwtMeta,
          cacheMeta,
          networkAnalysis,
          probableCause,
          debugSuggestions,
          additionalData: {
            ...context.additionalData,
            errorAnalysis: 'Enhanced JWT validation debugging with network analysis',
            isNetworkError,
            retryAttempted: context.retryAttempt > 0
          }
        };

        await this.postHog.trackError(error, enhancedContext);

        if (process.env.NODE_ENV !== 'production') {
          this.log('JWT Validation Failed - Debug Info:', {
            probableCause,
            debugSuggestions,
            appwriteError: appwriteMeta,
            jwtInfo: jwtMeta,
            requestInfo: requestMeta,
            networkInfo: networkAnalysis
          });
        }

        const errorMessage = [
          `JWT validation failed: ${probableCause}`,
          `Code: ${error.code || 'N/A'}`,
          `Duration: ${duration}ms`,
          context.retryAttempt ? `(After ${context.retryAttempt} retries)` : null,
          debugSuggestions.length > 0 ? `Suggestion: ${debugSuggestions[0]}` : null
        ].filter(Boolean).join(' | ');

        throw new Error(errorMessage);
      }
    }, context, {
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 3000
    });
  }

  // ======================
  // JWT Health Check (Proactive Debugging)
  // ======================
  // ======================
  // JWT Health Check (Proactive Debugging)
  // ======================
  // ======================
  // JWT Health Check (Proactive Debugging)
  // ======================
  async checkJWTHealth(jwtToken) {
    const healthReport = {
      isValid: false,
      checks: {},
      warnings: [],
      errors: [],
      recommendations: []
    };

    try {
      // Temel kontroller
      healthReport.checks.tokenExists = !!jwtToken;
      if (!jwtToken) {
        healthReport.errors.push('JWT token is missing');
        return healthReport;
      }

      // Format kontrolü
      const parts = jwtToken.split('.');
      healthReport.checks.hasThreeParts = parts.length === 3;
      if (parts.length !== 3) {
        healthReport.errors.push(`JWT has ${parts.length} parts instead of 3`);
        return healthReport;
      }

      // Payload decode
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        healthReport.checks.payloadDecodable = true;

        // Expiration check
        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          const now = new Date();
          const timeUntilExp = expDate.getTime() - now.getTime();

          healthReport.checks.isExpired = timeUntilExp <= 0;
          healthReport.checks.expirationTime = expDate.toISOString();
          healthReport.checks.timeUntilExpirationMs = timeUntilExp;

          if (timeUntilExp <= 0) {
            healthReport.errors.push(`JWT expired at ${expDate.toISOString()}`);
          } else if (timeUntilExp < 5 * 60 * 1000) { // 5 dakikadan az kaldıysa
            healthReport.warnings.push(`JWT expires soon (${Math.round(timeUntilExp / 60000)} minutes)`);
            healthReport.recommendations.push('Consider refreshing the token');
          }
        } else {
          healthReport.warnings.push('JWT has no expiration claim');
        }

        // Project/Audience check
        if (payload.aud && payload.aud !== process.env.APPWRITE_PROJECT_ID) {
          healthReport.warnings.push(`JWT audience (${payload.aud}) doesn't match project ID`);
        }

        // User ID check
        healthReport.checks.hasUserId = !!(payload.userId || payload.sub);
        if (!payload.userId && !payload.sub) {
          healthReport.warnings.push('JWT has no user identifier');
        }

      } catch (decodeError) {
        healthReport.checks.payloadDecodable = false;
        healthReport.errors.push(`Cannot decode JWT payload: ${decodeError.message}`);
        return healthReport;
      }

      // Appwrite connection check
      try {
        await this.validateJWT(jwtToken);
        healthReport.checks.appwriteValidation = true;
        healthReport.isValid = true;
      } catch (validationError) {
        healthReport.checks.appwriteValidation = false;
        healthReport.errors.push(`Appwrite validation failed: ${validationError.message}`);
      }

    } catch (error) {
      healthReport.errors.push(`Health check failed: ${error.message}`);
    }

    return healthReport;
  }

  async validateAndExtractUser(headers, requestId) {
    const context = {
      methodName: 'validateAndExtractUser',
      requestId,
      additionalData: { hasHeaders: !!headers }
    };

    return this.postHog.withTracking('validateAndExtractUser', async () => {
      try {
        const jwtToken = extractJWTFromHeaders(headers);

        // JWT health check (sadece debug modunda)
        if (process.env.NODE_ENV !== 'production' && process.env.JWT_DEBUG_MODE === 'true') {
          const healthReport = await this.checkJWTHealth(jwtToken);
          if (!healthReport.isValid) {
            this.log(`[${requestId}] JWT Health Issues:`, healthReport);
          }
        }

        const userInfo = await this.validateJWT(jwtToken);

        if (!userInfo.userId) {
          throw new Error('Failed to extract user info from JWT');
        }

        this.log(`[${requestId}] JWT validation successful for user: ${userInfo.userId}`);
        return { jwtToken, userInfo };

      } catch (error) {
        // Header extraction hatası mı yoksa JWT validation hatası mı?
        const isHeaderError = error.message.includes('Authorization header');
        const isJWTFormatError = error.message.includes('JWT token format is invalid');
        const isJWTValidationError = error.message.includes('JWT validation failed');

        // JWT format hatası durumunda detaylı debug yap
        if (isJWTFormatError && process.env.JWT_DEBUG_MODE === 'true') {
          this.log(`[${requestId}] Running detailed JWT debug analysis...`);
          const debugReport = await this.debugJWTIssue(headers, requestId);
          this.log(`[${requestId}] JWT Debug Report:`, debugReport);

          // PostHog'a debug report'u da gönder
          await this.postHog.trackError(error, {
            ...context,
            debugReport,
            additionalData: {
              ...context.additionalData,
              errorType: 'jwt_format_error',
              debugAnalysisPerformed: true
            }
          });
        } else {
          await this.postHog.trackError(error, {
            ...context,
            additionalData: {
              ...context.additionalData,
              errorType: isHeaderError ? 'header_extraction' :
                isJWTFormatError ? 'jwt_format' :
                  isJWTValidationError ? 'jwt_validation' : 'unknown',
              isHeaderError,
              isJWTFormatError,
              isJWTValidationError
            }
          });
        }

        throw error;
      }
    }, { ...context, userId: requestId });
  }

  // ======================
  // JWT Problem Solver & Emergency Handler
  // ======================
  async debugJWTIssue(headers, requestId = 'debug') {
    const debugReport = {
      timestamp: new Date().toISOString(),
      requestId,
      step: 'start',
      issue: null,
      analysis: {},
      recommendations: []
    };

    try {
      // Step 1: Header Analysis
      debugReport.step = 'header_analysis';
      debugReport.analysis.headers = {
        hasAuthorization: !!(headers.authorization || headers.Authorization),
        authHeaderValue: headers.authorization || headers.Authorization || 'MISSING',
        allHeaders: Object.keys(headers),
        headerCount: Object.keys(headers).length
      };

      if (!headers.authorization && !headers.Authorization) {
        debugReport.issue = 'missing_auth_header';
        debugReport.recommendations.push('Add Authorization header with Bearer token');
        return debugReport;
      }

      // Step 2: Token Extraction
      debugReport.step = 'token_extraction';
      let extractedToken;
      try {
        extractedToken = extractJWTFromHeaders(headers);
        debugReport.analysis.extraction = { success: true, tokenLength: extractedToken.length };
      } catch (extractionError) {
        debugReport.issue = 'token_extraction_failed';
        debugReport.analysis.extraction = {
          success: false,
          error: extractionError.message
        };
        debugReport.recommendations.push('Check Authorization header format: Bearer <jwt_token>');
        return debugReport;
      }

      // Step 3: Token Format Analysis
      debugReport.step = 'token_format_analysis';
      const parts = extractedToken.split('.');
      debugReport.analysis.format = {
        partsCount: parts.length,
        isValidJWTFormat: parts.length === 3,
        parts: parts.map((part, i) => ({
          index: i,
          length: part.length,
          isEmpty: part === '',
          preview: part.slice(0, 20) + '...'
        }))
      };

      if (parts.length !== 3) {
        debugReport.issue = 'invalid_jwt_format';
        debugReport.recommendations.push(`JWT should have 3 parts separated by dots, found ${parts.length}`);

        if (parts.length === 1) {
          debugReport.recommendations.push('Token appears to be a simple string, not a JWT');
        } else if (parts.length === 2) {
          debugReport.recommendations.push('JWT is missing signature part');
        } else {
          debugReport.recommendations.push('JWT has too many parts, might be corrupted');
        }
        return debugReport;
      }

      // Step 4: JWT Health Check
      debugReport.step = 'jwt_health_check';
      try {
        const healthReport = await this.checkJWTHealth(extractedToken);
        debugReport.analysis.health = healthReport;

        if (!healthReport.isValid) {
          debugReport.issue = 'jwt_health_failed';
          debugReport.recommendations.push(...healthReport.recommendations);
        }
      } catch (healthError) {
        debugReport.analysis.health = { error: healthError.message };
      }

      // Step 5: Appwrite Validation
      debugReport.step = 'appwrite_validation';
      try {
        const validationResult = await this.validateJWT(extractedToken);
        debugReport.analysis.validation = {
          success: true,
          userId: validationResult.userId
        };
        debugReport.issue = null; // No issue if we reach here
      } catch (validationError) {
        debugReport.issue = 'appwrite_validation_failed';
        debugReport.analysis.validation = {
          success: false,
          error: validationError.message
        };
        debugReport.recommendations.push('JWT is structurally valid but rejected by Appwrite');
        debugReport.recommendations.push('Check if token is expired or revoked');
      }

      return debugReport;

    } catch (error) {
      debugReport.issue = 'debug_process_failed';
      debugReport.analysis.fatalError = error.message;
      debugReport.recommendations.push('Contact system administrator');
      return debugReport;
    }
  }

  // ======================
  // Permission Builder
  // ======================
  buildPermissions(ownerId, additionalUsers = []) {
    const context = {
      methodName: 'buildPermissions',
      userId: ownerId,
      additionalData: {
        additionalUsersCount: additionalUsers.length,
        ownerProvided: !!ownerId
      }
    };

    try {
      const permissions = [
        Permission.read(Role.user(ownerId)),
        Permission.update(Role.user(ownerId)),
        Permission.delete(Role.user(ownerId)),
        Permission.write(Role.user(ownerId)),
      ];

      additionalUsers.forEach(({ userId, permissions: perms = ['read'] }) => {
        perms.forEach(perm => {
          if (Permission[perm]) {
            permissions.push(Permission[perm](Role.user(userId)));
          } else {
            console.warn(`Unknown permission: ${perm}`);
            // Bilinmeyen permission tracking
            this.postHog.trackError(new Error(`Unknown permission: ${perm}`), {
              ...context,
              additionalData: { unknownPermission: perm }
            });
          }
        });
      });

      return permissions;
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // Admin Privilege Check
  // ======================
  requireSystemUser(userInfo) {
    const context = {
      methodName: 'requireSystemUser',
      userId: userInfo?.userId,
      additionalData: { isSystemUser: userInfo?.isSystemUser }
    };

    try {
      if (!userInfo.isSystemUser) {
        throw new Error('Unauthorized: Admin privileges required');
      }
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // User-Level Actions (Enhanced with Retry)
  // ======================
  async listDocuments(jwtToken, collectionId, queries = []) {
    const context = {
      methodName: 'listDocuments',
      collectionId,
      additionalData: { queriesCount: queries.length }
    };

    return this.postHog.withTracking('listDocuments', async () => {
      return this.executeWithRetry(async () => {
        //const userInfo = await this.validateJWT(jwtToken);
        const result = await this.getDatabases(jwtToken).listDocuments(
          process.env.APPWRITE_DB_ID,
          collectionId,
          queries
        );

        // Business event tracking
        // await this.postHog.trackBusinessEvent('documents_listed', {
        //   collection_id: collectionId,
        //   documents_count: result.documents.length,
        //   total_count: result.total
        // }, userInfo.userId);
        await this.postHog.trackBusinessEvent('documents_listed', {
          collection_id: collectionId,
          documents_count: result.documents.length,
          total_count: result.total
        });

        return result;
      }, context);
    }, { ...context, userId: jwtToken });
  }

  async getDocument(jwtToken, collectionId, documentId) {
    const context = {
      methodName: 'getDocument',
      collectionId,
      documentId
    };

    return this.postHog.withTracking('getDocument', async () => {
      return this.executeWithRetry(async () => {
        const userInfo = await this.validateJWT(jwtToken);
        const result = await this.getDatabases(jwtToken).getDocument(
          process.env.APPWRITE_DB_ID,
          collectionId,
          documentId
        );

        await this.postHog.trackBusinessEvent('document_retrieved', {
          collection_id: collectionId,
          document_id: documentId
        }, userInfo.userId);

        return result;
      }, context);
    }, { ...context, userId: jwtToken });
  }

  async updateDocument(jwtToken, collectionId, documentId, data) {
    const context = {
      methodName: 'updateDocument',
      collectionId,
      documentId,
      additionalData: { hasData: !!data, dataKeys: Object.keys(data || {}) }
    };

    return this.postHog.withTracking('updateDocument', async () => {
      return this.executeWithRetry(async () => {
        const userInfo = await this.validateJWT(jwtToken);
        const result = await this.getDatabases(jwtToken).updateDocument(
          process.env.APPWRITE_DB_ID,
          collectionId,
          documentId,
          data
        );

        await this.postHog.trackBusinessEvent('document_updated', {
          collection_id: collectionId,
          document_id: documentId,
          fields_updated: Object.keys(data || {}).length
        }, userInfo.userId);

        return result;
      }, context);
    }, { ...context, userId: jwtToken });
  }

  async deleteDocument(jwtToken, collectionId, documentId) {
    const context = {
      methodName: 'deleteDocument',
      collectionId,
      documentId
    };

    return this.postHog.withTracking('deleteDocument', async () => {
      return this.executeWithRetry(async () => {
        const userInfo = await this.validateJWT(jwtToken);
        const result = await this.getDatabases(jwtToken).deleteDocument(
          process.env.APPWRITE_DB_ID,
          collectionId,
          documentId
        );

        await this.postHog.trackBusinessEvent('document_deleted', {
          collection_id: collectionId,
          document_id: documentId
        }, userInfo.userId);

        return result;
      }, context);
    }, { ...context, userId: jwtToken });
  }

  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    const context = {
      methodName: 'deleteUserDocuments',
      collectionId,
      additionalData: { additionalQueriesCount: additionalQueries.length }
    };

    return this.postHog.withTracking('deleteUserDocuments', async () => {
      return this.executeWithRetry(async () => {
        const { userId } = await this.validateJWT(jwtToken);

        const queries = [Query.equal('userId', userId), ...additionalQueries];
        const result = await this.getDatabases(jwtToken).listDocuments(
          process.env.APPWRITE_DB_ID,
          collectionId,
          queries
        );

        const deletedIds = [];
        for (const doc of result.documents) {
          try {
            await this.executeWithRetry(async () => {
              await this.getDatabases(jwtToken).deleteDocument(
                process.env.APPWRITE_DB_ID,
                collectionId,
                doc.$id
              );
            }, { methodName: 'deleteUserDocuments_individual', documentId: doc.$id });

            deletedIds.push(doc.$id);
          } catch (err) {
            console.warn(`Failed to delete document ${doc.$id}: ${err.message}`);
            await this.postHog.trackError(err, {
              methodName: 'deleteUserDocuments_individual',
              collectionId,
              documentId: doc.$id,
              userId
            });
          }
        }

        const deletionResult = {
          deletedCount: deletedIds.length,
          totalFound: result.documents.length,
          deletedIds
        };

        await this.postHog.trackBusinessEvent('user_documents_bulk_deleted', {
          collection_id: collectionId,
          documents_found: result.documents.length,
          documents_deleted: deletedIds.length,
          deletion_success_rate: (deletedIds.length / result.documents.length) * 100
        }, userId);

        return deletionResult;
      }, context);
    }, { ...context, userId: jwtToken });
  }

  // ======================
  // Admin-Level Actions
  // ======================
  // ======================
  // Admin-Level Actions (Enhanced with Retry)
  // ======================
  async createDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    const context = {
      methodName: 'createDocumentWithAdminPrivileges',
      collectionId,
      documentId,
      userId: requestingUserId,
      additionalData: {
        hasData: !!data,
        additionalUsersCount: additionalUsers.length,
        dataKeys: Object.keys(data || {})
      }
    };

    return this.postHog.withTracking('createDocumentWithAdminPrivileges', async () => {
      return this.executeWithRetry(async () => {
        const userInfo = await this.validateJWT(jwtToken);
        // this.requireSystemUser(userInfo);

        const permissions = this.buildPermissions(requestingUserId, additionalUsers);
        this.log(`[ADMIN ACTION] ${userInfo.userId} creating document in ${collectionId} with permissions:`, permissions);

        const result = await this.getAdminDatabases().createDocument(
          process.env.APPWRITE_DB_ID,
          collectionId,
          documentId,
          data,
          permissions
        );

        await this.postHog.trackBusinessEvent('admin_document_created', {
          collection_id: collectionId,
          document_id: documentId,
          requesting_user_id: requestingUserId,
          admin_user_id: userInfo.userId,
          additional_users_count: additionalUsers.length
        }, userInfo.userId);

        return result;
      }, context);
    }, context);
  }

  async updateDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    const context = {
      methodName: 'updateDocumentWithAdminPrivileges',
      collectionId,
      documentId,
      userId: requestingUserId,
      additionalData: {
        hasData: !!data,
        additionalUsersCount: additionalUsers.length,
        dataKeys: Object.keys(data || {})
      }
    };

    return this.postHog.withTracking('updateDocumentWithAdminPrivileges', async () => {
      return this.executeWithRetry(async () => {
        const userInfo = await this.validateJWT(jwtToken);
        //  this.requireSystemUser(userInfo);

        const permissions = this.buildPermissions(requestingUserId, additionalUsers);
        this.log(`[ADMIN ACTION] ${userInfo.userId} updating document ${documentId} in ${collectionId}`);

        const result = await this.getAdminDatabases().updateDocument(
          process.env.APPWRITE_DB_ID,
          collectionId,
          documentId,
          data,
          permissions
        );

        await this.postHog.trackBusinessEvent('admin_document_updated', {
          collection_id: collectionId,
          document_id: documentId,
          requesting_user_id: requestingUserId,
          admin_user_id: userInfo.userId,
          additional_users_count: additionalUsers.length,
          fields_updated: Object.keys(data || {}).length
        }, userInfo.userId);

        return result;
      }, context);
    }, context);
  }

  async deleteDocumentWithAdminPrivileges(jwtToken, collectionId, documentId) {
    const context = {
      methodName: 'deleteDocumentWithAdminPrivileges',
      collectionId,
      documentId
    };

    return this.postHog.withTracking('deleteDocumentWithAdminPrivileges', async () => {
      return this.executeWithRetry(async () => {
        const userInfo = await this.validateJWT(jwtToken);
        // this.requireSystemUser(userInfo);

        this.log(`[ADMIN ACTION] ${userInfo.userId} deleting document ${documentId} in ${collectionId}`);

        const result = await this.getAdminDatabases().deleteDocument(
          process.env.APPWRITE_DB_ID,
          collectionId,
          documentId
        );

        await this.postHog.trackBusinessEvent('admin_document_deleted', {
          collection_id: collectionId,
          document_id: documentId,
          admin_user_id: userInfo.userId
        }, userInfo.userId);

        return result;
      }, context);
    }, { ...context, userId: userInfo.userId });
  }

  // Emergency JWT cleaner - corrupted token'ları temizlemeye çalışır
  cleanJWTToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    // Common issues'ları temizle
    let cleaned = rawToken
      .trim()                          // Whitespace'leri temizle
      .replace(/\s+/g, '')            // Tüm whitespace'leri kaldır
      .replace(/\n/g, '')             // Newline'ları kaldır
      .replace(/\r/g, '')             // Carriage return'leri kaldır
      .replace(/Bearer\s+/i, '');     // Bearer prefix'ini kaldır

    // Double encoding kontrolü
    if (cleaned.startsWith('Bearer%20')) {
      cleaned = decodeURIComponent(cleaned).replace('Bearer ', '');
    }

    return cleaned;
  }

  // ======================
  // Network Health Monitoring
  // ======================
  getNetworkHealth() {
    const now = Date.now();
    return {
      ...this.connectionHealth,
      timeSinceLastSuccess: this.connectionHealth.lastSuccessful ?
        now - this.connectionHealth.lastSuccessful : null,
      timeSinceLastFailure: this.connectionHealth.lastFailure ?
        now - this.connectionHealth.lastFailure : null,
      isHealthy: this.connectionHealth.failureCount < 5 &&
        (this.connectionHealth.lastSuccessful ?
          now - this.connectionHealth.lastSuccessful < 5 * 60 * 1000 : false)
    };
  }

  async testConnection() {
    try {
      if (!process.env.APPWRITE_DEV_KEY) {
        throw new Error('Cannot test connection: APPWRITE_DEV_KEY not configured');
      }

      const startTime = Date.now();
      const testClient = new Client()
        .setEndpoint(process.env.APPWRITE_END_POINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_DEV_KEY);

      const databases = new Databases(testClient);

      // Simple connection test
      await databases.list();

      const duration = Date.now() - startTime;

      this.connectionHealth.lastSuccessful = Date.now();
      this.connectionHealth.failureCount = 0;

      return {
        success: true,
        duration,
        endpoint: process.env.APPWRITE_END_POINT,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.connectionHealth.lastFailure = Date.now();
      this.connectionHealth.failureCount++;

      const networkAnalysis = this.analyzeNetworkError(error);

      await this.postHog.trackError(error, {
        methodName: 'testConnection',
        networkAnalysis,
        connectionHealth: this.connectionHealth
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        networkAnalysis,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ======================
  // Emergency & Debug Endpoints
  // ======================
  async emergencyJWTAnalysis(headers, requestId = 'emergency') {
    const fullReport = {
      timestamp: new Date().toISOString(),
      requestId,
      networkHealth: this.getNetworkHealth(),
      cacheStats: this.getCacheStats(),
      steps: [],
      finalResult: null
    };

    try {
      // Step 1: Connection test
      fullReport.steps.push({ step: 'connection_test', status: 'running' });
      const connectionTest = await this.testConnection();
      fullReport.steps[0].status = connectionTest.success ? 'success' : 'failed';
      fullReport.steps[0].result = connectionTest;

      // Step 2: Header analysis
      fullReport.steps.push({ step: 'header_analysis', status: 'running' });
      try {
        const token = extractJWTFromHeaders(headers);
        fullReport.steps[1].status = 'success';
        fullReport.steps[1].result = { tokenExtracted: true, tokenLength: token.length };

        // Step 3: JWT debug
        fullReport.steps.push({ step: 'jwt_debug', status: 'running' });
        const debugReport = await this.debugJWTIssue(headers, requestId);
        fullReport.steps[2].status = debugReport.isValid ? 'success' : 'failed';
        fullReport.steps[2].result = debugReport;

      } catch (headerError) {
        fullReport.steps[1].status = 'failed';
        fullReport.steps[1].result = { error: headerError.message };
      }

      fullReport.finalResult = 'analysis_completed';

    } catch (error) {
      fullReport.finalResult = `analysis_failed: ${error.message}`;
    }

    return fullReport;
  }


  // Circuit breaker pattern için
  isCircuitOpen() {
    const healthCheck = this.getNetworkHealth();

    // 5 consecutive failure varsa ve son 2 dakikada success yoksa circuit aç
    return healthCheck.failureCount >= 5 &&
      (!healthCheck.lastSuccessful ||
        Date.now() - healthCheck.lastSuccessful > 2 * 60 * 1000);
  }

  async executeWithCircuitBreaker(operation, context = {}) {
    if (this.isCircuitOpen()) {
      const error = new Error('Circuit breaker is open - too many network failures');
      await this.postHog.trackError(error, {
        ...context,
        circuitBreakerStatus: 'open',
        connectionHealth: this.connectionHealth
      });
      throw error;
    }

    return operation();
  }

  // ======================
  // Graceful Shutdown
  // ======================
  async shutdown() {
    try {
      // Cleanup interval'ı temizle
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Cache'i temizle
      this.clientCache.clear();

      // Admin client'i temizle
      this.adminClient = null;
      this.adminDatabases = null;

      await this.postHog.flush();
      await this.postHog.shutdown();

      this.log('AppwriteService shutdown completed');

      // Singleton instance'ı temizle
      AppwriteService.instance = null;
    } catch (error) {
      console.error('Error during AppwriteService shutdown:', error);
    }
  }

  // ======================
  // Static helpers
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
}

// ======================
// JWT Extract Helper
// ======================
export function extractJWTFromHeaders(headers) {
  const context = {
    methodName: 'extractJWTFromHeaders',
    timestamp: new Date().toISOString()
  };

  try {
    // Header existence check
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader) {
      const error = new Error('Authorization header is missing');
      console.error('JWT Extraction Error:', {
        error: error.message,
        availableHeaders: Object.keys(headers),
        context
      });
      throw error;
    }

    // Bearer format check
    if (!authHeader.startsWith('Bearer ')) {
      const error = new Error('Invalid authorization header format. Expected: Bearer <token>');
      console.error('JWT Extraction Error:', {
        error: error.message,
        headerValue: authHeader.slice(0, 20) + '...',
        headerLength: authHeader.length,
        context
      });
      throw error;
    }

    const token = authHeader.substring(7);

    // Token existence check
    if (!token || token.trim() === '') {
      const error = new Error('JWT token is empty after Bearer prefix');
      console.error('JWT Extraction Error:', {
        error: error.message,
        fullHeader: authHeader,
        tokenAfterExtraction: token,
        context
      });
      throw error;
    }

    // JWT format validation
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      const error = new Error(`JWT token format is invalid (${tokenParts.length} parts instead of 3)`);

      // Detaylı debug bilgisi
      const debugInfo = {
        error: error.message,
        tokenPartsCount: tokenParts.length,
        tokenLength: token.length,
        tokenSnippet: token.slice(0, 50) + '...',
        tokenParts: tokenParts.map((part, index) => ({
          partIndex: index,
          partLength: part.length,
          partSnippet: part.slice(0, 20) + (part.length > 20 ? '...' : ''),
          isEmpty: part.trim() === '',
          hasSpecialChars: /[^A-Za-z0-9+/=_-]/.test(part)
        })),
        fullHeaderAnalysis: {
          originalHeader: authHeader,
          headerLength: authHeader.length,
          startsWithBearer: authHeader.startsWith('Bearer '),
          bearerSpaceCount: (authHeader.match(/Bearer /g) || []).length
        },
        potentialIssues: []
      };

      // Potansiyel sorunları tespit et
      if (tokenParts.length === 1) {
        debugInfo.potentialIssues.push('Token has no dots - might be a simple string instead of JWT');
      } else if (tokenParts.length === 2) {
        debugInfo.potentialIssues.push('Token has only 2 parts - missing signature or payload');
      } else if (tokenParts.length > 3) {
        debugInfo.potentialIssues.push('Token has extra dots - might be corrupted or concatenated');
      }

      // Empty parts check
      const emptyParts = tokenParts.filter(part => part.trim() === '').length;
      if (emptyParts > 0) {
        debugInfo.potentialIssues.push(`${emptyParts} empty part(s) detected`);
      }

      // Base64 format check for each part
      tokenParts.forEach((part, index) => {
        if (part && !/^[A-Za-z0-9+/=_-]*$/.test(part)) {
          debugInfo.potentialIssues.push(`Part ${index} contains invalid Base64 characters`);
        }
      });

      console.error('JWT Format Validation Failed:', debugInfo);
      throw error;
    }

    // Additional validation for each JWT part
    const [header, payload, signature] = tokenParts;

    // Check for empty parts
    if (!header.trim() || !payload.trim() || !signature.trim()) {
      const error = new Error('JWT has empty parts');
      console.error('JWT Parts Validation Error:', {
        error: error.message,
        headerEmpty: !header.trim(),
        payloadEmpty: !payload.trim(),
        signatureEmpty: !signature.trim(),
        context
      });
      throw error;
    }

    // Success log (only in debug mode)
    if (process.env.JWT_DEBUG_MODE === 'true') {
      console.log('JWT Successfully Extracted:', {
        tokenLength: token.length,
        partsCount: tokenParts.length,
        headerLength: header.length,
        payloadLength: payload.length,
        signatureLength: signature.length,
        context
      });
    }

    return token;

  } catch (error) {
    // Re-throw with enhanced context
    throw error;
  }
}

// Static property to hold singleton instance
AppwriteService.instance = null;

export default AppwriteService;