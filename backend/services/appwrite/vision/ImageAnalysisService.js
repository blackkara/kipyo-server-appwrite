// src/services/appwrite/vision/ImageAnalysisService.js

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { 
  SAFETY_LEVELS, 
  ANALYSIS_EVENTS, 
  REJECTION_REASONS,
  ANALYSIS_LIMITS 
} from './ImageAnalysisConstants.js';

/**
 * Image Analysis Service using Google Cloud Vision API
 * Analyzes images for inappropriate content, safety, and face detection
 */
export class ImageAnalysisService {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.documentOps = dependencies.documentOperations;
    this.storageService = dependencies.storageService;
    this.performanceMonitor = dependencies.performanceMonitor;
    this.errorAnalyzer = dependencies.errorAnalyzer;
    this.postHog = dependencies.postHogService;
    this.config = dependencies.configManager;
    this.retryManager = dependencies.retryManager;
    
    // Initialize Vision client
    this.visionClient = null;
    this.initializeVisionClient();
    
    // Analysis cache (for recent results)
    this.analysisCache = new Map();
    this.maxCacheSize = 100;
    
    // Statistics
    this.stats = {
      totalAnalyzed: 0,
      rejected: 0,
      approved: 0,
      byReason: {},
      byType: {}
    };
  }

  /**
   * Initialize Google Cloud Vision client
   * @private
   */
  initializeVisionClient() {
    try {
      const projectId = this.config?.get('google.projectId') || process.env.GOOGLE_CLOUD_PROJECT_ID;
      const keyFilename = this.config?.get('google.keyFilename') || process.env.GOOGLE_CLOUD_KEY_FILE;
      const apiKey = this.config?.get('google.visionApiKey') || process.env.GOOGLE_VISION_API_KEY;
      
      const clientConfig = {
        projectId,
        ...(keyFilename && { keyFilename }),
        ...(apiKey && { apiKey })
      };
      
      this.visionClient = new ImageAnnotatorClient(clientConfig);
      this.log('Google Vision client initialized');
    } catch (error) {
      this.log('Failed to initialize Google Vision:', error.message);
      throw error;
    }
  }

  /**
   * Analyze image for safety and appropriateness
   * @param {Buffer|string} image - Image buffer or URL
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Analysis result
   */
  async analyzeImage(image, options = {}) {
    const context = {
      methodName: 'analyzeImage',
      imageType: Buffer.isBuffer(image) ? 'buffer' : 'url',
      timestamp: new Date().toISOString()
    };

    return this.executeAnalysis(async () => {
      // Check cache first
      const cacheKey = this.getCacheKey(image);
      const cachedResult = this.analysisCache.get(cacheKey);
      
      if (cachedResult && !options.forceRefresh) {
        this.log('Returning cached analysis result');
        return { ...cachedResult, cached: true };
      }

      // Prepare image for analysis
      const imageBuffer = await this.prepareImage(image);
      
      // Perform multiple analyses in parallel
      const [
        safeSearchResult,
        faceDetectionResult,
        labelDetectionResult,
        textDetectionResult
      ] = await Promise.all([
        this.performSafeSearch(imageBuffer),
        this.performFaceDetection(imageBuffer),
        options.includeLabels ? this.performLabelDetection(imageBuffer) : null,
        options.includeText ? this.performTextDetection(imageBuffer) : null
      ]);

      // Combine results
      const analysisResult = {
        safeSearch: safeSearchResult,
        faceDetection: faceDetectionResult,
        labels: labelDetectionResult,
        text: textDetectionResult,
        isAppropriate: this.evaluateAppropriateness(safeSearchResult),
        rejectionReasons: this.getRejectionReasons(safeSearchResult, faceDetectionResult, options),
        timestamp: new Date().toISOString()
      };

      // Cache result
      this.cacheAnalysis(cacheKey, analysisResult);

      // Update statistics
      this.updateStatistics(analysisResult);

      // Track event
      await this.trackAnalysisEvent(
        analysisResult.isAppropriate ? 
          ANALYSIS_EVENTS.IMAGE_APPROVED : 
          ANALYSIS_EVENTS.IMAGE_REJECTED,
        {
          is_appropriate: analysisResult.isAppropriate,
          has_face: faceDetectionResult.hasFace,
          rejection_reasons: analysisResult.rejectionReasons,
          safety_scores: safeSearchResult
        }
      );

      return analysisResult;

    }, context);
  }

  /**
   * Analyze profile photo
   * @param {string} jwtToken - User JWT token
   * @param {Buffer|string} image - Image to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Analysis result with profile-specific checks
   */
  async analyzeProfilePhoto(jwtToken, image, options = {}) {
    const context = {
      methodName: 'analyzeProfilePhoto',
      timestamp: new Date().toISOString()
    };

    return this.executeAnalysis(async () => {
      // Profile photos must have a face
      const analysisOptions = {
        ...options,
        requireFace: true,
        strictMode: true
      };

      // Perform analysis
      const result = await this.analyzeImage(image, analysisOptions);

      // Additional profile photo checks
      if (!result.faceDetection.hasFace) {
        result.isAppropriate = false;
        result.rejectionReasons.push(REJECTION_REASONS.NO_FACE_DETECTED);
      }

      // Check for multiple faces (group photos not allowed for profile)
      if (result.faceDetection.faceCount > 1) {
        result.isAppropriate = false;
        result.rejectionReasons.push(REJECTION_REASONS.MULTIPLE_FACES);
      }

      // Save analysis result to database
      if (options.saveResult) {
        await this.saveAnalysisResult(jwtToken, 'profile_photo', result);
      }

      // Track profile photo event
      await this.trackAnalysisEvent(
        ANALYSIS_EVENTS.PROFILE_PHOTO_ANALYZED,
        {
          is_appropriate: result.isAppropriate,
          has_single_face: result.faceDetection.faceCount === 1,
          rejection_count: result.rejectionReasons.length
        },
        jwtToken
      );

      return result;

    }, context);
  }

  /**
   * Batch analyze multiple images
   * @param {Array<Buffer|string>} images - Images to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} - Batch analysis results
   */
  async analyzeBatch(images, options = {}) {
    const context = {
      methodName: 'analyzeBatch',
      imageCount: images.length
    };

    return this.executeAnalysis(async () => {
      const results = {
        analyzed: [],
        approved: [],
        rejected: [],
        totalProcessed: 0
      };

      // Process images in parallel (with concurrency limit)
      const batchSize = options.batchSize || 5;
      for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(image => this.analyzeImage(image, options))
        );

        batchResults.forEach((result, index) => {
          const imageIndex = i + index;
          
          results.analyzed.push({
            index: imageIndex,
            result
          });

          if (result.isAppropriate) {
            results.approved.push(imageIndex);
          } else {
            results.rejected.push({
              index: imageIndex,
              reasons: result.rejectionReasons
            });
          }
        });

        results.totalProcessed += batch.length;
      }

      results.approvalRate = (results.approved.length / results.totalProcessed) * 100;

      // Track batch event
      await this.trackAnalysisEvent(
        ANALYSIS_EVENTS.BATCH_ANALYZED,
        {
          total_images: images.length,
          approved_count: results.approved.length,
          rejected_count: results.rejected.length,
          approval_rate: results.approvalRate
        }
      );

      return results;

    }, context);
  }

  /**
   * Moderate user uploaded content
   * @param {string} jwtToken - User JWT token
   * @param {string} contentId - Content ID (post, message, etc.)
   * @param {string} contentType - Type of content
   * @param {Buffer|string} image - Image to moderate
   * @returns {Promise<Object>} - Moderation result
   */
  async moderateContent(jwtToken, contentId, contentType, image) {
    const context = {
      methodName: 'moderateContent',
      contentId,
      contentType
    };

    return this.executeAnalysis(async () => {
      // Analyze image
      const analysisResult = await this.analyzeImage(image, {
        strictMode: contentType === 'profile_photo',
        includeLabels: true
      });

      // Create moderation record
      const moderationResult = {
        contentId,
        contentType,
        userId: jwtToken,
        analysisResult,
        moderationAction: this.determineModerationAction(analysisResult),
        moderatedAt: new Date().toISOString()
      };

      // Save moderation result
      await this.saveModerationResult(jwtToken, moderationResult);

      // Take action based on moderation
      if (moderationResult.moderationAction === 'block') {
        await this.blockContent(contentId, contentType, moderationResult);
      } else if (moderationResult.moderationAction === 'flag') {
        await this.flagContent(contentId, contentType, moderationResult);
      }

      // Track moderation event
      await this.trackAnalysisEvent(
        ANALYSIS_EVENTS.CONTENT_MODERATED,
        {
          content_id: contentId,
          content_type: contentType,
          moderation_action: moderationResult.moderationAction,
          is_appropriate: analysisResult.isAppropriate
        },
        jwtToken
      );

      return moderationResult;

    }, context);
  }

  // Private helper methods

  /**
   * Perform safe search detection
   * @private
   */
  async performSafeSearch(imageBuffer) {
    const [result] = await this.visionClient.safeSearchDetection(imageBuffer);
    const annotation = result.safeSearchAnnotation;
    
    return {
      adult: annotation.adult,
      spoof: annotation.spoof,
      medical: annotation.medical,
      violence: annotation.violence,
      racy: annotation.racy,
      scores: {
        adult: this.getLikelihoodScore(annotation.adult),
        spoof: this.getLikelihoodScore(annotation.spoof),
        medical: this.getLikelihoodScore(annotation.medical),
        violence: this.getLikelihoodScore(annotation.violence),
        racy: this.getLikelihoodScore(annotation.racy)
      }
    };
  }

  /**
   * Perform face detection
   * @private
   */
  async performFaceDetection(imageBuffer) {
    const [result] = await this.visionClient.faceDetection(imageBuffer);
    const faces = result.faceAnnotations;
    
    return {
      hasFace: faces.length > 0,
      faceCount: faces.length,
      faces: faces.map(face => ({
        confidence: face.detectionConfidence,
        emotions: {
          joy: face.joyLikelihood,
          sorrow: face.sorrowLikelihood,
          anger: face.angerLikelihood,
          surprise: face.surpriseLikelihood
        },
        attributes: {
          headwear: face.headwearLikelihood,
          blurred: face.blurredLikelihood
        }
      }))
    };
  }

  /**
   * Perform label detection
   * @private
   */
  async performLabelDetection(imageBuffer) {
    const [result] = await this.visionClient.labelDetection(imageBuffer);
    const labels = result.labelAnnotations;
    
    return labels.map(label => ({
      description: label.description,
      score: label.score,
      topicality: label.topicality
    }));
  }

  /**
   * Perform text detection
   * @private
   */
  async performTextDetection(imageBuffer) {
    const [result] = await this.visionClient.textDetection(imageBuffer);
    const texts = result.textAnnotations;
    
    if (texts.length === 0) return null;
    
    return {
      fullText: texts[0].description,
      hasText: true,
      wordCount: texts[0].description.split(/\s+/).length
    };
  }

  /**
   * Evaluate if image is appropriate
   * @private
   */
  evaluateAppropriateness(safeSearchResult) {
    const inappropriateLevels = ['LIKELY', 'VERY_LIKELY'];
    
    return !(
      inappropriateLevels.includes(safeSearchResult.adult) ||
      inappropriateLevels.includes(safeSearchResult.violence) ||
      inappropriateLevels.includes(safeSearchResult.racy) ||
      (safeSearchResult.medical === 'VERY_LIKELY') ||
      (safeSearchResult.spoof === 'VERY_LIKELY')
    );
  }

  /**
   * Get rejection reasons
   * @private
   */
  getRejectionReasons(safeSearchResult, faceDetectionResult, options) {
    const reasons = [];
    const inappropriateLevels = ['LIKELY', 'VERY_LIKELY'];

    if (inappropriateLevels.includes(safeSearchResult.adult)) {
      reasons.push(REJECTION_REASONS.ADULT_CONTENT);
    }
    if (inappropriateLevels.includes(safeSearchResult.violence)) {
      reasons.push(REJECTION_REASONS.VIOLENCE);
    }
    if (inappropriateLevels.includes(safeSearchResult.racy)) {
      reasons.push(REJECTION_REASONS.RACY_CONTENT);
    }
    if (safeSearchResult.medical === 'VERY_LIKELY') {
      reasons.push(REJECTION_REASONS.MEDICAL_CONTENT);
    }
    if (safeSearchResult.spoof === 'VERY_LIKELY') {
      reasons.push(REJECTION_REASONS.SPOOF_CONTENT);
    }

    if (options.requireFace && !faceDetectionResult.hasFace) {
      reasons.push(REJECTION_REASONS.NO_FACE_DETECTED);
    }

    return reasons;
  }

  /**
   * Determine moderation action
   * @private
   */
  determineModerationAction(analysisResult) {
    if (!analysisResult.isAppropriate) {
      // Check severity
      const severeReasons = [
        REJECTION_REASONS.ADULT_CONTENT,
        REJECTION_REASONS.VIOLENCE,
        REJECTION_REASONS.ILLEGAL_CONTENT
      ];
      
      const hasSevereContent = analysisResult.rejectionReasons.some(
        reason => severeReasons.includes(reason)
      );
      
      return hasSevereContent ? 'block' : 'flag';
    }
    
    return 'approve';
  }

  /**
   * Get likelihood score
   * @private
   */
  getLikelihoodScore(likelihood) {
    const scores = {
      'UNKNOWN': 0,
      'VERY_UNLIKELY': 1,
      'UNLIKELY': 2,
      'POSSIBLE': 3,
      'LIKELY': 4,
      'VERY_LIKELY': 5
    };
    return scores[likelihood] || 0;
  }

  /**
   * Prepare image for analysis
   * @private
   */
  async prepareImage(image) {
    if (Buffer.isBuffer(image)) {
      return image;
    }
    
    if (typeof image === 'string') {
      // If URL, download image
      if (image.startsWith('http')) {
        const response = await fetch(image);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      
      // If base64
      if (image.includes('base64')) {
        const base64Data = image.split(',')[1] || image;
        return Buffer.from(base64Data, 'base64');
      }
    }
    
    throw new Error('Invalid image format');
  }

  /**
   * Cache analysis result
   * @private
   */
  cacheAnalysis(key, result) {
    if (this.analysisCache.size >= this.maxCacheSize) {
      const firstKey = this.analysisCache.keys().next().value;
      this.analysisCache.delete(firstKey);
    }
    
    this.analysisCache.set(key, {
      ...result,
      cachedAt: Date.now()
    });
  }

  /**
   * Get cache key for image
   * @private
   */
  getCacheKey(image) {
    if (Buffer.isBuffer(image)) {
      // Use first 1KB of buffer for key
      return `buffer_${image.slice(0, 1024).toString('base64').substring(0, 50)}`;
    }
    return `url_${image.substring(0, 100)}`;
  }

  /**
   * Save analysis result to database
   * @private
   */
  async saveAnalysisResult(jwtToken, type, result) {
    if (!this.documentOps) return;
    
    return this.documentOps.createDocument(
      jwtToken,
      'image_analyses',
      'unique()',
      {
        type,
        result,
        isAppropriate: result.isAppropriate,
        rejectionReasons: result.rejectionReasons,
        analyzedAt: result.timestamp
      }
    );
  }

  /**
   * Save moderation result
   * @private
   */
  async saveModerationResult(jwtToken, result) {
    if (!this.documentOps) return;
    
    return this.documentOps.createDocument(
      jwtToken,
      'content_moderations',
      'unique()',
      result
    );
  }

  /**
   * Block content
   * @private
   */
  async blockContent(contentId, contentType, moderationResult) {
    this.log(`Blocking ${contentType} ${contentId}:`, moderationResult.analysisResult.rejectionReasons);
    // Implement blocking logic based on content type
  }

  /**
   * Flag content for review
   * @private
   */
  async flagContent(contentId, contentType, moderationResult) {
    this.log(`Flagging ${contentType} ${contentId} for review`);
    // Implement flagging logic
  }

  /**
   * Update statistics
   * @private
   */
  updateStatistics(result) {
    this.stats.totalAnalyzed++;
    
    if (result.isAppropriate) {
      this.stats.approved++;
    } else {
      this.stats.rejected++;
      
      result.rejectionReasons.forEach(reason => {
        if (!this.stats.byReason[reason]) {
          this.stats.byReason[reason] = 0;
        }
        this.stats.byReason[reason]++;
      });
    }
  }

  /**
   * Execute analysis with error handling
   * @private
   */
  async executeAnalysis(operation, context) {
    try {
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

      this.log(`Image analysis failed: ${error.message}`, context);
      throw error;
    }
  }

  /**
   * Track analysis event
   * @private
   */
  async trackAnalysisEvent(eventName, data, userId = 'system') {
    if (!this.postHog) return;
    
    try {
      await this.postHog.trackBusinessEvent(eventName, data, userId);
    } catch (error) {
      this.log('Failed to track analysis event:', error.message);
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      approvalRate: this.stats.totalAnalyzed > 0 ?
        (this.stats.approved / this.stats.totalAnalyzed) * 100 : 0,
      cacheSize: this.analysisCache.size
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    const size = this.analysisCache.size;
    this.analysisCache.clear();
    this.log(`Cleared ${size} cached analysis results`);
    return size;
  }
}

export default ImageAnalysisService;