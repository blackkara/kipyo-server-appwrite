// src/services/appwrite/auth/JWTAnalyzer.js

import { JWT_CONFIG } from '../utils/Constants.js';

/**
 * JWT token analysis and health checking
 */
export class JWTAnalyzer {
  constructor(logger = console.log, cleaner = null) {
    this.log = logger;
    this.cleaner = cleaner;
    this.config = JWT_CONFIG;
  }

  /**
   * Decode JWT payload safely
   * @param {string} jwtToken - JWT token to decode
   * @returns {Object} - Decode result
   */
  safeDecodePayload(jwtToken) {
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

      // Base64url format check
      if (!/^[A-Za-z0-9_-]*$/.test(payloadPart)) {
        decodeResult.error = 'Invalid base64url characters in JWT payload';
        return decodeResult;
      }

      // Add padding if needed
      let paddedPayload = payloadPart;
      while (paddedPayload.length % 4 !== 0) {
        paddedPayload += '=';
      }

      // Decode base64url
      const decodedString = Buffer.from(paddedPayload, 'base64url').toString();
      decodeResult.metadata.decodedStringLength = decodedString.length;

      // Memory safety check
      if (decodedString.length > this.config.maxPayloadSize) {
        decodeResult.error = `JWT payload too large: ${decodedString.length} bytes`;
        return decodeResult;
      }

      // Parse JSON
      const parsedPayload = JSON.parse(decodedString);
      decodeResult.success = true;
      decodeResult.payload = parsedPayload;

      // Add metadata
      decodeResult.metadata.payloadKeys = Object.keys(parsedPayload);
      decodeResult.metadata.payloadKeyCount = Object.keys(parsedPayload).length;

    } catch (error) {
      decodeResult.error = `Payload decode failed: ${error.message}`;
      decodeResult.metadata.decodeError = error.name;
    }

