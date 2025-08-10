// src/services/appwrite/auth/AuthorizationExtractor.js

/**
 * Handles authorization header extraction and validation
 */
export class AuthorizationExtractor {
  constructor(logger = console.log) {
    this.log = logger;
  }

  /**
   * Extract JWT from headers
   * @param {Object} headers - Request headers
   * @returns {string} - Extracted JWT token
   * @throws {Error} - If extraction fails
   */
  extractJWT(headers) {
    const context = {
      methodName: 'extractJWT',
      timestamp: new Date().toISOString(),
      performanceMetrics: {
        startTime: Date.now()
      }
    };

    try {
      // Check header existence
      const authHeader = this.getAuthorizationHeader(headers);
      
      if (!authHeader) {
        const error = new Error('Authorization header is missing');
        this.logExtractionError(error, headers, context);
        throw error;
      }

      // Validate header type
      if (typeof authHeader !== 'string') {
        const error = new Error(
          `Invalid authorization header type: expected string, got ${typeof authHeader}`
        );
        this.logExtractionError(error, headers, context);
        throw error;
      }

      // Extract token from Bearer format
      const token = this.extractBearerToken(authHeader);
      
      if (!token) {
        const error = new Error('JWT token is empty after Bearer prefix');
        this.logExtractionError(error, headers, context);
        throw error;
      }

      // Basic format validation
      this.validateBasicFormat(token);

      // Performance tracking
      context.performanceMetrics.extractionDuration = 
        Date.now() - context.performanceMetrics.startTime;

      // Success logging (debug mode only)
      if (process.env.JWT_DEBUG_MODE === 'true') {
        this.logExtractionSuccess(token, context);
      }

      return token;

    } catch (error) {
      // Enhanced error context
      context.performanceMetrics.extractionDuration = 
        Date.now() - context.performanceMetrics.startTime;
      context.failed = true;
      
      // Re-throw with preserved context
      error.extractionContext = context;
      throw error;
    }
  }

  /**
   * Get authorization header from headers object
   * @private
   */
  getAuthorizationHeader(headers) {
    return headers.authorization || 
           headers.Authorization || 
           headers.AUTHORIZATION || 
           null;
  }

  /**
   * Extract Bearer token from authorization header
   * @private
   */
  extractBearerToken(authHeader) {
    // Check for Bearer prefix (case-insensitive)
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    
    if (!bearerMatch) {
      const error = new Error(
        'Invalid authorization header format. Expected: Bearer <token>'
      );
      error.headerPreview = authHeader.slice(0, 20) + '...';
      throw error;
    }

    const token = bearerMatch[1].trim();
    
    if (!token) {
      throw new Error('Token is empty after Bearer prefix');
    }

    return token;
  }

  /**
   * Validate basic JWT format
   * @private
   */
  validateBasicFormat(token) {
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      const error = new Error(
        `JWT token format appears invalid (${parts.length} parts) - expected 3 parts separated by dots`
      );
      
      error.debugInfo = this.generateFormatDebugInfo(token, parts);
      throw error;
    }

    // Check for empty parts
    parts.forEach((part, index) => {
      if (!part || part.trim() === '') {
        throw new Error(`JWT part ${index + 1} is empty`);
      }
    });
  }

  /**
   * Generate debug info for format errors
   * @private
   */
  generateFormatDebugInfo(token, parts) {
    const debugInfo = {
      tokenPartsCount: parts.length,
      tokenLength: token.length,
      tokenSnippet: token.slice(0, 50) + '...',
      tokenParts: parts.map((part, index) => ({
        partIndex: index,
        partLength: part.length,
        partSnippet: part.slice(0, 20) + (part.length > 20 ? '...' : ''),
        isEmpty: part.trim() === '',
        hasWhitespace: /\s/.test(part),
        hasSpecialChars: /[^A-Za-z0-9+/=_-]/.test(part)
      })),
      analysisHints: this.generateAnalysisHints(token, parts)
    };

    return debugInfo;
  }

  /**
   * Generate analysis hints for debugging
   * @private
   */
  generateAnalysisHints(token, parts) {
    const hints = [];

    if (parts.length === 1) {
      hints.push('No dots found - might not be a JWT');
      hints.push('Could be a different type of token');
    } else if (parts.length === 2) {
      hints.push('Only 2 parts - missing signature or header');
    } else if (parts.length > 3) {
      hints.push('Too many parts - might be concatenated tokens');
      hints.push('Check for double-encoding or URL encoding issues');
    }

    // Check for common issues
    if (token.includes(' ')) {
      hints.push('Token contains spaces - likely formatting issue');
    }
    if (token.includes('\n') || token.includes('\r')) {
      hints.push('Token contains newlines - likely copy-paste issue');
    }
    if (token.includes('%')) {
      hints.push('Token might be URL encoded');
    }
    if (token.includes('..')) {
      hints.push('Token contains consecutive dots - corruption likely');
    }

    return hints;
  }

  /**
   * Log extraction error with context
   * @private
   */
  logExtractionError(error, headers, context) {
    console.error('JWT Extraction Error:', {
      error: error.message,
      availableHeaders: Object.keys(headers),
      headerCount: Object.keys(headers).length,
      context
    });
  }

  /**
   * Log extraction success
   * @private
   */
  logExtractionSuccess(token, context) {
    const parts = token.split('.');
    this.log('JWT Successfully Extracted:', {
      tokenLength: token.length,
      partsCount: parts.length,
      extractionDuration: context.performanceMetrics.extractionDuration,
      context
    });
  }

  /**
   * Extract API key from headers
   * @param {Object} headers - Request headers
   * @returns {string|null} - API key or null
   */
  extractAPIKey(headers) {
    // Check various header formats for API key
    return headers['x-api-key'] || 
           headers['X-API-Key'] || 
           headers['X-Api-Key'] || 
           headers.apikey || 
           headers.apiKey || 
           null;
  }

  /**
   * Determine authentication type from headers
   * @param {Object} headers - Request headers
   * @returns {Object} - Auth type and token
   */
  determineAuthType(headers) {
    const authHeader = this.getAuthorizationHeader(headers);
    const apiKey = this.extractAPIKey(headers);

    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      try {
        const jwt = this.extractJWT(headers);
        return { type: 'jwt', token: jwt };
      } catch (error) {
        return { type: 'invalid', error: error.message };
      }
    }

    if (apiKey) {
      return { type: 'apiKey', token: apiKey };
    }

    return { type: 'none', token: null };
  }

  /**
   * Validate headers structure
   * @param {Object} headers - Headers to validate
   * @returns {Object} - Validation result
   */
  validateHeaders(headers) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!headers || typeof headers !== 'object') {
      result.isValid = false;
      result.errors.push('Headers must be an object');
      return result;
    }

    // Check for authorization
    const hasAuth = this.getAuthorizationHeader(headers) || this.extractAPIKey(headers);
    if (!hasAuth) {
      result.warnings.push('No authorization found in headers');
    }

    // Check for common issues
    if (headers.authorization && headers.Authorization) {
      result.warnings.push('Both authorization and Authorization headers present');
    }

    return result;
  }
}

// Export singleton instance and factory
let defaultInstance = null;

export function getDefaultExtractor(logger) {
  if (!defaultInstance) {
    defaultInstance = new AuthorizationExtractor(logger);
  }
  return defaultInstance;
}

// Export helper function for backward compatibility
export function extractJWTFromHeaders(headers) {
  const extractor = getDefaultExtractor(console.log);
  return extractor.extractJWT(headers);
}

export default AuthorizationExtractor;