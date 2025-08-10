// src/services/appwrite/auth/JWTCleaner.js

/**
 * Handles JWT token cleaning and normalization
 */
export class JWTCleaner {
  constructor(logger = console.log) {
    this.log = logger;
  }

  /**
   * Clean and normalize JWT token
   * @param {string} rawToken - Raw token to clean
   * @returns {string|null} - Cleaned token or null if invalid
   */
  cleanToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    try {
      let cleaned = rawToken;

      // Step 1: Remove all whitespace
      cleaned = this.removeWhitespace(cleaned);

      // Step 2: Remove Bearer prefix if present
      cleaned = this.removeBearerPrefix(cleaned);

      // Step 3: Handle URL encoding
      cleaned = this.handleURLEncoding(cleaned);

      // Step 4: Fix dot issues
      cleaned = this.fixDotIssues(cleaned);

      // Step 5: Validate final format
      if (!this.validateJWTFormat(cleaned)) {
        return null;
      }

      return cleaned;
    } catch (error) {
      this.log('Token cleaning failed:', error.message);
      return null;
    }
  }

  /**
   * Remove all whitespace from token
   * @private
   */
  removeWhitespace(token) {
    return token
      .trim()
      .replace(/\s+/g, '')    // All whitespace
      .replace(/\n/g, '')     // Newlines
      .replace(/\r/g, '')     // Carriage returns
      .replace(/\t/g, '');    // Tabs
  }

  /**
   * Remove Bearer prefix
   * @private
   */
  removeBearerPrefix(token) {
    // Case-insensitive Bearer removal
    let cleaned = token.replace(/^Bearer\s+/i, '');
    
    // Handle URL-encoded Bearer
    if (cleaned.startsWith('Bearer%20')) {
      cleaned = decodeURIComponent(cleaned).replace('Bearer ', '');
    }
    
    return cleaned;
  }

  /**
   * Handle URL encoding issues
   * @private
   */
  handleURLEncoding(token) {
    if (!token.includes('%')) {
      return token;
    }

    try {
      const decoded = decodeURIComponent(token);
      // Check if decoded version is valid JWT format
      if (decoded !== token && decoded.split('.').length === 3) {
        return decoded;
      }
    } catch (e) {
      // URL decode failed, return original
    }

    return token;
  }

  /**
   * Fix dot-related issues
   * @private
   */
  fixDotIssues(token) {
    // Replace multiple consecutive dots with single dot
    return token.replace(/\.+/g, '.');
  }

  /**
   * Validate JWT format
   * @private
   */
  validateJWTFormat(token) {
    const parts = token.split('.');
    
    // Must have exactly 3 parts
    if (parts.length !== 3) {
      return false;
    }

    // Each part must be base64url format
    for (const part of parts) {
      if (!part || !/^[A-Za-z0-9_-]*$/.test(part)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Analyze cleaning requirements
   * @param {string} rawToken - Token to analyze
   * @returns {Object} - Analysis result
   */
  analyzeCleaningNeeds(rawToken) {
    const analysis = {
      needsCleaning: false,
      issues: [],
      originalLength: rawToken?.length || 0,
      cleanedLength: 0,
      cleaningSteps: []
    };

    if (!rawToken || typeof rawToken !== 'string') {
      analysis.issues.push('Token is not a valid string');
      return analysis;
    }

    // Check for whitespace
    if (/\s/.test(rawToken)) {
      analysis.needsCleaning = true;
      analysis.issues.push('Contains whitespace');
      analysis.cleaningSteps.push('Remove whitespace');
    }

    // Check for newlines
    if (/[\n\r]/.test(rawToken)) {
      analysis.needsCleaning = true;
      analysis.issues.push('Contains newlines');
      analysis.cleaningSteps.push('Remove newlines');
    }

    // Check for tabs
    if (/\t/.test(rawToken)) {
      analysis.needsCleaning = true;
      analysis.issues.push('Contains tabs');
      analysis.cleaningSteps.push('Remove tabs');
    }

    // Check for Bearer prefix
    if (/bearer/i.test(rawToken)) {
      analysis.needsCleaning = true;
      analysis.issues.push('Contains Bearer prefix');
      analysis.cleaningSteps.push('Remove Bearer prefix');
    }

    // Check for URL encoding
    if (/%/.test(rawToken)) {
      analysis.needsCleaning = true;
      analysis.issues.push('Contains URL encoding');
      analysis.cleaningSteps.push('Decode URL encoding');
    }

    // Check for consecutive dots
    if (/\.\./.test(rawToken)) {
      analysis.needsCleaning = true;
      analysis.issues.push('Contains consecutive dots');
      analysis.cleaningSteps.push('Fix dot issues');
    }

    // Try cleaning and get cleaned length
    const cleaned = this.cleanToken(rawToken);
    if (cleaned) {
      analysis.cleanedLength = cleaned.length;
      analysis.cleaningSuccessful = true;
    } else {
      analysis.cleaningSuccessful = false;
      analysis.issues.push('Token could not be cleaned successfully');
    }

    return analysis;
  }

  /**
   * Batch clean multiple tokens
   * @param {Array<string>} tokens - Array of tokens to clean
   * @returns {Array<Object>} - Results for each token
   */
  batchClean(tokens) {
    return tokens.map((token, index) => {
      const cleaned = this.cleanToken(token);
      return {
        index,
        original: token,
        cleaned,
        success: !!cleaned,
        needsCleaning: token !== cleaned
      };
    });
  }

  /**
   * Deep clean with multiple strategies
   * @param {string} rawToken - Token to deep clean
   * @returns {Object} - Cleaning result with strategies tried
   */
  deepClean(rawToken) {
    const result = {
      success: false,
      cleaned: null,
      strategiesAttempted: [],
      finalStrategy: null
    };

    // Strategy 1: Standard cleaning
    result.strategiesAttempted.push('standard');
    let cleaned = this.cleanToken(rawToken);
    if (cleaned) {
      result.success = true;
      result.cleaned = cleaned;
      result.finalStrategy = 'standard';
      return result;
    }

    // Strategy 2: Aggressive whitespace removal
    result.strategiesAttempted.push('aggressive_whitespace');
    cleaned = rawToken.replace(/[^A-Za-z0-9._-]/g, '');
    if (this.validateJWTFormat(cleaned)) {
      result.success = true;
      result.cleaned = cleaned;
      result.finalStrategy = 'aggressive_whitespace';
      return result;
    }

    // Strategy 3: Base64 repair attempt
    result.strategiesAttempted.push('base64_repair');
    cleaned = this.attemptBase64Repair(rawToken);
    if (cleaned && this.validateJWTFormat(cleaned)) {
      result.success = true;
      result.cleaned = cleaned;
      result.finalStrategy = 'base64_repair';
      return result;
    }

    return result;
  }

  /**
   * Attempt to repair base64 encoding issues
   * @private
   */
  attemptBase64Repair(token) {
    try {
      // Remove non-base64 characters
      let repaired = token.replace(/[^A-Za-z0-9+/=._-]/g, '');
      
      // Split by dots
      const parts = repaired.split('.');
      
      if (parts.length !== 3) {
        return null;
      }

      // Fix padding for each part
      const fixedParts = parts.map(part => {
        // Remove existing padding
        let cleaned = part.replace(/=+$/, '');
        
        // Add correct padding
        while (cleaned.length % 4 !== 0) {
          cleaned += '=';
        }
        
        return cleaned;
      });

      return fixedParts.join('.');
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate cleaning report
   * @param {string} rawToken - Token to analyze
   * @returns {Object} - Detailed cleaning report
   */
  generateCleaningReport(rawToken) {
    const report = {
      timestamp: new Date().toISOString(),
      input: {
        length: rawToken?.length || 0,
        snippet: rawToken ? rawToken.slice(0, 30) + '...' : null,
        type: typeof rawToken
      },
      analysis: this.analyzeCleaningNeeds(rawToken),
      cleaning: null,
      recommendations: []
    };

    if (rawToken) {
      const cleaned = this.cleanToken(rawToken);
      report.cleaning = {
        success: !!cleaned,
        outputLength: cleaned?.length || 0,
        lengthReduction: rawToken.length - (cleaned?.length || 0)
      };

      // Add recommendations
      if (!cleaned) {
        report.recommendations.push('Token appears corrupted beyond repair');
        report.recommendations.push('Request a new token from authentication service');
      } else if (cleaned !== rawToken) {
        report.recommendations.push('Review token generation process to avoid formatting issues');
        report.recommendations.push('Ensure proper token transmission without encoding issues');
      }
    }

    return report;
  }
}

// Export singleton instance
let defaultInstance = null;

export function getDefaultCleaner(logger) {
  if (!defaultInstance) {
    defaultInstance = new JWTCleaner(logger);
  }
  return defaultInstance;
}

export default JWTCleaner;