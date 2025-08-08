import { Client, Databases, Account, Query, Permission, Role } from 'node-appwrite';
import PostHogService from './utils/posthog/PostHogService.js';

class AppwriteService {
  constructor(logger, postHogConfig = {}) {
    this.log = logger || console.log;
    this.postHog = new PostHogService(postHogConfig);
    
    // Client cache - key: auth token, value: { client, lastUsed, databases, account }
    this.clientCache = new Map();
    this.maxCacheSize = 50; // Maksimum cache boyutu
    this.cacheTimeout = 30 * 60 * 1000; // 30 dakika (milisaniye)
    
    // Admin client singleton
    this.adminClient = null;
    this.adminDatabases = null;
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // 10 dakikada bir
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
  async validateJWT(jwtToken) {
    this.log(`Validating JWT token: ${jwtToken}`);
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

    // İlk kontrol: Token varlığı
    if (!jwtToken) {
      const err = new Error('JWT token is missing');
      await this.postHog.trackError(err, context);
      throw err;
    }

    // JWT format kontrolü
    const tokenParts = jwtToken.split('.');
    if (tokenParts.length !== 3) {
      const err = new Error('JWT token format is invalid (not 3 parts)');
      await this.postHog.trackError(err, {
        ...context,
        additionalData: {
          ...context.additionalData,
          tokenParts: tokenParts.length,
          formatError: 'Invalid JWT structure'
        }
      });
      throw err;
    }

    // JWT payload decode (debug için)
    let decodedPayload = null;
    try {
      const payload = tokenParts[1];
      decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch (decodeError) {
      this.log(`Warning: Could not decode JWT payload for debugging: ${decodeError.message}`);
    }

    try {
      const account = this.getAccount(jwtToken);
      const user = await account.get();

      const result = {
        ...user,
        userId: user.$id,
      };

      const duration = Date.now() - startTime;

      // Başarılı authentication tracking
      await this.postHog.trackBusinessEvent('user_authenticated', {
        user_id: result.userId,
        authentication_method: 'jwt',
        validation_duration_ms: duration,
        token_length: jwtToken.length
      }, result.userId);

      // Başarılı validation log
      this.log(`JWT validation successful for user ${result.userId} (${duration}ms)`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Katman 1: Appwrite error meta
      const appwriteMeta = {
        appwriteCode: error.code || null,
        appwriteType: error.type || null,
        appwriteMessage: error.message || null,
        appwriteResponse: error.response || null,
        httpStatus: error.response?.status || null
      };

      // Katman 2: Request meta
      const requestMeta = {
        endpoint: process.env.APPWRITE_END_POINT,
        projectId: process.env.APPWRITE_PROJECT_ID,
        method: 'account.get',
        tokenSnippet: jwtToken.slice(0, 12) + '...' + jwtToken.slice(-4),
        tokenLength: jwtToken.length,
        tokenParts: tokenParts.length,
        validationDuration: duration
      };

      // Katman 3: JWT payload analizi (eğer decode edilebilmişse)
      const jwtMeta = decodedPayload ? {
        jwtIssuer: decodedPayload.iss || null,
        jwtAudience: decodedPayload.aud || null,
        jwtExpiration: decodedPayload.exp ? new Date(decodedPayload.exp * 1000).toISOString() : null,
        jwtIssuedAt: decodedPayload.iat ? new Date(decodedPayload.iat * 1000).toISOString() : null,
        jwtUserId: decodedPayload.userId || decodedPayload.sub || null,
        jwtSessionId: decodedPayload.sessionId || null,
        isExpired: decodedPayload.exp ? Date.now() > (decodedPayload.exp * 1000) : null
      } : { jwtDecodeError: 'Could not decode JWT payload' };

      // Katman 4: Potansiyel sebep analizi (geliştirilmiş)
      let probableCause = 'Unknown';
      let debugSuggestions = [];

      if (error.code === 401) {
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
      } else if (error.message?.toLowerCase().includes('network') || 
                 error.message?.toLowerCase().includes('connection')) {
        probableCause = 'Network Connection Error';
        debugSuggestions.push('Check network connectivity to Appwrite endpoint');
        debugSuggestions.push('Verify endpoint URL is correct');
      }

      // Katman 5: Cache bilgisi
      const cacheMeta = {
        isCachedClient: this.clientCache.has(jwtToken),
        cacheSize: this.clientCache.size,
        cacheHitInfo: this.clientCache.has(jwtToken) ? 
          `Last used: ${new Date(this.clientCache.get(jwtToken).lastUsed).toISOString()}` : 'No cache entry'
      };

      // Full error tracking
      const enhancedContext = {
        ...context,
        appwriteMeta,
        requestMeta,
        jwtMeta,
        cacheMeta,
        probableCause,
        debugSuggestions,
        additionalData: {
          ...context.additionalData,
          errorAnalysis: 'Enhanced JWT validation debugging'
        }
      };

      await this.postHog.trackError(error, enhancedContext);

      // Detaylı log (sadece development/staging'de)
      if (process.env.NODE_ENV !== 'production') {
        this.log('JWT Validation Failed - Debug Info:', {
          probableCause,
          debugSuggestions,
          appwriteError: appwriteMeta,
          jwtInfo: jwtMeta,
          requestInfo: requestMeta
        });
      }

      // Enriched error message
      const errorMessage = [
        `JWT validation failed: ${probableCause}`,
        `Code: ${error.code || 'N/A'}`,
        `Duration: ${duration}ms`,
        debugSuggestions.length > 0 ? `Suggestion: ${debugSuggestions[0]}` : null
      ].filter(Boolean).join(' | ');

      throw new Error(errorMessage);
    }
  }

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
        const isJWTValidationError = error.message.includes('JWT validation failed');
        
        await this.postHog.trackError(error, {
          ...context,
          additionalData: {
            ...context.additionalData,
            errorType: isHeaderError ? 'header_extraction' : 'jwt_validation',
            isHeaderError,
            isJWTValidationError
          }
        });
        
        throw error;
      }
    }, { ...context, userId: requestId });
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
  // requireSystemUser(userInfo) {
  //   const context = {
  //     methodName: 'requireSystemUser',
  //     userId: userInfo?.userId,
  //     additionalData: { isSystemUser: userInfo?.isSystemUser }
  //   };

