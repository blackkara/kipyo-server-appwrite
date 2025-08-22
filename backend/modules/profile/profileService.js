import AppwriteService from '../../services/appwrite/AppwriteService.js';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleAuth } from "google-auth-library";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from 'file-type';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { readFileSync } from 'fs';

import { ERROR_CODES, AppError } from '../../utils/errorConstants.js';
import { generatePhotoUrl, generatePhotoUrls } from '../../utils/photoUtils.js';

import TimezoneValidationTool from '../../utils/TimezoneValidationTool.js';
import ProfileUtils from './utils/ProfileUtils.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProfileService {

  isInappropriate(values) {
    for (let index = 0; index < values.length; index++) {
      if (this.isInappropriateSingle(values[index])) {
        return true;
      }
    }
    return false;
  }

  isInappropriateSingle(value) {
    return value === 'LIKELY' || value === 'VERY_LIKELY';
  }

  async updateProfile(jwtToken, userId, profileData, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting updateProfile for user: ${userId}`);

      // Validation
      this.validateProfileData(profileData);
      log(`[${requestId}] Validation passed for profile update`);

      const appwriteService = AppwriteService.getInstance();

      // Prepare update data - only include fields that are provided
      const updateData = {};

      if (profileData.passions !== undefined) {
        updateData.passions = profileData.passions;
      }

      if (profileData.habits !== undefined) {
        updateData.habits = profileData.habits;
      }

      if (profileData.relationStatus !== undefined) {
        updateData.relationStatus = profileData.relationStatus;
      }

      if (profileData.relationGoal !== undefined) {
        updateData.relationGoal = profileData.relationGoal;
      }

      if (profileData.height !== undefined) {
        updateData.height = profileData.height;
      }

      if (profileData.about !== undefined) {
        updateData.about = profileData.about;
      }

      if (profileData.birthDate !== undefined) {
        updateData.birthDate = profileData.birthDate;
      }

      if (profileData.gender !== undefined) {
        updateData.gender = profileData.gender;
      }

      log(`[${requestId}] Update data prepared: ${JSON.stringify(updateData)}`);

      // Update profile document
      const updatedProfile = await appwriteService.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        updateData
      );

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Profile updated successfully in ${operationDuration}ms`);

      return {
        profileId: updatedProfile.$id,
        updatedFields: Object.keys(updateData),
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in updateProfile: ${error.message}`);

      if (error instanceof AppError) {
        throw error;
      }

      // Handle database operation failures
      if (error.message.includes('Failed to update') ||
        error.message.includes('Database operation failed')) {
        throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, error.message, error);
      }

      throw new AppError(ERROR_CODES.PROCESSING_ERROR, error.message, error);
    }
  }

  async uploadPhoto(jwtToken, userId, imageBase64, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting uploadPhoto for user: ${userId}`);

      // Configuration
      const config = {
        maxSizeInBytes: 10 * 1024 * 1024, // 10MB limit
        maxSizeMB: 10,
        allowedFormats: ['image/jpeg'],
        requiredValidations: ['sizeValid', 'formatValid', 'hasFace', 'appropriate']
      };

      const result = {
        success: false,
        photoKey: null,
        photoUrl: null,
        totalPhotos: 0,
        config,
        validations: {
          sizeValid: false,
          formatValid: false,
          hasFace: false,
          inappropriate: true,
          safetyDetails: {
            adult: 'UNKNOWN',
            medical: 'UNKNOWN',
            spoof: 'UNKNOWN',
            violence: 'UNKNOWN'
          }
        },
        errors: [],
        operationDuration: 0
      };

      // Image size validation (base64 check)
      const imageSizeInBytes = (imageBase64.length * 3) / 4;
      const maxSizeInBytes = 10 * 1024 * 1024; // 10MB limit

      if (imageSizeInBytes > maxSizeInBytes) {
        result.errors.push({
          code: 'IMAGE_TOO_LARGE',
          message: `Image size (${Math.round(imageSizeInBytes / 1024 / 1024)}MB) exceeds maximum allowed size (${config.maxSizeMB}MB)`
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

      result.validations.sizeValid = true;
      log(`[${requestId}] Image size validation passed: ${Math.round(imageSizeInBytes / 1024)}KB`);

      // Convert base64 to buffer and validate image format
      let imageBuffer;
      try {
        imageBuffer = Buffer.from(imageBase64, 'base64');
        const fileInfo = await fileTypeFromBuffer(imageBuffer);

        if (!fileInfo || !config.allowedFormats.includes(fileInfo.mime)) {
          result.validations.formatValid = false;
          result.errors.push({
            code: 'IMAGE_FORMAT_INVALID',
            message: `Only ${config.allowedFormats.join(', ')} images are allowed`
          });
          result.operationDuration = Date.now() - operationStart;
          return result;
        }

        result.validations.formatValid = true;
        log(`[${requestId}] Image format validation passed`);
      } catch (formatError) {
        result.errors.push({
          code: 'IMAGE_PROCESSING_ERROR',
          message: 'Failed to process image data'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

      // Initialize Google Vision API
      let imageAnnotatorClient;
      try {
        const credentialsPath = join(__dirname, './googleAuth.json');
        const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
        const auth = new GoogleAuth({ credentials });
        imageAnnotatorClient = new ImageAnnotatorClient({ auth });
      } catch (authError) {
        result.errors.push({
          code: 'GOOGLE_VISION_AUTH_ERROR',
          message: 'Failed to initialize Google Vision API'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

      // Face detection
      try {
        const [faceDetectionResult] = await imageAnnotatorClient.faceDetection(imageBuffer);
        result.validations.hasFace = faceDetectionResult.faceAnnotations.length > 0;

        if (!result.validations.hasFace) {
          result.errors.push({
            code: 'IMAGE_NO_FACE_DETECTED',
            message: 'Image must contain at least one face'
          });
          log(`[${requestId}] Face detection failed - no faces found`);
        } else {
          log(`[${requestId}] Face detection passed`);
        }
      } catch (visionError) {
        result.errors.push({
          code: 'FACE_DETECTION_ERROR',
          message: 'Failed to perform face detection'
        });
        log(`[${requestId}] Face detection error: ${visionError.message}`);
      }

      // Safe search detection
      try {
        const [safeSearchDetectionResult] = await imageAnnotatorClient.safeSearchDetection(imageBuffer);
        const { adult, medical, spoof, violence } = safeSearchDetectionResult.safeSearchAnnotation;

        result.validations.safetyDetails = { adult, medical, spoof, violence };
        result.validations.inappropriate = this.isInappropriate([adult, medical, spoof, violence]);

        if (result.validations.inappropriate) {
          result.errors.push({
            code: 'IMAGE_INAPPROPRIATE_CONTENT',
            message: 'Image contains inappropriate content'
          });
          log(`[${requestId}] Safe search detection failed - inappropriate content detected`);
        } else {
          log(`[${requestId}] Safe search detection passed`);
        }
      } catch (safeSearchError) {
        result.errors.push({
          code: 'SAFE_SEARCH_ERROR',
          message: 'Failed to perform safety detection'
        });
        log(`[${requestId}] Safe search error: ${safeSearchError.message}`);
      }

      // Get current profile
      let profile;
      try {
        const appwriteService = AppwriteService.getInstance();
        profile = await appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId
        );

        if (!profile) {
          result.errors.push({
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found'
          });
          result.operationDuration = Date.now() - operationStart;
          return result;
        }

        log(`[${requestId}] Profile found, current photos count: ${profile.photos ? profile.photos.length : 0}`);
      } catch (dbError) {
        result.errors.push({
          code: 'DATABASE_OPERATION_FAILED',
          message: 'Failed to retrieve user profile'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

      // Check if all validations passed
      const allValidationsPassed = result.validations.sizeValid &&
        result.validations.formatValid &&
        result.validations.hasFace &&
        !result.validations.inappropriate;

      if (!allValidationsPassed) {
        result.operationDuration = Date.now() - operationStart;
        log(`[${requestId}] Upload skipped due to validation failures`);
        return result;
      }

      // All validations passed, proceed with upload
      const key = randomBytes(18).toString('hex').toUpperCase();

      // Upload to S3/DigitalOcean Spaces
      try {
        const spaces = new S3Client({
          endpoint: process.env.SPACES_ENDPOINT,
          region: process.env.SPACES_AWS_REGION,
          credentials: {
            accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
            secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
          },
          forcePathStyle: false,
        });

        const uploadCommand = new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: key,
          Body: imageBuffer,
          ACL: 'public-read',
          ContentType: 'image/jpeg'
        });

        await spaces.send(uploadCommand);
        log(`[${requestId}] Photo uploaded to S3 with key: ${key}`);
      } catch (s3Error) {
        result.errors.push({
          code: 'S3_UPLOAD_ERROR',
          message: 'Failed to upload image to storage'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

      // Update profile with new photo
      try {
        const appwriteService = AppwriteService.getInstance();
        const updatedPhotos = [...(profile.photos || []), key];

        await appwriteService.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId,
          { photos: updatedPhotos }
        );

        result.success = true;
        result.photoKey = key;
        result.photoUrl = this.generatePhotoUrl(key);
        result.totalPhotos = updatedPhotos.length;
        result.operationDuration = Date.now() - operationStart;

        log(`[${requestId}] Photo upload completed successfully in ${result.operationDuration}ms`);
        return result;

      } catch (updateError) {
        result.errors.push({
          code: 'PROFILE_UPDATE_FAILED',
          message: 'Failed to update user profile with new photo'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

    } catch (error) {
      log(`[${requestId}] UNEXPECTED ERROR in uploadPhoto: ${error.message}`);

      return {
        success: false,
        photoKey: null,
        photoUrl: null,
        totalPhotos: 0,
        validations: {
          sizeValid: false,
          formatValid: false,
          hasFace: false,
          inappropriate: true,
          safetyDetails: {
            adult: 'UNKNOWN',
            medical: 'UNKNOWN',
            spoof: 'UNKNOWN',
            violence: 'UNKNOWN'
          }
        },
        errors: [{
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred during photo upload'
        }],
        operationDuration: Date.now() - operationStart
      };
    }
  }

  async uploadPhoto2(jwtToken, userId, imageBase64, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting uploadPhoto for user: ${userId}`);

      // Image size validation (base64 check)
      const imageSizeInBytes = (imageBase64.length * 3) / 4; // Approximate base64 to bytes conversion
      const maxSizeInBytes = 10 * 1024 * 1024; // 10MB limit

      if (imageSizeInBytes > maxSizeInBytes) {
        throw new AppError(ERROR_CODES.IMAGE_TOO_LARGE,
          `Image size (${Math.round(imageSizeInBytes / 1024 / 1024)}MB) exceeds maximum allowed size (10MB)`);
      }

      log(`[${requestId}] Image size validation passed: ${Math.round(imageSizeInBytes / 1024)}KB`);

      // Convert base64 to buffer and validate image format
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const fileInfo = await fileTypeFromBuffer(imageBuffer);

      if (!fileInfo || fileInfo.mime !== 'image/jpeg') {
        throw new AppError(ERROR_CODES.IMAGE_FORMAT_INVALID, 'Only JPEG images are allowed');
      }

      log(`[${requestId}] Image format validation passed`);

      // Initialize Google Vision API
      const credentialsPath = join(__dirname, './googleAuth.json');
      const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
      const auth = new GoogleAuth({ credentials });
      const imageAnnotatorClient = new ImageAnnotatorClient({ auth });

      // Face detection
      try {
        const [faceDetectionResult] = await imageAnnotatorClient.faceDetection(imageBuffer);
        const hasFace = faceDetectionResult.faceAnnotations.length > 0;

        if (!hasFace) {
          throw new AppError(ERROR_CODES.IMAGE_NO_FACE_DETECTED, 'Image must contain at least one face');
        }

        log(`[${requestId}] Face detection passed`);

        // Safe search detection
        const [safeSearchDetectionResult] = await imageAnnotatorClient.safeSearchDetection(imageBuffer);
        const { adult, medical, spoof, violence } = safeSearchDetectionResult.safeSearchAnnotation;
        const inappropriate = this.isInappropriate([adult, medical, spoof, violence]);

        if (inappropriate) {
          throw new AppError(ERROR_CODES.IMAGE_INAPPROPRIATE_CONTENT, 'Image contains inappropriate content');
        }

        log(`[${requestId}] Safe search detection passed`);
      } catch (visionError) {
        if (visionError instanceof AppError) {
          throw visionError;
        }
        throw new AppError(ERROR_CODES.GOOGLE_VISION_API_ERROR, visionError.message, visionError);
      }

      const appwriteService = AppwriteService.getInstance();

      // Get current profile to check existing photos
      let profile;
      try {
        profile = await appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId
        );

        if (!profile) {
          throw new AppError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found');
        }
      } catch (dbError) {
        if (dbError instanceof AppError) {
          throw dbError;
        }
        throw new AppError(ERROR_CODES.DATABASE_OPERATION_FAILED, dbError.message, dbError);
      }

      log(`[${requestId}] Profile found, current photos count: ${profile.photos ? profile.photos.length : 0}`);

      // Generate unique key for the photo
      const key = randomBytes(18).toString('hex').toUpperCase();

      // Upload to S3/DigitalOcean Spaces
      try {
        const spaces = new S3Client({
          endpoint: process.env.SPACES_ENDPOINT,
          region: process.env.SPACES_AWS_REGION,
          credentials: {
            accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
            secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
          },
          forcePathStyle: false,
        });

        const uploadCommand = new PutObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: key,
          Body: imageBuffer,
          ACL: 'public-read',
          ContentType: 'image/jpeg'
        });

        await spaces.send(uploadCommand);
        log(`[${requestId}] Photo uploaded to S3 with key: ${key}`);
      } catch (s3Error) {
        throw new AppError(ERROR_CODES.S3_UPLOAD_ERROR, s3Error.message, s3Error);
      }

      // Update profile with new photo
      try {
        const updatedPhotos = [...(profile.photos || []), key];

        const updatedProfile = await appwriteService.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId,
          { photos: updatedPhotos }
        );

        const operationDuration = Date.now() - operationStart;
        log(`[${requestId}] Photo upload completed successfully in ${operationDuration}ms`);

        return {
          photoKey: key,
          photoUrl: this.generatePhotoUrl(key),
          totalPhotos: updatedPhotos.length,
          hasFace: true,
          inappropriate: false,
          safetyDetails: { adult: 'UNLIKELY', medical: 'UNLIKELY', spoof: 'UNLIKELY', violence: 'UNLIKELY' },
          operationDuration
        };
      } catch (updateError) {
        throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, updateError.message, updateError);
      }

    } catch (error) {
      log(`[${requestId}] ERROR in uploadPhoto: ${error.message}`);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(ERROR_CODES.IMAGE_UPLOAD_FAILED, error.message, error);
    }
  } // Photo URL helper method

  async deletePhoto(jwtToken, userId, photoKey, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting deletePhoto for user: ${userId}, photoKey: ${photoKey}`);

      // Photo key validation
      this.validatePhotoKey(photoKey);
      log(`[${requestId}] Photo key validation passed`);

      const appwriteService = AppwriteService.getInstance();

      // Get current profile to check existing photos
      let profile;
      try {
        profile = await appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId
        );

        if (!profile) {
          throw new AppError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found');
        }
      } catch (dbError) {
        if (dbError instanceof AppError) {
          throw dbError;
        }
        throw new AppError(ERROR_CODES.DATABASE_OPERATION_FAILED, dbError.message, dbError);
      }

      log(`[${requestId}] Profile found, current photos count: ${profile.photos ? profile.photos.length : 0}`);

      // Check if photo exists in user's photos
      const currentPhotos = profile.photos || [];
      if (!currentPhotos.includes(photoKey)) {
        throw new AppError(ERROR_CODES.PHOTO_NOT_FOUND, 'Photo not found in user profile');
      }

      log(`[${requestId}] Photo found in user profile`);

      // Delete from S3/DigitalOcean Spaces
      try {
        const spaces = new S3Client({
          endpoint: process.env.SPACES_ENDPOINT,
          region: process.env.SPACES_AWS_REGION,
          credentials: {
            accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
            secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
          },
          forcePathStyle: false,
        });

        // Import'ları dosyanın başına ekleyin:

        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: photoKey,
        });

        await spaces.send(deleteCommand);
        log(`[${requestId}] Photo deleted from S3 with key: ${photoKey}`);
      } catch (s3Error) {
        throw new AppError(ERROR_CODES.S3_DELETE_ERROR, s3Error.message, s3Error);
      }

      // Update profile - remove photo from array
      try {
        const updatedPhotos = currentPhotos.filter(key => key !== photoKey);

        const updatedProfile = await appwriteService.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId,
          { photos: updatedPhotos }
        );

        const operationDuration = Date.now() - operationStart;
        log(`[${requestId}] Photo deletion completed successfully in ${operationDuration}ms`);

        return {
          deletedPhotoKey: photoKey,
          deletedPhotoUrl: generatePhotoUrl(photoKey),
          remainingPhotos: updatedPhotos,
          remainingPhotoUrls: generatePhotoUrls(updatedPhotos),
          operationDuration
        };
      } catch (updateError) {
        throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, updateError.message, updateError);
      }

    } catch (error) {
      log(`[${requestId}] ERROR in deletePhoto: ${error.message}`);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(ERROR_CODES.IMAGE_DELETE_FAILED, error.message, error);
    }
  }
  generatePhotoUrl(photoKey) {
    const baseUrl = process.env.SPACES_CDN_ENDPOINT || process.env.SPACES_ENDPOINT;
    const bucket = process.env.SPACES_BUCKET;
    return `${baseUrl}/${bucket}/${photoKey}`;
  }

  // Multiple photos için helper


  validateProfileData(profileData) {
    // Security check - only allow whitelisted fields
    const allowedFields = ['passions', 'habits', 'relationStatus', 'relationGoal', 'height', 'about', 'birthDate', 'gender'];
    const providedFields = Object.keys(profileData);
    const unauthorizedFields = providedFields.filter(field => !allowedFields.includes(field));

    if (unauthorizedFields.length > 0) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED_FIELD_DETECTED,
        `Unauthorized fields: ${unauthorizedFields.join(', ')}`);
    }

    // Validate passions
    if (profileData.passions !== undefined) {
      if (!Array.isArray(profileData.passions)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_TYPE, 'passions must be an array');
      }

      if (profileData.passions.length > 10) {
        throw new AppError(ERROR_CODES.PARAMETER_COUNT_EXCEEDED, 'passions cannot exceed 10 items');
      }

      for (let i = 0; i < profileData.passions.length; i++) {
        if (typeof profileData.passions[i] !== 'string' || profileData.passions[i].trim() === '') {
          throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE,
            `passion at index ${i} must be a non-empty string`);
        }
      }
    }

    // Validate habits
    if (profileData.habits !== undefined) {
      if (!Array.isArray(profileData.habits)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_TYPE, 'habits must be an array');
      }

      if (profileData.habits.length > 10) {
        throw new AppError(ERROR_CODES.PARAMETER_COUNT_EXCEEDED, 'habits cannot exceed 10 items');
      }

      for (let i = 0; i < profileData.habits.length; i++) {
        if (typeof profileData.habits[i] !== 'string' || profileData.habits[i].trim() === '') {
          throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE,
            `habit at index ${i} must be a non-empty string`);
        }
      }
    }

    // Validate relationStatus
    if (profileData.relationStatus !== undefined) {
      if (typeof profileData.relationStatus !== 'string' || profileData.relationStatus.trim() === '') {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'relationStatus must be a non-empty string');
      }
    }

    // Validate relationGoal
    if (profileData.relationGoal !== undefined) {
      if (typeof profileData.relationGoal !== 'string' || profileData.relationGoal.trim() === '') {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'relationGoal must be a non-empty string');
      }
    }

    // Validate height
    if (profileData.height !== undefined) {
      if (typeof profileData.height !== 'number') {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_TYPE, 'height must be a number');
      }

      if (profileData.height < 100 || profileData.height > 220) {
        throw new AppError(ERROR_CODES.PARAMETER_RANGE_INVALID, 'height must be between 100 and 220 cm');
      }
    }

    // Validate about
    if (profileData.about !== undefined) {
      if (typeof profileData.about !== 'string') {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_TYPE, 'about must be a string');
      }

      if (profileData.about.length > 300) {
        throw new AppError(ERROR_CODES.PARAMETER_LENGTH_EXCEEDED, 'about cannot exceed 300 characters');
      }
    }
  }

  validatePhotoKey(photoKey) {
    // Photo key validation
    if (typeof photoKey !== 'string' || photoKey.trim() === '') {
      throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'photoKey must be a non-empty string');
    }

    // Check if photo key matches expected format (36 characters hex)
    const hexPattern = /^[A-F0-9]{36}$/;
    if (!hexPattern.test(photoKey)) {
      throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'photoKey format is invalid');
    }

    // Security check - prevent path traversal
    if (photoKey.includes('/') || photoKey.includes('\\') || photoKey.includes('..')) {
      throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'photoKey contains invalid characters');
    }
  }




  async getProfile(jwtToken, userId, requestId, log, requestedTimezone = null) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting getProfile for user: ${userId}`);

      const appwriteService = AppwriteService.getInstance();

      // Get profile document
      let profile;
      try {
        profile = await appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId
        );
      } catch (dbError) {
        if (dbError instanceof AppError) {
          throw dbError;
        }
        if (dbError.type === 'document_not_found') {
          throw new AppError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found');
        }
        throw new AppError(ERROR_CODES.DATABASE_OPERATION_FAILED, dbError.message, dbError);
      }

      log(`[${requestId}] Profile found for user: ${userId}`);
      // ===========================================
      // TIMEZONE VE RESET KONTROLÜ (YENİ)
      // ===========================================
      const timeZoneUpdateResult = await appwriteService.quotaManager.updateUserTimezone(jwtToken, userId, requestedTimezone);
      log(`[${requestId}] GetProfile pre validation - Remaining direct messages: ${profile.dailyDirectMessageRemaining}`);
      const profileCompletionStats = ProfileUtils.getProfileCompletionDetails(profile);
      Object.assign(profile, { profileCompletionStats: profileCompletionStats });

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Profile retrieved successfully in ${operationDuration}ms`);

      const quotas = await appwriteService.quotaManager.getAllQuotaStatuses(jwtToken, userId);
      Object.assign(profile, { quotaStatus: quotas });

      return profile;
    } catch (error) {
      log(`[${requestId}] ERROR in getProfile: ${error.message}`);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(ERROR_CODES.PROCESSING_ERROR, error.message, error);
    }
  }


  async useDirectMessageIfExists(jwtToken, userId, requestId, log, requestedTimezone = null) {
    try {
      const result = { usedDirectMessageCount: 0, remainingDirectMessages: 0, profile: null };
      result.profile = await this.getProfile(jwtToken, userId, requestId, log, requestedTimezone);
      log(`[${requestId}] USAGE - Remaining direct messages: ${result.profile.resetStats.newMessageCount}`);

      if (result.profile.resetStats.newMessageCount < 1) {
        return result; // No direct messages available
      } else {
        result.usedDirectMessageCount = 1;
        result.remainingDirectMessages = result.profile.resetStats.newMessageCount - 1;
      }


      const updateData = { dailyDirectMessageRemaining: result.profile.resetStats.newMessageCount - 1 };
      const appwriteService = AppwriteService.getInstance();
      const updatedProfile = await appwriteService.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        updateData
      );

      return result;
    } catch (error) {
      log(`[${requestId}] ERROR in useDirectMessageIfExists: ${error.message}`);
      throw error;
    }
  }
}

export default new ProfileService();  