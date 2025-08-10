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

    // NEW: Race condition protection for client creation
    this.creationLocks = new Map();

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

    // NEW: Appwrite-specific error mapping
    this.appwriteErrorMap = {
      'user_session_not_found': 'Session expired or revoked',
      'user_jwt_invalid': 'JWT signature invalid',
      'user_blocked': 'User account is blocked',
      'user_unauthorized': 'User not authorized for this action',
      'project_unknown': 'Invalid project configuration',
      'document_not_found': 'Document does not exist',
      'collection_not_found': 'Collection does not exist',
      'user_more_than_one_target': 'Multiple authentication methods provided'
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
  // NEW: Enhanced Token Cleaning
  // ======================
  cleanJWTToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    try {
      // Common issues'ları temizle
      let cleaned = rawToken
        .trim()                          // Whitespace'leri temizle
        .replace(/\s+/g, '')            // Tüm whitespace'leri kaldır
        .replace(/\n/g, '')             // Newline'ları kaldır
        .replace(/\r/g, '')             // Carriage return'leri kaldır
        .replace(/\t/g, '')             // Tab'ları kaldır
        .replace(/Bearer\s+/i, '');     // Bearer prefix'ini kaldır

      // Double encoding kontrolü
      if (cleaned.startsWith('Bearer%20')) {
        cleaned = decodeURIComponent(cleaned).replace('Bearer ', '');
      }

      // URL encoding temizliği
      if (cleaned.includes('%')) {
        try {
          const decoded = decodeURIComponent(cleaned);
          if (decoded !== cleaned && decoded.split('.').length === 3) {
            cleaned = decoded;
          }
        } catch (e) {
          // URL decode başarısız, orijinal ile devam et
        }
      }

      // Çift nokta kontrolü (..)
      if (cleaned.includes('..')) {
        cleaned = cleaned.replace(/\.+/g, '.');
      }

      // Son kontrol - JWT format check
      const parts = cleaned.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Her part'ın base64url formatında olduğunu kontrol et
      for (const part of parts) {
        if (!part || !/^[A-Za-z0-9_-]*$/.test(part)) {
          return null;
        }
      }

      return cleaned;
    } catch (error) {
      this.log('Token cleaning failed:', error.message);
      return null;
    }
  }

  // ======================
  // NEW: Safe Payload Decoder
  // ======================
  safeDecodeJWTPayload(jwtToken) {
    const decodeResult = {
      success: false,
      payload: null,
      error: null,
      metadata: {}
    };

    try {
      const parts = jwtToken.split('.');
      if (parts.length !== 3) {
        decodeResult.error = `Invalid JWT structure: ${parts.length} parts`;
        return decodeResult;
      }

      const payloadPart = parts[1];
      decodeResult.metadata.payloadLength = payloadPart.length;

      // Base64url format kontrolü
      if (!/^[A-Za-z0-9_-]*$/.test(payloadPart)) {
        decodeResult.error = 'Invalid base64url characters in JWT payload';
        return decodeResult;
      }

      // Padding kontrolü ve ekleme
      let paddedPayload = payloadPart;
      while (paddedPayload.length % 4 !== 0) {
        paddedPayload += '=';
      }

      // Base64url decode
      const decodedString = Buffer.from(paddedPayload, 'base64url').toString();
      decodeResult.metadata.decodedStringLength = decodedString.length;

      // Memory safety check - çok büyük payload'ları reddet
      if (decodedString.length > 10000) { // 10KB limit
        decodeResult.error = `JWT payload too large: ${decodedString.length} bytes`;
        return decodeResult;
      }

      // JSON parse
      const parsedPayload = JSON.parse(decodedString);
      decodeResult.success = true;
      decodeResult.payload = parsedPayload;

      // Metadata bilgileri
      decodeResult.metadata.payloadKeys = Object.keys(parsedPayload);
      decodeResult.metadata.payloadKeyCount = Object.keys(parsedPayload).length;

    } catch (error) {
      decodeResult.error = `Payload decode failed: ${error.message}`;
      decodeResult.metadata.decodeError = error.name;
    }

    return decodeResult;
  }

  // ======================
  // NEW: Appwrite Error Analyzer
  // ======================
  analyzeAppwriteError(error) {
    const analysis = {
      isAppwriteError: false,
      errorType: 'unknown',
      errorDescription: null,
      probableCause: 'Unknown',
      debugSuggestions: [],
      httpStatus: null,
      appwriteCode: null
    };

    // Appwrite error detection
    if (error.code || error.type || error.response) {
      analysis.isAppwriteError = true;
      analysis.appwriteCode = error.code;
      analysis.httpStatus = error.response?.status || error.status;
    }

    // Error type mapping
    if (analysis.appwriteCode && this.appwriteErrorMap[analysis.appwriteCode]) {
      analysis.errorType = analysis.appwriteCode;
      analysis.errorDescription = this.appwriteErrorMap[analysis.appwriteCode];
    }

    // HTTP status based analysis
    if (analysis.httpStatus) {
      switch (analysis.httpStatus) {
        case 401:
          analysis.probableCause = 'Authentication Failed';
          if (error.message?.toLowerCase().includes('jwt')) {
            analysis.debugSuggestions.push('Check JWT signature and expiration');
            analysis.debugSuggestions.push('Verify JWT was issued by correct Appwrite instance');
          }
          if (error.message?.toLowerCase().includes('session')) {
            analysis.debugSuggestions.push('User session may have been terminated');
            analysis.debugSuggestions.push('Check if user is still active in Appwrite');
          }
          break;

        case 403:
          analysis.probableCause = 'Permission Denied';
          analysis.debugSuggestions.push('Check document permissions');
          analysis.debugSuggestions.push('Verify user has required role');
          break;

        case 404:
          analysis.probableCause = 'Resource Not Found';
          analysis.debugSuggestions.push('Verify document/collection exists');
          analysis.debugSuggestions.push('Check database and collection IDs');
          break;

        case 429:
          analysis.probableCause = 'Rate Limit Exceeded';
          analysis.debugSuggestions.push('Implement exponential backoff');
          analysis.debugSuggestions.push('Check Appwrite plan limits');
          break;

        case 500:
        case 502:
        case 503:
          analysis.probableCause = 'Server Error';
          analysis.debugSuggestions.push('Check Appwrite service status');
          analysis.debugSuggestions.push('Retry with exponential backoff');
          break;
      }
    }

    return analysis;
  }

  // ======================
  // NEW: Memory-Safe Error Context Creator
  // ======================
  createSafeErrorContext(context, payloadDecodeResult, error, jwtToken) {
    const safeContext = {
      ...context,
      timestamp: new Date().toISOString(),
      
      // Appwrite error analysis
      appwriteAnalysis: this.analyzeAppwriteError(error),
      
      // JWT metadata (memory-safe)
      jwtMeta: {},
      
      // Token metadata (sanitized)
      tokenMeta: {
        tokenLength: jwtToken?.length || 0,
        tokenParts: jwtToken?.split('.').length || 0,
        tokenSnippet: jwtToken ? jwtToken.slice(0, 12) + '...' + jwtToken.slice(-4) : null
      },
      
      // Error summary (truncated for memory safety)
      errorSummary: {
        message: error.message?.slice(0, 500) + (error.message?.length > 500 ? '...' : ''),
        code: error.code,
        type: error.type,
        name: error.name
      },
      
      // Performance metrics
      performanceMeta: context.performanceMeta || {}
    };

    // JWT payload metadata (safe)
    if (payloadDecodeResult?.success && payloadDecodeResult.payload) {
      const payload = payloadDecodeResult.payload;
      safeContext.jwtMeta = {
        hasIssuer: !!payload.iss,
        hasAudience: !!payload.aud,
        hasExpiration: !!payload.exp,
        hasUserId: !!(payload.userId || payload.sub),
        hasSessionId: !!payload.sessionId,
        keyCount: payloadDecodeResult.metadata.payloadKeyCount,
        payloadSize: payloadDecodeResult.metadata.decodedStringLength,
        
        // Critical fields only
        issuer: payload.iss || null,
        audience: payload.aud || null,
        expiration: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        userId: payload.userId || payload.sub || null,
        isExpired: payload.exp ? Date.now() > (payload.exp * 1000) : null,
        
        // Audience validation
        audienceMatches: payload.aud === process.env.APPWRITE_PROJECT_ID
      };
    } else if (payloadDecodeResult?.error) {
      safeContext.jwtMeta = {
        decodeError: payloadDecodeResult.error,
        payloadLength: payloadDecodeResult.metadata?.payloadLength || 0
      };
    }

    return safeContext;
  }

  // ======================
  // Network Retry Logic (Enhanced)
  // ======================
  async executeWithRetry(operation, context = {}, customRetryConfig = {}) {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError = null;
    let attempt = 0;

    const operationContext = {
      ...context,
      retryAttempt: 0,
      maxRetries: config.maxRetries,
      startTime: Date.now()
    };

    while (attempt <= config.maxRetries) {
      try {
        operationContext.retryAttempt = attempt;
        operationContext.performanceMeta = {
          attemptStartTime: Date.now(),
          attemptNumber: attempt + 1,
          totalAttempts: config.maxRetries + 1
        };

        if (attempt > 0) {
          this.log(`[RETRY ${attempt}/${config.maxRetries}] Retrying ${context.methodName || 'operation'}...`);
        }

        const result = await operation();

        // Performance tracking
        operationContext.performanceMeta.attemptDuration = Date.now() - operationContext.performanceMeta.attemptStartTime;
        operationContext.performanceMeta.totalDuration = Date.now() - operationContext.startTime;

        // Başarılı operation - connection health güncelle
        this.connectionHealth.lastSuccessful = Date.now();
        this.connectionHealth.failureCount = 0;

        if (attempt > 0) {
          // Retry başarılı oldu
          await this.postHog.trackBusinessEvent('network_retry_success', {
            method_name: context.methodName,
            attempt_number: attempt,
            total_attempts: attempt + 1,
            total_duration_ms: operationContext.performanceMeta.totalDuration,
            endpoint: this.connectionHealth.endpoint
          }, context.userId || 'system');
        }

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Performance tracking for failed attempt
        operationContext.performanceMeta.attemptDuration = Date.now() - operationContext.performanceMeta.attemptStartTime;

        // Network error analizi
        const isNetworkError = this.isRetryableNetworkError(error);
        const networkErrorDetails = this.analyzeNetworkError(error);
        const appwriteErrorDetails = this.analyzeAppwriteError(error);

        // Connection health güncelle
        this.connectionHealth.lastFailure = Date.now();
        this.connectionHealth.failureCount++;

        this.log(`[NETWORK ERROR] Attempt ${attempt}/${config.maxRetries + 1}:`, {
          error: error.message,
          code: error.code,
          isRetryable: isNetworkError,
          appwriteAnalysis: appwriteErrorDetails,
          ...networkErrorDetails
        });

        // Son deneme mi?
        if (attempt > config.maxRetries) {
          operationContext.performanceMeta.totalDuration = Date.now() - operationContext.startTime;
          
          // Final error tracking
          await this.postHog.trackError(error, {
            ...operationContext,
            networkAnalysis: networkErrorDetails,
            appwriteAnalysis: appwriteErrorDetails,
            connectionHealth: this.connectionHealth,
            finalAttempt: true,
            totalAttempts: attempt
          });

          throw new Error(`Operation failed after ${attempt} attempts: ${error.message} (${error.code || 'Unknown'})`);
        }

        // Appwrite-specific non-retryable errors
        if (appwriteErrorDetails.httpStatus === 401 || 
            appwriteErrorDetails.httpStatus === 403 || 
            appwriteErrorDetails.httpStatus === 404) {
          
          await this.postHog.trackError(error, {
            ...operationContext,
            appwriteAnalysis: appwriteErrorDetails,
            nonRetryable: true,
            reason: 'appwrite_auth_or_permission_error'
          });
          throw error;
        }

        // Retry yapılabilir mi?
        if (!isNetworkError) {
          // Non-retryable error (auth, validation vs.)
          await this.postHog.trackError(error, {
            ...operationContext,
            networkAnalysis: networkErrorDetails,
            appwriteAnalysis: appwriteErrorDetails,
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
  // NEW: Race-Condition Safe Client Management
  // ======================
  async createClientSafe(auth) {
    const context = { methodName: 'createClientSafe' };

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

      // Race condition protection
      const lockKey = `client_creation_${this.hashToken(auth)}`;
      
      if (this.creationLocks.has(lockKey)) {
        // Başka bir thread client oluşturuyor, bekle
        await this.creationLocks.get(lockKey);
        
        // Tekrar cache'den kontrol et
        const reChecked = this.clientCache.get(auth);
        if (reChecked && (Date.now() - reChecked.lastUsed < this.cacheTimeout)) {
          reChecked.lastUsed = Date.now();
          return reChecked.client;
        }
      }

      // Lock oluştur
      let resolveLock;
      const lockPromise = new Promise(resolve => { resolveLock = resolve; });
      this.creationLocks.set(lockKey, lockPromise);

      try {
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
        await this.addToCacheSafe(auth, client);

        return client;

      } finally {
        // Lock'u temizle
        this.creationLocks.delete(lockKey);
        resolveLock();
      }

    } catch (error) {
      await this.postHog.trackError(error, context);
      throw error;
    }
  }

  // Token'ı hash'leyerek lock key oluştur
  hashToken(token) {
    // Simple hash function for lock keys
    let hash = 0;
    for (let i = 0; i < Math.min(token.length, 50); i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async addToCacheSafe(auth, client) {
    // Cache boyutu kontrolü
    if (this.clientCache.size >= this.maxCacheSize) {
      await this.evictOldestCache();
    }

    this.clientCache.set(auth, {
      client,
      databases: new Databases(client),
      account: new Account(client),
      lastUsed: Date.now(),
      createdAt: Date.now()
    });
  }

  async evictOldestCache() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, value] of this.clientCache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const evicted = this.clientCache.get(oldestKey);
      this.clientCache.delete(oldestKey);
      
      // Eviction tracking
      await this.postHog.trackBusinessEvent('client_cache_eviction', {
        evicted_key_snippet: oldestKey.slice(0, 12) + '...',
        last_used_minutes_ago: Math.round((Date.now() - evicted.lastUsed) / 60000),
        cache_size_before: this.clientCache.size + 1,
        cache_size_after: this.clientCache.size
      }, 'system');
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

  // Backward compatibility
  createClient(auth) {
    return this.createClientSafe(auth);
  }

  isJWTToken(auth) {
    return auth && typeof auth === 'string' && auth.split('.').length === 3;
  }

  async getDatabasesSafe(auth) {
    const cached = this.clientCache.get(auth);
    if (cached && (Date.now() - cached.lastUsed < this.cacheTimeout)) {
      cached.lastUsed = Date.now();
      return cached.databases;
    }

    // Cache miss - yeni client oluştur ve databases döndür
    const client = await this.createClientSafe(auth);
    return this.clientCache.get(auth).databases;
  }

  async getAccountSafe(auth) {
    const cached = this.clientCache.get(auth);
    if (cached && (Date.now() - cached.lastUsed < this.cacheTimeout)) {
      cached.lastUsed = Date.now();
      return cached.account;
    }

    // Cache miss - yeni client oluştur ve account döndür
    const client = await this.createClientSafe(auth);
    return this.clientCache.get(auth).account;
  }

  // Backward compatibility
  getDatabases(auth) {
    return this.getDatabasesSafe(auth);
  }

  getAccount(auth) {
    return this.getAccountSafe(auth);
  }

  getAdminDatabases() {
    const context = { methodName: 'getAdminDatabases' };

    try {
      if (!process.env.APPWRITE_DEV_KEY) {
        throw new Error('APPWRITE_DEV_KEY is not configured');
      }

      // Admin client singleton pattern
      if (!this.adminClient) {
        this.adminClient = new Client()
          .setEndpoint(process.env.APPWRITE_END_POINT)
          .setProject(process.env.APPWRITE_PROJECT_ID)
          .setKey(process.env.APPWRITE_DEV_KEY);
        this.adminDatabases = new Databases(this.adminClient);
      }

      return this.adminDatabases;
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // NEW: Enhanced JWT Validation with All Improvements
  // ======================
  async validateJWT(jwtToken) {
    this.log(`JWT validation started for ${jwtToken ? jwtToken.slice(0, 12) + '...' : 'missing token'}`);
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
      let cleanedToken = null;
      let payloadDecodeResult = null;

      try {
        // Step 1: Token existence check
        if (!jwtToken) {
          const err = new Error('JWT token is missing');
          await this.postHog.trackError(err, context);
          throw err;
        }

        // Step 2: Token cleaning
        cleanedToken = this.cleanJWTToken(jwtToken);
        if (!cleanedToken) {
          const cleanError = new Error('JWT token could not be cleaned or is malformed');
          
          const cleaningAnalysis = {
            originalLength: jwtToken.length,
            originalParts: jwtToken.split('.').length,
            hasWhitespace: /\s/.test(jwtToken),
            hasNewlines: /[\n\r]/.test(jwtToken),
            hasTabs: /\t/.test(jwtToken),
            hasBearer: /bearer/i.test(jwtToken),
            hasUrlEncoding: /%/.test(jwtToken)
          };

          await this.postHog.trackError(cleanError, {
            ...context,
            cleaningAnalysis,
            additionalData: {
              ...context.additionalData,
              cleaningFailed: true,
              originalTokenSnippet: jwtToken.slice(0, 50) + '...'
            }
          });

          throw cleanError;
        }

        // Update context with cleaned token info
        context.additionalData.tokenWasCleaned = cleanedToken !== jwtToken;
        context.additionalData.cleanedTokenLength = cleanedToken.length;

        // Step 3: JWT format validation
        const tokenParts = cleanedToken.split('.');
        if (tokenParts.length !== 3) {
          const formatError = new Error(`JWT token format is invalid (${tokenParts.length} parts instead of 3)`);

          const formatAnalysis = {
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
            })),
            possibleCauses: this.analyzeJWTFormatIssues(tokenParts, cleanedToken)
          };

          await this.postHog.trackError(formatError, {
            ...context,
            formatAnalysis,
            additionalData: {
              ...context.additionalData,
              formatError: 'Invalid JWT structure after cleaning'
            }
          });

          throw formatError;
        }

        // Step 4: Safe payload decode
        payloadDecodeResult = this.safeDecodeJWTPayload(cleanedToken);
        
        // Step 5: JWT issuer validation
        if (payloadDecodeResult.success && payloadDecodeResult.payload) {
          const validationErrors = this.validateJWTClaims(payloadDecodeResult.payload);
          if (validationErrors.length > 0) {
            const claimsError = new Error(`JWT claims validation failed: ${validationErrors.join(', ')}`);
            
            await this.postHog.trackError(claimsError, this.createSafeErrorContext(
              context, payloadDecodeResult, claimsError, cleanedToken
            ));

            throw claimsError;
          }
        }

        // Step 6: Appwrite validation
        const account = await this.getAccountSafe(cleanedToken);
        const user = await account.get();

        const result = {
          ...user,
          userId: user.$id,
        };

        const duration = Date.now() - startTime;

        // Success tracking with enhanced metadata
        await this.postHog.trackBusinessEvent('user_authenticated', {
          user_id: result.userId,
          authentication_method: 'jwt',
          validation_duration_ms: duration,
          token_length: cleanedToken.length,
          token_was_cleaned: cleanedToken !== jwtToken,
          payload_decode_success: payloadDecodeResult?.success || false,
          jwt_issuer: payloadDecodeResult?.payload?.iss || null,
          jwt_audience_matches: payloadDecodeResult?.payload?.aud === process.env.APPWRITE_PROJECT_ID
        }, result.userId);

        this.log(`JWT validation successful for user ${result.userId} (${duration}ms)`);

        return result;

      } catch (error) {
        const duration = Date.now() - startTime;

        // Enhanced error context creation
        const safeErrorContext = this.createSafeErrorContext(
          { ...context, performanceMeta: { validationDuration: duration } },
          payloadDecodeResult,
          error,
          cleanedToken || jwtToken
        );

        // Network vs Appwrite error differentiation
        const isNetworkError = this.isRetryableNetworkError(error);
        const appwriteAnalysis = this.analyzeAppwriteError(error);

        safeErrorContext.errorClassification = {
          isNetworkError,
          isAppwriteError: appwriteAnalysis.isAppwriteError,
          isAuthError: appwriteAnalysis.httpStatus === 401,
          isPermissionError: appwriteAnalysis.httpStatus === 403,
          errorCategory: this.categorizeValidationError(error, appwriteAnalysis)
        };

        await this.postHog.trackError(error, safeErrorContext);

        if (process.env.NODE_ENV !== 'production') {
          this.log('JWT Validation Failed - Debug Info:', {
            errorCategory: safeErrorContext.errorClassification.errorCategory,
            appwriteAnalysis: appwriteAnalysis,
            payloadDecodeSuccess: payloadDecodeResult?.success,
            tokenCleaned: cleanedToken !== jwtToken,
            duration
          });
        }

        // Enhanced error message
        const errorComponents = [
          `JWT validation failed: ${appwriteAnalysis.probableCause}`,
          `Code: ${error.code || 'N/A'}`,
          `Duration: ${duration}ms`
        ];

        if (context.retryAttempt) {
          errorComponents.push(`(After ${context.retryAttempt} retries)`);
        }

        if (appwriteAnalysis.debugSuggestions.length > 0) {
          errorComponents.push(`Suggestion: ${appwriteAnalysis.debugSuggestions[0]}`);
        }

        throw new Error(errorComponents.join(' | '));
      }
    }, context, {
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 3000
    });
  }

  // ======================
  // NEW: JWT Analysis Helpers
  // ======================
  analyzeJWTFormatIssues(tokenParts, cleanedToken) {
    const issues = [];

    if (tokenParts.length === 1) {
      issues.push('No dots found - not a JWT format');
      issues.push('Might be a simple API key or session token');
    } else if (tokenParts.length === 2) {
      issues.push('Missing signature part');
      issues.push('Token might be truncated');
    } else if (tokenParts.length > 3) {
      issues.push('Extra dots in token');
      issues.push('Token might be corrupted or double-encoded');
      issues.push('Multiple tokens concatenated');
    }

    // Additional analysis
    const dotCount = (cleanedToken.match(/\./g) || []).length;
    const spaceCount = (cleanedToken.match(/ /g) || []).length;
    const newlineCount = (cleanedToken.match(/\n/g) || []).length;

    if (spaceCount > 0) {
      issues.push(`Token contains ${spaceCount} space(s) after cleaning`);
    }
    if (newlineCount > 0) {
      issues.push(`Token contains ${newlineCount} newline(s) after cleaning`);
    }

    return issues;
  }

  validateJWTClaims(payload) {
    const errors = [];

    // Issuer validation
    if (payload.iss && !payload.iss.includes('appwrite')) {
      errors.push(`Unexpected issuer: ${payload.iss}`);
    }

    // Audience validation
    if (payload.aud && payload.aud !== process.env.APPWRITE_PROJECT_ID) {
      errors.push(`Audience mismatch - expected: ${process.env.APPWRITE_PROJECT_ID}, got: ${payload.aud}`);
    }

    // Expiration validation
    if (payload.exp && Date.now() > (payload.exp * 1000)) {
      const expiredSince = Math.round((Date.now() - (payload.exp * 1000)) / 1000);
      errors.push(`Token expired ${expiredSince} seconds ago`);
    }

    // Required claims
    if (!payload.userId && !payload.sub) {
      errors.push('Missing user identifier (userId or sub)');
    }

    return errors;
  }

  categorizeValidationError(error, appwriteAnalysis) {
    if (this.isRetryableNetworkError(error)) {
      return 'network_connectivity';
    }

    if (appwriteAnalysis.isAppwriteError) {
      switch (appwriteAnalysis.httpStatus) {
        case 401: return 'authentication_failed';
        case 403: return 'authorization_failed';
        case 404: return 'resource_not_found';
        case 429: return 'rate_limited';
        case 500:
        case 502:
        case 503: return 'server_error';
        default: return 'appwrite_error';
      }
    }

    if (error.message?.includes('format is invalid')) {
      return 'token_format_error';
    }

    if (error.message?.includes('could not be cleaned')) {
      return 'token_cleaning_error';
    }

    return 'unknown_validation_error';
  }

  // ======================
  // Enhanced JWT Health Check
  // ======================
  async checkJWTHealth(jwtToken) {
    const healthReport = {
      isValid: false,
      overallScore: 0, // 0-100
      checks: {},
      warnings: [],
      errors: [],
      recommendations: [],
      metadata: {
        checkTimestamp: new Date().toISOString(),
        checksPerformed: []
      }
    };

    try {
      // Check 1: Token existence (20 points)
      healthReport.checks.tokenExists = !!jwtToken;
      healthReport.metadata.checksPerformed.push('token_existence');
      if (!jwtToken) {
        healthReport.errors.push('JWT token is missing');
        return healthReport;
      }
      healthReport.overallScore += 20;

      // Check 2: Token cleaning (15 points)
      const cleanedToken = this.cleanJWTToken(jwtToken);
      healthReport.checks.tokenCleanable = !!cleanedToken;
      healthReport.checks.tokenNeededCleaning = cleanedToken !== jwtToken;
      healthReport.metadata.checksPerformed.push('token_cleaning');
      
      if (!cleanedToken) {
        healthReport.errors.push('JWT token could not be cleaned');
        return healthReport;
      }
      healthReport.overallScore += 15;

      if (cleanedToken !== jwtToken) {
        healthReport.warnings.push('Token required cleaning (had whitespace/encoding issues)');
        healthReport.recommendations.push('Review token generation to avoid formatting issues');
      }

      // Check 3: Format validation (20 points)
      const parts = cleanedToken.split('.');
      healthReport.checks.hasThreeParts = parts.length === 3;
      healthReport.metadata.checksPerformed.push('format_validation');
      
      if (parts.length !== 3) {
        healthReport.errors.push(`JWT has ${parts.length} parts instead of 3`);
        return healthReport;
      }
      healthReport.overallScore += 20;

      // Check 4: Payload decode (15 points)
      const payloadDecodeResult = this.safeDecodeJWTPayload(cleanedToken);
      healthReport.checks.payloadDecodable = payloadDecodeResult.success;
      healthReport.metadata.checksPerformed.push('payload_decode');
      healthReport.metadata.payloadMetadata = payloadDecodeResult.metadata;

      if (!payloadDecodeResult.success) {
        healthReport.errors.push(`Payload decode failed: ${payloadDecodeResult.error}`);
        return healthReport;
      }
      healthReport.overallScore += 15;

      const payload = payloadDecodeResult.payload;

      // Check 5: Claims validation (15 points)
      const claimsErrors = this.validateJWTClaims(payload);
      healthReport.checks.claimsValid = claimsErrors.length === 0;
      healthReport.metadata.checksPerformed.push('claims_validation');
      
      if (claimsErrors.length > 0) {
        healthReport.errors.push(...claimsErrors);
        healthReport.overallScore += Math.max(0, 15 - (claimsErrors.length * 5)); // Partial credit
      } else {
        healthReport.overallScore += 15;
      }

      // Additional warnings for claims
      if (payload.exp) {
        const expDate = new Date(payload.exp * 1000);
        const timeUntilExp = expDate.getTime() - Date.now();
        
        healthReport.checks.expirationTime = expDate.toISOString();
        healthReport.checks.timeUntilExpirationMs = timeUntilExp;
        healthReport.checks.isExpired = timeUntilExp <= 0;

        if (timeUntilExp > 0 && timeUntilExp < 5 * 60 * 1000) { // 5 minutes
          healthReport.warnings.push(`JWT expires soon (${Math.round(timeUntilExp / 60000)} minutes)`);
          healthReport.recommendations.push('Consider refreshing the token');
        }
      } else {
        healthReport.warnings.push('JWT has no expiration claim');
        healthReport.recommendations.push('Consider using tokens with expiration for security');
      }

      // Check 6: Appwrite validation (15 points)
      healthReport.metadata.checksPerformed.push('appwrite_validation');
      try {
        await this.validateJWT(cleanedToken);
        healthReport.checks.appwriteValidation = true;
        healthReport.isValid = true;
        healthReport.overallScore += 15;
      } catch (validationError) {
        healthReport.checks.appwriteValidation = false;
        healthReport.errors.push(`Appwrite validation failed: ${validationError.message}`);
        
        // Partial credit based on error type
        const appwriteAnalysis = this.analyzeAppwriteError(validationError);
        if (appwriteAnalysis.httpStatus === 401) {
          // Auth error - token might be expired but structurally valid
          healthReport.overallScore += 5;
        }
      }

      // Final health assessment
      if (healthReport.overallScore >= 90) {
        healthReport.recommendations.push('JWT is in excellent condition');
      } else if (healthReport.overallScore >= 70) {
        healthReport.recommendations.push('JWT is healthy with minor issues');
      } else if (healthReport.overallScore >= 50) {
        healthReport.recommendations.push('JWT has moderate issues that should be addressed');
      } else {
        healthReport.recommendations.push('JWT has significant issues requiring immediate attention');
      }

    } catch (error) {
      healthReport.errors.push(`Health check failed: ${error.message}`);
      healthReport.metadata.fatalError = error.message;
    }

    healthReport.metadata.totalChecks = healthReport.metadata.checksPerformed.length;
    return healthReport;
  }

  // ======================
  // Enhanced validateAndExtractUser
  // ======================
  async validateAndExtractUser(headers, requestId) {
    const context = {
      methodName: 'validateAndExtractUser',
      requestId,
      additionalData: { hasHeaders: !!headers }
    };

    return this.postHog.withTracking('validateAndExtractUser', async () => {
      try {
        const jwtToken = extractJWTFromHeaders(headers);

        // JWT health check (enhanced with scoring)
        if (process.env.NODE_ENV !== 'production' && process.env.JWT_DEBUG_MODE === 'true') {
          const healthReport = await this.checkJWTHealth(jwtToken);
          if (healthReport.overallScore < 70) {
            this.log(`[${requestId}] JWT Health Issues (Score: ${healthReport.overallScore}/100):`, healthReport);
          }
          
          // Track health metrics
          await this.postHog.trackBusinessEvent('jwt_health_check', {
            health_score: healthReport.overallScore,
            checks_performed: healthReport.metadata.totalChecks,
            warnings_count: healthReport.warnings.length,
            errors_count: healthReport.errors.length,
            is_valid: healthReport.isValid
          }, requestId);
        }

        const userInfo = await this.validateJWT(jwtToken);

        if (!userInfo.userId) {
          throw new Error('Failed to extract user info from JWT');
        }

        this.log(`[${requestId}] JWT validation successful for user: ${userInfo.userId}`);
        return { jwtToken, userInfo };

      } catch (error) {
        // Enhanced error categorization
        const errorCategory = this.categorizeHeaderExtractionError(error);
        
        // Conditional debug analysis
        if (errorCategory === 'jwt_format_error' && process.env.JWT_DEBUG_MODE === 'true') {
          this.log(`[${requestId}] Running detailed JWT debug analysis...`);
          const debugReport = await this.debugJWTIssue(headers, requestId);
          this.log(`[${requestId}] JWT Debug Report:`, debugReport);

          await this.postHog.trackError(error, {
            ...context,
            debugReport,
            errorCategory,
            additionalData: {
              ...context.additionalData,
              debugAnalysisPerformed: true
            }
          });
        } else {
          await this.postHog.trackError(error, {
            ...context,
            errorCategory,
            additionalData: {
              ...context.additionalData,
              debugAnalysisSkipped: errorCategory !== 'jwt_format_error'
            }
          });
        }

        throw error;
      }
    }, { ...context, userId: requestId });
  }

  categorizeHeaderExtractionError(error) {
    if (error.message.includes('Authorization header')) {
      return 'header_extraction';
    }
    if (error.message.includes('JWT token format is invalid')) {
      return 'jwt_format_error';
    }
    if (error.message.includes('JWT validation failed')) {
      return 'jwt_validation_error';
    }
    if (error.message.includes('could not be cleaned')) {
      return 'token_cleaning_error';
    }
    return 'unknown_error';
  }

  // ======================
  // Enhanced JWT Problem Solver
  // ======================
  async debugJWTIssue(headers, requestId = 'debug') {
    const debugReport = {
      timestamp: new Date().toISOString(),
      requestId,
      step: 'start',
      issue: null,
      analysis: {},
      recommendations: [],
      performanceMetrics: {
        startTime: Date.now(),
        stepTimes: {}
      }
    };

    try {
      // Step 1: Header Analysis
      debugReport.step = 'header_analysis';
      const headerStepStart = Date.now();
      
      debugReport.analysis.headers = {
        hasAuthorization: !!(headers.authorization || headers.Authorization),
        authHeaderValue: headers.authorization || headers.Authorization || 'MISSING',
        allHeaders: Object.keys(headers),
        headerCount: Object.keys(headers).length,
        authHeaderLength: (headers.authorization || headers.Authorization || '').length
      };

      debugReport.performanceMetrics.stepTimes.headerAnalysis = Date.now() - headerStepStart;

      if (!headers.authorization && !headers.Authorization) {
        debugReport.issue = 'missing_auth_header';
        debugReport.recommendations.push('Add Authorization header with Bearer token');
        return debugReport;
      }

      // Step 2: Token Extraction
      debugReport.step = 'token_extraction';
      const extractStepStart = Date.now();
      
      let extractedToken;
      try {
        extractedToken = extractJWTFromHeaders(headers);
        debugReport.analysis.extraction = { 
          success: true, 
          tokenLength: extractedToken.length,
          tokenSnippet: extractedToken.slice(0, 20) + '...'
        };
      } catch (extractionError) {
        debugReport.issue = 'token_extraction_failed';
        debugReport.analysis.extraction = {
          success: false,
          error: extractionError.message
        };
        debugReport.recommendations.push('Check Authorization header format: Bearer <jwt_token>');
        return debugReport;
      }

      debugReport.performanceMetrics.stepTimes.tokenExtraction = Date.now() - extractStepStart;

      // Step 3: Token Cleaning Analysis
      debugReport.step = 'token_cleaning_analysis';
      const cleanStepStart = Date.now();
      
      const cleanedToken = this.cleanJWTToken(extractedToken);
      debugReport.analysis.cleaning = {
        success: !!cleanedToken,
        wasCleaningNeeded: cleanedToken !== extractedToken,
        originalLength: extractedToken.length,
        cleanedLength: cleanedToken ? cleanedToken.length : 0,
        cleaningIssues: []
      };

      if (!cleanedToken) {
        debugReport.issue = 'token_cleaning_failed';
        debugReport.recommendations.push('Token contains uncorrectable format issues');
        return debugReport;
      }

      if (cleanedToken !== extractedToken) {
        debugReport.analysis.cleaning.cleaningIssues.push('Token required cleaning');
        debugReport.recommendations.push('Review token generation to avoid formatting issues');
      }

      debugReport.performanceMetrics.stepTimes.tokenCleaning = Date.now() - cleanStepStart;

      // Step 4: Format Analysis
      debugReport.step = 'token_format_analysis';
      const formatStepStart = Date.now();
      
      const parts = cleanedToken.split('.');
      debugReport.analysis.format = {
        partsCount: parts.length,
        isValidJWTFormat: parts.length === 3,
        parts: parts.map((part, i) => ({
          index: i,
          length: part.length,
          isEmpty: part === '',
          preview: part.slice(0, 20) + '...',
          isValidBase64: /^[A-Za-z0-9+/=_-]*$/.test(part)
        }))
      };

      if (parts.length !== 3) {
        debugReport.issue = 'invalid_jwt_format';
        debugReport.recommendations.push(...this.analyzeJWTFormatIssues(parts, cleanedToken));
        return debugReport;
      }

      debugReport.performanceMetrics.stepTimes.formatAnalysis = Date.now() - formatStepStart;

      // Step 5: Payload Decode Analysis
      debugReport.step = 'payload_decode_analysis';
      const payloadStepStart = Date.now();
      
      const payloadDecodeResult = this.safeDecodeJWTPayload(cleanedToken);
      debugReport.analysis.payload = {
        decodeSuccess: payloadDecodeResult.success,
        error: payloadDecodeResult.error,
        metadata: payloadDecodeResult.metadata
      };

      if (payloadDecodeResult.success) {
        const claimsErrors = this.validateJWTClaims(payloadDecodeResult.payload);
        debugReport.analysis.payload.claimsValidation = {
          isValid: claimsErrors.length === 0,
          errors: claimsErrors
        };
        
        if (claimsErrors.length > 0) {
          debugReport.recommendations.push(...claimsErrors.map(err => `Claims issue: ${err}`));
        }
      }

      debugReport.performanceMetrics.stepTimes.payloadAnalysis = Date.now() - payloadStepStart;

      // Step 6: Appwrite Validation
      debugReport.step = 'appwrite_validation';
      const appwriteStepStart = Date.now();
      
      try {
        const validationResult = await this.validateJWT(cleanedToken);
        debugReport.analysis.validation = {
          success: true,
          userId: validationResult.userId,
          userEmail: validationResult.email
        };
        debugReport.issue = null; // No issue if we reach here
      } catch (validationError) {
        debugReport.issue = 'appwrite_validation_failed';
        const appwriteAnalysis = this.analyzeAppwriteError(validationError);
        
        debugReport.analysis.validation = {
          success: false,
          error: validationError.message,
          appwriteAnalysis
        };
        
        debugReport.recommendations.push(...appwriteAnalysis.debugSuggestions);
      }

      debugReport.performanceMetrics.stepTimes.appwriteValidation = Date.now() - appwriteStepStart;

      return debugReport;

    } catch (error) {
      debugReport.issue = 'debug_process_failed';
      debugReport.analysis.fatalError = {
        message: error.message,
        step: debugReport.step,
        stack: error.stack?.split('\n').slice(0, 5) // First 5 lines of stack
      };
      debugReport.recommendations.push('Contact system administrator - debug process failed');
      return debugReport;
    } finally {
      debugReport.performanceMetrics.totalDuration = Date.now() - debugReport.performanceMetrics.startTime;
    }
  }

  // ======================
  // Cache Statistics & Monitoring (Enhanced)
  // ======================
  getCacheStats() {
    const now = Date.now();
    const stats = {
      size: this.clientCache.size,
      maxSize: this.maxCacheSize,
      utilizationPercentage: (this.clientCache.size / this.maxCacheSize) * 100,
      totalMemoryEstimate: 0,
      entries: [],
      ageDistribution: {
        under1Min: 0,
        under5Min: 0,
        under30Min: 0,
        over30Min: 0
      },
      typeDistribution: {
        jwt: 0,
        apiKey: 0
      }
    };

    for (const [key, value] of this.clientCache.entries()) {
      const ageMinutes = Math.round((now - value.lastUsed) / 60000);
      const isJWT = this.isJWTToken(key);
      
      // Age distribution
      if (ageMinutes < 1) stats.ageDistribution.under1Min++;
      else if (ageMinutes < 5) stats.ageDistribution.under5Min++;
      else if (ageMinutes < 30) stats.ageDistribution.under30Min++;
      else stats.ageDistribution.over30Min++;

      // Type distribution
      if (isJWT) stats.typeDistribution.jwt++;
      else stats.typeDistribution.apiKey++;

      // Memory estimate (rough)
      stats.totalMemoryEstimate += key.length + 1000; // ~1KB per client object

      stats.entries.push({
        keyType: isJWT ? 'JWT' : 'API_KEY',
        keySnippet: key.slice(0, 12) + '...' + key.slice(-4),
        lastUsed: new Date(value.lastUsed).toISOString(),
        createdAt: new Date(value.createdAt).toISOString(),
        ageMinutes,
        usageFrequency: this.estimateUsageFrequency(value)
      });
    }

    // Sort by most recently used
    stats.entries.sort((a, b) => b.ageMinutes - a.ageMinutes);

    return stats;
  }

  estimateUsageFrequency(cacheEntry) {
    const ageMs = Date.now() - cacheEntry.createdAt;
    const timeSinceLastUsed = Date.now() - cacheEntry.lastUsed;
    
    // Simple frequency estimation
    if (timeSinceLastUsed < 60000) return 'very_active'; // < 1 min
    if (timeSinceLastUsed < 300000) return 'active'; // < 5 min
    if (timeSinceLastUsed < 1800000) return 'moderate'; // < 30 min
    return 'inactive';
  }

  // ======================
  // Enhanced Network Health & Circuit Breaker
  // ======================
  getNetworkHealth() {
    const now = Date.now();
    const health = {
      ...this.connectionHealth,
      timeSinceLastSuccess: this.connectionHealth.lastSuccessful ?
        now - this.connectionHealth.lastSuccessful : null,
      timeSinceLastFailure: this.connectionHealth.lastFailure ?
        now - this.connectionHealth.lastFailure : null,
      consecutiveFailures: this.connectionHealth.failureCount,
      isHealthy: this.connectionHealth.failureCount < 5 &&
        (this.connectionHealth.lastSuccessful ?
          now - this.connectionHealth.lastSuccessful < 5 * 60 * 1000 : false),
      healthScore: this.calculateHealthScore(),
      status: this.getHealthStatus()
    };

    return health;
  }

  calculateHealthScore() {
    const now = Date.now();
    let score = 100;

    // Penalize consecutive failures
    score -= Math.min(this.connectionHealth.failureCount * 20, 80);

    // Penalize time since last success
    if (this.connectionHealth.lastSuccessful) {
      const timeSinceSuccess = now - this.connectionHealth.lastSuccessful;
      if (timeSinceSuccess > 30 * 60 * 1000) { // 30 minutes
        score -= 30;
      } else if (timeSinceSuccess > 5 * 60 * 1000) { // 5 minutes
        score -= 10;
      }
    } else {
      score -= 50; // Never had success
    }

    return Math.max(0, Math.min(100, score));
  }

  getHealthStatus() {
    const score = this.calculateHealthScore();
    
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  isCircuitOpen() {
    const healthCheck = this.getNetworkHealth();
    
    // More sophisticated circuit breaker logic
    return (
      healthCheck.consecutiveFailures >= 5 &&
      (!healthCheck.lastSuccessful || 
       Date.now() - healthCheck.lastSuccessful > 2 * 60 * 1000) &&
      healthCheck.healthScore < 30
    );
  }

  async executeWithCircuitBreaker(operation, context = {}) {
    if (this.isCircuitOpen()) {
      const health = this.getNetworkHealth();
      const error = new Error(`Circuit breaker is open - network health score: ${health.healthScore}/100`);
      
      await this.postHog.trackError(error, {
        ...context,
        circuitBreakerStatus: 'open',
        networkHealth: health
      });
      throw error;
    }

    return operation();
  }

  // ======================
  // System Health Monitoring
  // ======================
  async getSystemHealth() {
    const health = {
      timestamp: new Date().toISOString(),
      overall: 'unknown',
      components: {},
      metrics: {},
      recommendations: []
    };

    try {
      // Network health
      const networkTest = await this.testConnection();
      health.components.network = {
        status: networkTest.success ? 'healthy' : 'unhealthy',
        details: networkTest
      };

      // Cache health
      const cacheStats = this.getCacheStats();
      health.components.cache = {
        status: cacheStats.utilizationPercentage > 90 ? 'warning' : 'healthy',
        details: cacheStats
      };

      // Memory health (rough estimate)
      const processMemory = process.memoryUsage();
      health.components.memory = {
        status: processMemory.heapUsed > processMemory.heapTotal * 0.8 ? 'warning' : 'healthy',
        details: {
          heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024), // MB
          utilizationPercentage: (processMemory.heapUsed / processMemory.heapTotal) * 100
        }
      };

      // Overall health calculation
      const componentStatuses = Object.values(health.components).map(c => c.status);
      if (componentStatuses.every(s => s === 'healthy')) {
        health.overall = 'healthy';
      } else if (componentStatuses.some(s => s === 'unhealthy')) {
        health.overall = 'unhealthy';
      } else {
        health.overall = 'warning';
      }

      // Recommendations
      if (cacheStats.utilizationPercentage > 80) {
        health.recommendations.push('Consider increasing cache size or implementing more aggressive cleanup');
      }
      if (health.components.memory.details.utilizationPercentage > 70) {
        health.recommendations.push('Monitor memory usage - approaching limits');
      }
      if (!networkTest.success) {
        health.recommendations.push('Check Appwrite connectivity and configuration');
      }

    } catch (error) {
      health.overall = 'error';
      health.error = error.message;
    }

    return health;
  }

  // ======================
  // Remaining methods with backward compatibility...
  // ======================

  // Permission Builder
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

  // Admin Privilege Check
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
        const databases = await this.getDatabasesSafe(jwtToken);
        const result = await databases.listDocuments(
          process.env.APPWRITE_DB_ID,
          collectionId,
          queries
        );

        // Business event tracking
        await this.postHog.trackBusinessEvent('documents_listed', {
          collection_id: collectionId,
          documents_count: result.documents.length,
          total_count: result.total,
          queries_applied: queries.length
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
        const databases = await this.getDatabasesSafe(jwtToken);
        const result = await databases.getDocument(
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
        const databases = await this.getDatabasesSafe(jwtToken);
        const result = await databases.updateDocument(
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
        const databases = await this.getDatabasesSafe(jwtToken);
        const result = await databases.deleteDocument(
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
        const databases = await this.getDatabasesSafe(jwtToken);

        const queries = [Query.equal('userId', userId), ...additionalQueries];
        const result = await databases.listDocuments(
          process.env.APPWRITE_DB_ID,
          collectionId,
          queries
        );

        const deletedIds = [];
        const failedIds = [];

        for (const doc of result.documents) {
          try {
            await this.executeWithRetry(async () => {
              await databases.deleteDocument(
                process.env.APPWRITE_DB_ID,
                collectionId,
                doc.$id
              );
            }, { methodName: 'deleteUserDocuments_individual', documentId: doc.$id });

            deletedIds.push(doc.$id);
          } catch (err) {
            failedIds.push({ id: doc.$id, error: err.message });
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
          failedCount: failedIds.length,
          totalFound: result.documents.length,
          deletedIds,
          failedIds,
          successRate: result.documents.length > 0 ? 
            (deletedIds.length / result.documents.length) * 100 : 100
        };

        await this.postHog.trackBusinessEvent('user_documents_bulk_deleted', {
          collection_id: collectionId,
          documents_found: result.documents.length,
          documents_deleted: deletedIds.length,
          documents_failed: failedIds.length,
          deletion_success_rate: deletionResult.successRate
        }, userId);

        return deletionResult;
      }, context);
    }, { ...context, userId: jwtToken });
  }

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
          additional_users_count: additionalUsers.length,
          data_fields_count: Object.keys(data || {}).length
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
        // this.requireSystemUser(userInfo);

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

  // ======================
  // Testing & Debugging Utilities
  // ======================
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
        timestamp: new Date().toISOString(),
        healthScore: this.calculateHealthScore()
      };

    } catch (error) {
      this.connectionHealth.lastFailure = Date.now();
      this.connectionHealth.failureCount++;

      const networkAnalysis = this.analyzeNetworkError(error);
      const appwriteAnalysis = this.analyzeAppwriteError(error);

      await this.postHog.trackError(error, {
        methodName: 'testConnection',
        networkAnalysis,
        appwriteAnalysis,
        connectionHealth: this.connectionHealth
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        networkAnalysis,
        appwriteAnalysis,
        timestamp: new Date().toISOString(),
        healthScore: this.calculateHealthScore()
      };
    }
  }

  async emergencyJWTAnalysis(headers, requestId = 'emergency') {
    const fullReport = {
      timestamp: new Date().toISOString(),
      requestId,
      systemHealth: await this.getSystemHealth(),
      networkHealth: this.getNetworkHealth(),
      cacheStats: this.getCacheStats(),
      steps: [],
      finalResult: null,
      performanceMetrics: {
        startTime: Date.now()
      }
    };

    try {
      // Step 1: Connection test
      fullReport.steps.push({ step: 'connection_test', status: 'running', startTime: Date.now() });
      const connectionTest = await this.testConnection();
      const step1 = fullReport.steps[0];
      step1.status = connectionTest.success ? 'success' : 'failed';
      step1.result = connectionTest;
      step1.duration = Date.now() - step1.startTime;

      // Step 2: Header analysis
      fullReport.steps.push({ step: 'header_analysis', status: 'running', startTime: Date.now() });
      try {
        const token = extractJWTFromHeaders(headers);
        const step2 = fullReport.steps[1];
        step2.status = 'success';
        step2.result = { tokenExtracted: true, tokenLength: token.length };
        step2.duration = Date.now() - step2.startTime;

        // Step 3: JWT health check
        fullReport.steps.push({ step: 'jwt_health_check', status: 'running', startTime: Date.now() });
        const healthReport = await this.checkJWTHealth(token);
        const step3 = fullReport.steps[2];
        step3.status = healthReport.isValid ? 'success' : 'failed';
        step3.result = healthReport;
        step3.duration = Date.now() - step3.startTime;

        // Step 4: Detailed JWT debug
        fullReport.steps.push({ step: 'jwt_debug', status: 'running', startTime: Date.now() });
        const debugReport = await this.debugJWTIssue(headers, requestId);
        const step4 = fullReport.steps[3];
        step4.status = debugReport.issue ? 'failed' : 'success';
        step4.result = debugReport;
        step4.duration = Date.now() - step4.startTime;

      } catch (headerError) {
        const step2 = fullReport.steps[1];
        step2.status = 'failed';
        step2.result = { error: headerError.message };
        step2.duration = Date.now() - step2.startTime;
      }

      fullReport.finalResult = 'analysis_completed';

    } catch (error) {
      fullReport.finalResult = `analysis_failed: ${error.message}`;
    }

    fullReport.performanceMetrics.totalDuration = Date.now() - fullReport.performanceMetrics.startTime;
    return fullReport;
  }

  // ======================
  // Enhanced Diagnostics
  // ======================
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
        cacheSize: this.clientCache.size,
        cacheStats: this.getCacheStats()
      },
      systemHealth: await this.getSystemHealth(),
      tokenAnalysis: null,
      healthCheck: null,
      lastError: null,
      recommendations: []
    };

    try {
      // Token cleaning analysis
      const cleanedToken = this.cleanJWTToken(jwtToken);
      diagnostics.tokenAnalysis = {
        originalLength: jwtToken?.length || 0,
        cleanedLength: cleanedToken?.length || 0,
        cleaningRequired: cleanedToken !== jwtToken,
        isCleanable: !!cleanedToken
      };

      if (cleanedToken) {
        // Payload decode analysis
        const payloadResult = this.safeDecodeJWTPayload(cleanedToken);
        diagnostics.tokenAnalysis.payloadDecode = payloadResult;

        // Health check
        diagnostics.healthCheck = await this.checkJWTHealth(cleanedToken);
        
        // Recommendations based on analysis
        if (diagnostics.healthCheck.overallScore < 70) {
          diagnostics.recommendations.push('JWT health score is below recommended threshold');
        }
        if (diagnostics.tokenAnalysis.cleaningRequired) {
          diagnostics.recommendations.push('Token required cleaning - review token generation process');
        }
        if (payloadResult.success && payloadResult.payload) {
          const claimsErrors = this.validateJWTClaims(payloadResult.payload);
          if (claimsErrors.length > 0) {
            diagnostics.recommendations.push(`JWT claims issues: ${claimsErrors.join(', ')}`);
          }
        }
      } else {
        diagnostics.recommendations.push('Token could not be cleaned - likely corrupted');
      }

    } catch (error) {
      diagnostics.lastError = {
        message: error.message,
        timestamp: new Date().toISOString(),
        stack: error.stack?.split('\n').slice(0, 3)
      };
      diagnostics.recommendations.push('Diagnostic process encountered errors - contact support');
    }

    return diagnostics;
  }

  // ======================
  // Graceful Shutdown (Enhanced)
  // ======================
  async shutdown() {
    const shutdownStartTime = Date.now();
    this.log('AppwriteService shutdown initiated...');

    try {
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.log('Cleanup interval cleared');
      }

      // Wait for any pending creation locks
      if (this.creationLocks.size > 0) {
        this.log(`Waiting for ${this.creationLocks.size} pending client creation locks...`);
        await Promise.all(Array.from(this.creationLocks.values()));
        this.creationLocks.clear();
        this.log('All creation locks resolved');
      }

      // Clear cache
      const cacheSize = this.clientCache.size;
      this.clientCache.clear();
      this.log(`Cleared ${cacheSize} cached clients`);

      // Clear admin client
      this.adminClient = null;
      this.adminDatabases = null;
      this.log('Admin client references cleared');

      // Flush and shutdown PostHog
      await this.postHog.flush();
      await this.postHog.shutdown();
      this.log('PostHog service shutdown completed');

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
// Enhanced JWT Extract Helper
// ======================
export function extractJWTFromHeaders(headers) {
  const context = {
    methodName: 'extractJWTFromHeaders',
    timestamp: new Date().toISOString(),
    performanceMetrics: {
      startTime: Date.now()
    }
  };

  try {
    // Header existence check
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader) {
      const error = new Error('Authorization header is missing');
      console.error('JWT Extraction Error:', {
        error: error.message,
        availableHeaders: Object.keys(headers),
        headerCount: Object.keys(headers).length,
        context
      });
      throw error;
    }

    // Header format validation
    if (typeof authHeader !== 'string') {
      const error = new Error(`Invalid authorization header type: expected string, got ${typeof authHeader}`);
      console.error('JWT Extraction Error:', {
        error: error.message,
        headerType: typeof authHeader,
        headerValue: String(authHeader).slice(0, 50),
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
        startsWithBearer: authHeader.toLowerCase().startsWith('bearer'),
        context
      });
      throw error;
    }

    const token = authHeader.substring(7);

    // Token existence check after Bearer
    if (!token || token.trim() === '') {
      const error = new Error('JWT token is empty after Bearer prefix');
      console.error('JWT Extraction Error:', {
        error: error.message,
        fullHeader: authHeader,
        tokenAfterExtraction: `"${token}"`,
        context
      });
      throw error;
    }

    // Basic format validation (before cleaning)
    const basicTokenParts = token.split('.');
    if (basicTokenParts.length < 2 || basicTokenParts.length > 4) {
      const error = new Error(`JWT token format appears invalid (${basicTokenParts.length} parts) - expected 3 parts separated by dots`);
      
      const debugInfo = {
        error: error.message,
        tokenPartsCount: basicTokenParts.length,
        tokenLength: token.length,
        tokenSnippet: token.slice(0, 50) + '...',
        tokenParts: basicTokenParts.map((part, index) => ({
          partIndex: index,
          partLength: part.length,
          partSnippet: part.slice(0, 20) + (part.length > 20 ? '...' : ''),
          isEmpty: part.trim() === '',
          hasWhitespace: /\s/.test(part),
          hasSpecialChars: /[^A-Za-z0-9+/=_-]/.test(part)
        })),
        analysisHints: []
      };

      // Analysis hints
      if (basicTokenParts.length === 1) {
        debugInfo.analysisHints.push('No dots found - might not be a JWT');
        debugInfo.analysisHints.push('Could be a different type of token');
      } else if (basicTokenParts.length === 2) {
        debugInfo.analysisHints.push('Only 2 parts - missing signature or header');
      } else if (basicTokenParts.length > 3) {
        debugInfo.analysisHints.push('Too many parts - might be concatenated tokens');
        debugInfo.analysisHints.push('Check for double-encoding or URL encoding issues');
      }

      // Check for common issues
      if (token.includes(' ')) {
        debugInfo.analysisHints.push('Token contains spaces - likely formatting issue');
      }
      if (token.includes('\n') || token.includes('\r')) {
        debugInfo.analysisHints.push('Token contains newlines - likely copy-paste issue');
      }
      if (token.includes('%')) {
        debugInfo.analysisHints.push('Token might be URL encoded');
      }

      console.error('JWT Format Validation Failed:', debugInfo);
      throw error;
    }

    // Performance tracking
    context.performanceMetrics.extractionDuration = Date.now() - context.performanceMetrics.startTime;

    // Success log (only in debug mode)
    if (process.env.JWT_DEBUG_MODE === 'true') {
      console.log('JWT Successfully Extracted:', {
        tokenLength: token.length,
        partsCount: basicTokenParts.length,
        extractionDuration: context.performanceMetrics.extractionDuration,
        headerLength: authHeader.length,
        context
      });
    }

    return token;

  } catch (error) {
    // Enhanced error context
    context.performanceMetrics.extractionDuration = Date.now() - context.performanceMetrics.startTime;
    context.failed = true;
    
    // Re-throw with preserved context
    error.extractionContext = context;
    throw error;
  }
}

// Static property to hold singleton instance
AppwriteService.instance = null;

export default AppwriteService;