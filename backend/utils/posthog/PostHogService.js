import { PostHog } from 'posthog-node';

class PostHogService {
  constructor(config = {}) {
    const {
      apiKey = process.env.POSTHOG_API_KEY,
      host = process.env.POSTHOG_HOST || 'https://app.posthog.com',
      projectTag = process.env.POSTHOG_PROJECT_TAG || 'kipyo-api-appwrite',
      enabled = process.env.NODE_ENV !== 'test'
    } = config;

    if (!apiKey && enabled) {
      console.warn('PostHog API key not provided. Error tracking will be disabled.');
      this.enabled = false;
      return;
    }

    this.enabled = enabled;
    this.projectTag = projectTag;
    
    if (this.enabled) {
      this.client = new PostHog(apiKey, { 
        host,
        flushAt: 20,
        flushInterval: 10000
      });
    }
  }

  // ======================
  // Error Categorization
  // ======================
  categorizeError(error, context = {}) {
    const errorMessage = error.message || error.toString();
    const errorStack = error.stack || '';

    // Appwrite spesifik hata kategorileri
    if (errorMessage.includes('JWT validation failed')) {
      return {
        category: 'authentication',
        subcategory: 'jwt_validation',
        severity: 'high',
        userFacing: true
      };
    }

    if (errorMessage.includes('Authorization header is missing')) {
      return {
        category: 'authentication',
        subcategory: 'missing_auth_header',
        severity: 'high',
        userFacing: true
      };
    }

    if (errorMessage.includes('Invalid authorization header format')) {
      return {
        category: 'authentication',
        subcategory: 'invalid_auth_format',
        severity: 'medium',
        userFacing: true
      };
    }

    if (errorMessage.includes('Admin privileges required')) {
      return {
        category: 'authorization',
        subcategory: 'insufficient_privileges',
        severity: 'medium',
        userFacing: true
      };
    }

    if (errorMessage.includes('APPWRITE_DEV_KEY is not configured')) {
      return {
        category: 'configuration',
        subcategory: 'missing_dev_key',
        severity: 'critical',
        userFacing: false
      };
    }

    if (errorMessage.includes('Authentication is required')) {
      return {
        category: 'authentication',
        subcategory: 'no_auth_provided',
        severity: 'high',
        userFacing: true
      };
    }

    // Database işlem hataları
    if (errorStack.includes('listDocuments') || errorStack.includes('getDocument')) {
      return {
        category: 'database',
        subcategory: 'read_operation',
        severity: 'medium',
        userFacing: true
      };
    }

    if (errorStack.includes('updateDocument') || errorStack.includes('createDocument')) {
      return {
        category: 'database',
        subcategory: 'write_operation',
        severity: 'high',
        userFacing: true
      };
    }

    if (errorStack.includes('deleteDocument')) {
      return {
        category: 'database',
        subcategory: 'delete_operation',
        severity: 'high',
        userFacing: true
      };
    }

    // Network hataları
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      return {
        category: 'network',
        subcategory: 'connection_failed',
        severity: 'critical',
        userFacing: false
      };
    }

    if (errorMessage.includes('timeout')) {
      return {
        category: 'network',
        subcategory: 'timeout',
        severity: 'medium',
        userFacing: true
      };
    }