  //   try {
  //     if (!userInfo.isSystemUser) {
  //       throw new Error('Unauthorized: Admin privileges required');
  //     }
  //   } catch (error) {
  //     this.postHog.trackError(error, context);
  //     throw error;
  //   }
  // }

  // ======================
  // User-Level Actions (unchanged)
  // ======================
  async listDocuments(jwtToken, collectionId, queries = []) {
    const context = {
      methodName: 'listDocuments',
      collectionId,
      additionalData: { queriesCount: queries.length }
    };

    return this.postHog.withTracking('listDocuments', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      const result = await this.getDatabases(jwtToken).listDocuments(
        process.env.APPWRITE_DB_ID,
        collectionId,
        queries
      );

      // Business event tracking
      await this.postHog.trackBusinessEvent('documents_listed', {
        collection_id: collectionId,
        documents_count: result.documents.length,
        total_count: result.total
      }, userInfo.userId);

      return result;
    }, { ...context, userId: jwtToken });
  }

  async getDocument(jwtToken, collectionId, documentId) {
    const context = { 
      methodName: 'getDocument', 
      collectionId, 
      documentId
    };

    return this.postHog.withTracking('getDocument', async () => {
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
    }, { ...context, userId: jwtToken });
  }

  async deleteDocument(jwtToken, collectionId, documentId) {
    const context = { 
      methodName: 'deleteDocument', 
      collectionId, 
      documentId
    };

    return this.postHog.withTracking('deleteDocument', async () => {
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
    }, { ...context, userId: jwtToken });
  }

  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    const context = { 
      methodName: 'deleteUserDocuments', 
      collectionId,
      additionalData: { additionalQueriesCount: additionalQueries.length }
    };

    return this.postHog.withTracking('deleteUserDocuments', async () => {
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
          await this.getDatabases(jwtToken).deleteDocument(
            process.env.APPWRITE_DB_ID,
            collectionId,
            doc.$id
          );
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
    }, { ...context, userId: jwtToken });
  }

  // ======================
  // Admin-Level Actions
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
      const userInfo = await this.validateJWT(jwtToken);
      //this.requireSystemUser(userInfo);

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
  }

  async deleteDocumentWithAdminPrivileges(jwtToken, collectionId, documentId) {
    const context = { 
      methodName: 'deleteDocumentWithAdminPrivileges', 
      collectionId, 
      documentId
    };

    return this.postHog.withTracking('deleteDocumentWithAdminPrivileges', async () => {
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
    }, { ...context, userId: userInfo.userId });
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
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader) throw new Error('Authorization header is missing');
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format. Expected: Bearer <token>');
  }
  return authHeader.substring(7);
}

export default AppwriteService;