    return decodeResult;
  }

  /**
   * Validate JWT claims
   * @param {Object} payload - JWT payload
   * @param {string} expectedProjectId - Expected Appwrite project ID
   * @returns {Array<string>} - Validation errors
   */
  validateClaims(payload, expectedProjectId = process.env.APPWRITE_PROJECT_ID) {
    const errors = [];

    // Issuer validation
    if (payload.iss && !payload.iss.includes('appwrite')) {
      errors.push(`Unexpected issuer: ${payload.iss}`);
    }

    // Audience validation
    if (payload.aud && payload.aud !== expectedProjectId) {
      errors.push(`Audience mismatch - expected: ${expectedProjectId}, got: ${payload.aud}`);
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

    // Not before validation
    if (payload.nbf && Date.now() < (payload.nbf * 1000)) {
      const activeIn = Math.round(((payload.nbf * 1000) - Date.now()) / 1000);
      errors.push(`Token not yet valid (active in ${activeIn} seconds)`);
    }

    return errors;
  }

  /**
   * Perform comprehensive JWT health check
   * @param {string} jwtToken - Token to check
   * @returns {Object} - Health report
   */
  async checkHealth(jwtToken) {
    const healthReport = {
      isValid: false,
      overallScore: 0,
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
      if (this.cleaner) {
        const cleanedToken = this.cleaner.cleanToken(jwtToken);
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
        
        jwtToken = cleanedToken; // Use cleaned token for further checks
      } else {
        healthReport.overallScore += 15; // Give points if no cleaner
      }

      // Check 3: Format validation (20 points)
      const parts = jwtToken.split('.');
      healthReport.checks.hasThreeParts = parts.length === 3;
      healthReport.metadata.checksPerformed.push('format_validation');
      
      if (parts.length !== 3) {
        healthReport.errors.push(`JWT has ${parts.length} parts instead of 3`);
        return healthReport;
      }
      healthReport.overallScore += 20;

      // Check 4: Payload decode (15 points)
      const payloadDecodeResult = this.safeDecodePayload(jwtToken);
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
      const claimsErrors = this.validateClaims(payload);
      healthReport.checks.claimsValid = claimsErrors.length === 0;
      healthReport.metadata.checksPerformed.push('claims_validation');
      
      if (claimsErrors.length > 0) {
        healthReport.errors.push(...claimsErrors);
        healthReport.overallScore += Math.max(0, 15 - (claimsErrors.length * 5));
      } else {
        healthReport.overallScore += 15;
      }

      // Additional checks and warnings
      this.performAdditionalChecks(payload, healthReport);

      // Final assessment
      healthReport.isValid = healthReport.errors.length === 0;
      this.generateRecommendations(healthReport);

    } catch (error) {
      healthReport.errors.push(`Health check failed: ${error.message}`);
      healthReport.metadata.fatalError = error.message;
    }

    healthReport.metadata.totalChecks = healthReport.metadata.checksPerformed.length;
    return healthReport;
  }

  /**
   * Perform additional JWT checks
   * @private
   */
  performAdditionalChecks(payload, healthReport) {
    // Expiration time check
    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      const timeUntilExp = expDate.getTime() - Date.now();
      
      healthReport.checks.expirationTime = expDate.toISOString();
      healthReport.checks.timeUntilExpirationMs = timeUntilExp;
      healthReport.checks.isExpired = timeUntilExp <= 0;

      if (timeUntilExp > 0 && timeUntilExp < this.config.tokenExpiryWarning) {
        const minutes = Math.round(timeUntilExp / 60000);
        healthReport.warnings.push(`JWT expires soon (${minutes} minutes)`);
        healthReport.recommendations.push('Consider refreshing the token');
      }
    } else {
      healthReport.warnings.push('JWT has no expiration claim');
      healthReport.recommendations.push('Consider using tokens with expiration for security');
    }

    // Session ID check
    if (!payload.sessionId) {
      healthReport.warnings.push('JWT has no session ID');
    }

    // User ID format check
    const userId = payload.userId || payload.sub;
    if (userId) {
      healthReport.checks.hasUserId = true;
      healthReport.metadata.userId = userId;
    }

    // Issued at check
    if (payload.iat) {
      const issuedDate = new Date(payload.iat * 1000);
      const age = Date.now() - issuedDate.getTime();
      healthReport.checks.issuedAt = issuedDate.toISOString();
      healthReport.checks.tokenAgeMs = age;
      
      // Very old token warning
      if (age > 24 * 60 * 60 * 1000) { // 24 hours
        healthReport.warnings.push('Token is more than 24 hours old');
      }
    }

    // Add 15 points for passing additional checks
    if (healthReport.warnings.length === 0) {
      healthReport.overallScore += 15;
    }
  }

  /**
   * Generate recommendations based on health check
   * @private
   */
  generateRecommendations(healthReport) {
    if (healthReport.overallScore >= 90) {
      healthReport.recommendations.push('JWT is in excellent condition');
    } else if (healthReport.overallScore >= 70) {
      healthReport.recommendations.push('JWT is healthy with minor issues');
    } else if (healthReport.overallScore >= 50) {
      healthReport.recommendations.push('JWT has moderate issues that should be addressed');
    } else {
      healthReport.recommendations.push('JWT has significant issues requiring immediate attention');
    }
  }

  /**
   * Debug JWT issues
   * @param {Object} headers - Request headers
   * @param {string} requestId - Request identifier
   * @returns {Object} - Debug report
   */
  async debugJWTIssue(headers, requestId = 'debug', extractor = null) {
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
        headerCount: Object.keys(headers).length
      };

      debugReport.performanceMetrics.stepTimes.headerAnalysis = Date.now() - headerStepStart;

      if (!headers.authorization && !headers.Authorization) {
        debugReport.issue = 'missing_auth_header';
        debugReport.recommendations.push('Add Authorization header with Bearer token');
        return debugReport;
      }

      // Step 2: Token Extraction
      let extractedToken;
      if (extractor) {
        debugReport.step = 'token_extraction';
        const extractStepStart = Date.now();
        
        try {
          extractedToken = extractor.extractJWT(headers);
          debugReport.analysis.extraction = { 
            success: true, 
            tokenLength: extractedToken.length
          };
        } catch (extractionError) {
          debugReport.issue = 'token_extraction_failed';
          debugReport.analysis.extraction = {
            success: false,
            error: extractionError.message
          };
          return debugReport;
        }

        debugReport.performanceMetrics.stepTimes.tokenExtraction = Date.now() - extractStepStart;
      }

      // Continue with health check if token extracted
      if (extractedToken) {
        const healthReport = await this.checkHealth(extractedToken);
        debugReport.analysis.healthCheck = healthReport;
        
        if (!healthReport.isValid) {
          debugReport.issue = 'token_validation_failed';
          debugReport.recommendations.push(...healthReport.recommendations);
        }
      }

      return debugReport;

    } catch (error) {
      debugReport.issue = 'debug_process_failed';
      debugReport.analysis.fatalError = {
        message: error.message,
        step: debugReport.step
      };
      return debugReport;
    } finally {
      debugReport.performanceMetrics.totalDuration = Date.now() - debugReport.performanceMetrics.startTime;
    }
  }

  /**
   * Get JWT diagnostics
   * @param {string} jwtToken - Token to diagnose
   * @returns {Object} - Diagnostics report
   */
  async getDiagnostics(jwtToken) {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tokenAnalysis: null,
      healthCheck: null,
      recommendations: []
    };

    try {
      // Token cleaning analysis
      if (this.cleaner) {
        const cleanedToken = this.cleaner.cleanToken(jwtToken);
        diagnostics.tokenAnalysis = {
          originalLength: jwtToken?.length || 0,
          cleanedLength: cleanedToken?.length || 0,
          cleaningRequired: cleanedToken !== jwtToken,
          isCleanable: !!cleanedToken
        };

        if (cleanedToken) {
          jwtToken = cleanedToken;
        }
      }

      // Health check
      diagnostics.healthCheck = await this.checkHealth(jwtToken);
      
      // Generate recommendations
      if (diagnostics.healthCheck.overallScore < this.config.healthCheckScoreThreshold) {
        diagnostics.recommendations.push('JWT health score is below recommended threshold');
      }
      
      diagnostics.recommendations.push(...diagnostics.healthCheck.recommendations);

    } catch (error) {
      diagnostics.error = {
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }

    return diagnostics;
  }
}

export default JWTAnalyzer;