    // Genel kategoriler
    return {
      category: 'general',
      subcategory: 'unknown',
      severity: 'medium',
      userFacing: false
    };
  }

  // ======================
  // Error Tracking
  // ======================
  async trackError(error, context = {}) {
    if (!this.enabled) return;

    try {
      const errorCategory = this.categorizeError(error, context);
      const errorFingerprint = this.generateErrorFingerprint(error, context);

      const properties = {
        // Error details
        error_message: error.message || error.toString(),
        error_stack: error.stack || '',
        error_name: error.name || 'Error',
        
        // Categorization
        error_category: errorCategory.category,
        error_subcategory: errorCategory.subcategory,
        error_severity: errorCategory.severity,
        error_user_facing: errorCategory.userFacing,
        error_fingerprint: errorFingerprint,
        
        // Context
        method_name: context.methodName,
        collection_id: context.collectionId,
        document_id: context.documentId,
        user_id: context.userId,
        request_id: context.requestId,
        
        // System info
        project_tag: this.projectTag,
        node_env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        
        // Additional context
        ...context.additionalData
      };

      // User bilgisi varsa distinctive_id olarak kullan
      const distinctId = context.userId || context.requestId || 'anonymous';

      // PostHog capture'ı timeout ile sınırla ve hataları yakala
      await Promise.race([
        this.client.capture({
          distinctId,
          event: 'appwrite_error',
          properties
        }),
        new Promise((resolve) => setTimeout(resolve, 5000)) // 5 saniye timeout
      ]).catch(err => {
        console.error('[PostHog] Error tracking failed (non-blocking):', err.message || err);
      });

      // Kritik hataları ayrıca feature flag ile işaretle
      if (errorCategory.severity === 'critical') {
        await Promise.race([
          this.client.capture({
            distinctId,
            event: 'critical_appwrite_error',
            properties
          }),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]).catch(err => {
          console.error('[PostHog] Critical error tracking failed (non-blocking):', err.message || err);
        });
      }

    } catch (trackingError) {
      // Bu catch bloğu sadece backup, normalde üstteki catch'ler çalışacak
      console.error('[PostHog] Unexpected error in trackError (non-blocking):', trackingError.message || trackingError);
      // Hata olsa bile işlemi durdurmuyoruz
    }
  }

  // ======================
  // Performance Tracking
  // ======================
  async trackPerformance(methodName, duration, context = {}) {
    if (!this.enabled) return;

    try {
      const properties = {
        method_name: methodName,
        duration_ms: duration,
        collection_id: context.collectionId,
        document_count: context.documentCount,
        user_id: context.userId,
        request_id: context.requestId,
        project_tag: this.projectTag,
        timestamp: new Date().toISOString(),
        ...context.additionalData
      };

      const distinctId = context.userId || context.requestId || 'anonymous';

      // PostHog capture'ı timeout ile sınırla ve hataları yakala
      await Promise.race([
        this.client.capture({
          distinctId,
          event: 'appwrite_performance',
          properties
        }),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]).catch(err => {
        console.error('[PostHog] Performance tracking failed (non-blocking):', err.message || err);
      });

      // Yavaş işlemleri ayrıca işaretle (>5 saniye)
      if (duration > 5000) {
        await Promise.race([
          this.client.capture({
            distinctId,
            event: 'slow_appwrite_operation',
            properties
          }),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]).catch(err => {
          console.error('[PostHog] Slow operation tracking failed (non-blocking):', err.message || err);
        });
      }

    } catch (trackingError) {
      console.error('[PostHog] Unexpected error in trackPerformance (non-blocking):', trackingError.message || trackingError);
      // Hata olsa bile işlemi durdurmuyoruz
    }
  }

  // ======================
  // Business Events
  // ======================
  async trackBusinessEvent(eventName, properties = {}, userId = null) {
    if (!this.enabled) return;

    try {
      const enhancedProperties = {
        ...properties,
        project_tag: this.projectTag,
        timestamp: new Date().toISOString()
      };

      const distinctId = userId || 'anonymous';

      // PostHog capture'ı timeout ile sınırla ve hataları yakala
      await Promise.race([
        this.client.capture({
          distinctId,
          event: eventName,
          properties: enhancedProperties
        }),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]).catch(err => {
        console.error(`[PostHog] Business event '${eventName}' tracking failed (non-blocking):`, err.message || err);
      });

    } catch (trackingError) {
      console.error(`[PostHog] Unexpected error tracking '${eventName}' (non-blocking):`, trackingError.message || trackingError);
      // Hata olsa bile işlemi durdurmuyoruz
    }
  }

  // ======================
  // Helper Methods
  // ======================
  generateErrorFingerprint(error, context = {}) {
    const errorMessage = error.message || error.toString();
    const methodName = context.methodName || 'unknown';
    const collectionId = context.collectionId || 'unknown';
    
    // Unique olmayan detayları temizle (user ID, document ID, vs.)
    const cleanMessage = errorMessage
      .replace(/user: \w+/g, 'user: [USER_ID]')
      .replace(/document \w+/g, 'document [DOC_ID]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[UUID]')
      .replace(/\d+/g, '[NUMBER]');

    return `${methodName}:${collectionId}:${cleanMessage}`;
  }

  // ======================
  // Wrapper Methods
  // ======================
  async withTracking(methodName, asyncFunction, context = {}) {
    const startTime = Date.now();
    
    try {
      const result = await asyncFunction();
      
      // Başarılı işlem tracking
      const duration = Date.now() - startTime;
      await this.trackPerformance(methodName, duration, context);
      
      return result;
    } catch (error) {
      // Hata tracking
      await this.trackError(error, { ...context, methodName });
      throw error; // Hatayı yeniden fırlat
    }
  }

  // ======================
  // Batch Operations
  // ======================
  async flush() {
    if (!this.enabled || !this.client) return;
    
    try {
      // Flush işlemini timeout ile sınırla (10 saniye)
      await Promise.race([
        this.client.flush(),
        new Promise((resolve) => setTimeout(resolve, 10000))
      ]);
    } catch (error) {
      console.error('[PostHog] Flush failed (non-blocking):', error.message || error);
      // Flush hatası olsa bile işlemi durdurmuyoruz
    }
  }

  async shutdown() {
    if (!this.enabled || !this.client) return;
    
    try {
      // Shutdown işlemini timeout ile sınırla (15 saniye)
      await Promise.race([
        this.client.shutdown(),
        new Promise((resolve) => setTimeout(resolve, 15000))
      ]);
    } catch (error) {
      console.error('[PostHog] Shutdown failed (non-blocking):', error.message || error);
      // Shutdown hatası olsa bile uygulamayı durdurmuyoruz
    }
  }

  // ======================
  // Debug Methods
  // ======================
  isEnabled() {
    return this.enabled;
  }

  getProjectTag() {
    return this.projectTag;
  }
}

export default PostHogService;