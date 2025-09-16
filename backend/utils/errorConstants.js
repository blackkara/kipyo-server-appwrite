export const ERROR_CODES = {
  // Authentication Errors (1000-1099)
  JWT_TOKEN_MISSING: 'JWT_TOKEN_MISSING',
  JWT_TOKEN_INVALID: 'JWT_TOKEN_INVALID',
  JWT_TOKEN_EXPIRED: 'JWT_TOKEN_EXPIRED',
  USER_ID_EXTRACTION_FAILED: 'USER_ID_EXTRACTION_FAILED',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',

  // Validation Errors (1100-1199)
  REQUIRED_PARAMETER_MISSING: 'REQUIRED_PARAMETER_MISSING',
  INVALID_PARAMETER_TYPE: 'INVALID_PARAMETER_TYPE',
  INVALID_PARAMETER_VALUE: 'INVALID_PARAMETER_VALUE',
  UNAUTHORIZED_FIELD_DETECTED: 'UNAUTHORIZED_FIELD_DETECTED',
  PARAMETER_LENGTH_EXCEEDED: 'PARAMETER_LENGTH_EXCEEDED',
  PARAMETER_COUNT_EXCEEDED: 'PARAMETER_COUNT_EXCEEDED',
  PARAMETER_RANGE_INVALID: 'PARAMETER_RANGE_INVALID',

  // Profile Specific Errors (1200-1299)
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  PROFILE_UPDATE_FAILED: 'PROFILE_UPDATE_FAILED',
  PROFILE_ALREADY_EXISTS: 'PROFILE_ALREADY_EXISTS',
  PROFILE_CREATION_FAILED: 'PROFILE_CREATION_FAILED',
  PROFILE_USERNAME_INVALID: 'PROFILE_USERNAME_INVALID',

  // Image Upload Errors (1300-1399)
  IMAGE_FORMAT_INVALID: 'IMAGE_FORMAT_INVALID',
  IMAGE_NO_FACE_DETECTED: 'IMAGE_NO_FACE_DETECTED',
  IMAGE_INAPPROPRIATE_CONTENT: 'IMAGE_INAPPROPRIATE_CONTENT',
  IMAGE_UPLOAD_FAILED: 'IMAGE_UPLOAD_FAILED',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  PHOTO_NOT_FOUND: 'PHOTO_NOT_FOUND',
  IMAGE_DELETE_FAILED: 'IMAGE_DELETE_FAILED',

  // External Service Errors (1400-1499)
  GOOGLE_VISION_API_ERROR: 'GOOGLE_VISION_API_ERROR',
  S3_UPLOAD_ERROR: 'S3_UPLOAD_ERROR',
  S3_DELETE_ERROR: 'S3_DELETE_ERROR',
  DATABASE_OPERATION_FAILED: 'DATABASE_OPERATION_FAILED',

  // Timezone & Reset Security Errors (1500-1599)
  TIMEZONE_CHANGE_TOO_FREQUENT: 'TIMEZONE_CHANGE_TOO_FREQUENT',
  TIMEZONE_CHANGE_EXCESSIVE: 'TIMEZONE_CHANGE_EXCESSIVE',
  TIMEZONE_JUMP_SUSPICIOUS: 'TIMEZONE_JUMP_SUSPICIOUS',
  RESET_ATTEMPT_TOO_FREQUENT: 'RESET_ATTEMPT_TOO_FREQUENT',
  DATE_MANIPULATION_DETECTED: 'DATE_MANIPULATION_DETECTED',
  SUSPICIOUS_ACTIVITY_DETECTED: 'SUSPICIOUS_ACTIVITY_DETECTED',
  TIMEZONE_OFFSET_INVALID: 'TIMEZONE_OFFSET_INVALID',

  // General Errors (1600-1699)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

export const ERROR_MAPPINGS = {
  [ERROR_CODES.PROFILE_USERNAME_INVALID]: {
    statusCode: 401,
    type: 'general_unauthorized'
  },


  [ERROR_CODES.JWT_TOKEN_MISSING]: {
    statusCode: 401,
    type: 'general_unauthorized'
  },
  [ERROR_CODES.JWT_TOKEN_INVALID]: {
    statusCode: 401,
    type: 'general_unauthorized'
  },
  [ERROR_CODES.JWT_TOKEN_EXPIRED]: {
    statusCode: 401,
    type: 'general_unauthorized'
  },
  [ERROR_CODES.USER_ID_EXTRACTION_FAILED]: {
    statusCode: 401,
    type: 'general_unauthorized'
  },
  [ERROR_CODES.UNAUTHORIZED_ACCESS]: {
    statusCode: 403,
    type: 'general_forbidden'
  },

  [ERROR_CODES.REQUIRED_PARAMETER_MISSING]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.INVALID_PARAMETER_TYPE]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.INVALID_PARAMETER_VALUE]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.UNAUTHORIZED_FIELD_DETECTED]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.PARAMETER_LENGTH_EXCEEDED]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.PARAMETER_COUNT_EXCEEDED]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.PARAMETER_RANGE_INVALID]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },

  [ERROR_CODES.PROFILE_NOT_FOUND]: {
    statusCode: 404,
    type: 'general_not_found'
  },
  [ERROR_CODES.PROFILE_UPDATE_FAILED]: {
    statusCode: 500,
    type: 'processing_error'
  },

  [ERROR_CODES.IMAGE_FORMAT_INVALID]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.IMAGE_NO_FACE_DETECTED]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.IMAGE_INAPPROPRIATE_CONTENT]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.IMAGE_UPLOAD_FAILED]: {
    statusCode: 500,
    type: 'processing_error'
  },
  [ERROR_CODES.IMAGE_TOO_LARGE]: {
    statusCode: 413,
    type: 'general_argument_invalid'
  },
  [ERROR_CODES.PHOTO_NOT_FOUND]: {
    statusCode: 404,
    type: 'general_not_found'
  },
  [ERROR_CODES.IMAGE_DELETE_FAILED]: {
    statusCode: 500,
    type: 'processing_error'
  },

  [ERROR_CODES.GOOGLE_VISION_API_ERROR]: {
    statusCode: 500,
    type: 'processing_error'
  },
  [ERROR_CODES.S3_UPLOAD_ERROR]: {
    statusCode: 500,
    type: 'processing_error'
  },
  [ERROR_CODES.S3_DELETE_ERROR]: {
    statusCode: 500,
    type: 'processing_error'
  },
  [ERROR_CODES.DATABASE_OPERATION_FAILED]: {
    statusCode: 500,
    type: 'processing_error'
  },

  // Timezone & Reset Security Error Mappings
  [ERROR_CODES.TIMEZONE_CHANGE_TOO_FREQUENT]: {
    statusCode: 429, // Too Many Requests
    type: 'timezone_security_violation'
  },
  [ERROR_CODES.TIMEZONE_CHANGE_EXCESSIVE]: {
    statusCode: 429, // Too Many Requests
    type: 'timezone_security_violation'
  },
  [ERROR_CODES.TIMEZONE_JUMP_SUSPICIOUS]: {
    statusCode: 400,
    type: 'timezone_security_violation'
  },
  [ERROR_CODES.RESET_ATTEMPT_TOO_FREQUENT]: {
    statusCode: 429, // Too Many Requests
    type: 'reset_security_violation'
  },
  [ERROR_CODES.DATE_MANIPULATION_DETECTED]: {
    statusCode: 400,
    type: 'timezone_security_violation'
  },
  [ERROR_CODES.SUSPICIOUS_ACTIVITY_DETECTED]: {
    statusCode: 403, // Forbidden
    type: 'security_violation'
  },
  [ERROR_CODES.TIMEZONE_OFFSET_INVALID]: {
    statusCode: 400,
    type: 'general_argument_invalid'
  },

  [ERROR_CODES.INTERNAL_SERVER_ERROR]: {
    statusCode: 500,
    type: 'processing_error'
  },
  [ERROR_CODES.PROCESSING_ERROR]: {
    statusCode: 500,
    type: 'processing_error'
  },
  [ERROR_CODES.UNKNOWN_ERROR]: {
    statusCode: 500,
    type: 'processing_error'
  }
};

// Custom Error Class
export class AppError extends Error {
  constructor(errorCode, details = null, originalError = null) {
    const mapping = ERROR_MAPPINGS[errorCode];
    if (!mapping) {
      throw new Error(`Unknown error code: ${errorCode}`);
    }

    super(errorCode);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.statusCode = mapping.statusCode;
    this.type = mapping.type;
    this.details = details;
    this.originalError = originalError;
  }
}

// Error Handler Utility
export class ErrorHandler {
  static createResponse(error, requestId, duration) {
    if (error instanceof AppError) {
      return {
        success: false,
        code: error.statusCode,
        type: error.type,
        errorCode: error.errorCode,
        details: error.details,
        requestId: requestId,
        duration: duration
      };
    }

    // Fallback for unknown errors
    return {
      success: false,
      code: 500,
      type: 'processing_error',
      errorCode: ERROR_CODES.UNKNOWN_ERROR,
      details: error.message,
      requestId: requestId,
      duration: duration
    };
  }

  static handleControllerError(error, res, requestId, startTime) {
    const duration = Date.now() - startTime;
    const errorResponse = this.createResponse(error, requestId, duration);

    console.error(`[${requestId}] Error occurred:`, {
      errorCode: errorResponse.errorCode,
      details: errorResponse.details,
      duration: duration
    });

    return res.status(errorResponse.code).json(errorResponse);
  }
}