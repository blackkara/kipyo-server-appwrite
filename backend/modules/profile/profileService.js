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

import ProfileUtils from './utils/ProfileUtils.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { createQuery } = AppwriteService;
const Query = createQuery();

class ProfileService {

  async createProfile(jwtToken, userId, username, email, birthDate, createDate, gender, countryCode, timezoneOffset, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting createProfile for user: ${userId}`);

      const appwriteService = AppwriteService.getInstance();

      // Check if profile already exists
      try {
        const existingProfile = await appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId
        );

        if (existingProfile) {
          throw new AppError(ERROR_CODES.PROFILE_ALREADY_EXISTS, 'Profile already exists for this user');
        }
      } catch (dbError) {
        // If document not found, that's what we want - continue with creation
        if (dbError.type !== 'document_not_found') {
          throw new AppError(ERROR_CODES.DATABASE_OPERATION_FAILED, dbError.message, dbError);
        }
      }

      const profileData = await this.createFullProfile(jwtToken, userId, username, email, birthDate, createDate, gender, countryCode, timezoneOffset);

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Profile created successfully in ${operationDuration}ms`);

      return profileData;

    } catch (error) {
      log(`[${requestId}] ERROR in createProfile: ${error.message}`);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(ERROR_CODES.PROFILE_CREATION_FAILED, error.message, error);
    }
  }

  async getProfile(jwtToken, userId, requestId, log, requestedTimezone = null) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting getProfile for user: ${userId}`);

      const appwriteService = AppwriteService.getInstance();

      //const fullProfile = await this.getFullProfile(userId);

      // Get profile document
      let profile;
      try {
        profile = await this.getFullProfile(jwtToken, userId);
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
      const timeZoneUpdateResult = await appwriteService.quotaManager.updateUserTimezone(jwtToken, profile, 180);
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

  getPhotoValidationConfig() {
    return {
      maxSizeInBytes: 10 * 1024 * 1024, // 10MB limit
      maxSizeMB: 10,
      allowedFormats: ['image/jpeg'],
      requiredValidations: ['sizeValid', 'formatValid', 'hasFace', 'appropriate']
    };
  }

  async uploadPhotoOld(jwtToken, userId, imageBase64, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting uploadPhoto for user: ${userId}`);

      // Configuration
      const config = this.getPhotoValidationConfig();

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
      const maxSizeInBytes = config.maxSizeInBytes;

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

        const newMedia = await this.addProfileMedia(
          jwtToken,
          userId,
          profile.$id,
          'PHOTO',
          this.generatePhotoUrl(key),
          this.generatePhotoUrl(key)
        );


        result.success = true;
        result.photoKey = key;
        result.photoUrl = this.generatePhotoUrl(key);
        result.totalPhotos = (await this.getUserMediaWithOrder(jwtToken, userId)).length;
        result.operationDuration = Date.now() - operationStart;

        result.newMedia = {
          id: newMedia.$id,
          userId: newMedia.userId,
          mediaType: newMedia.mediaType,
          url: newMedia.url,
          displayOrder: newMedia.displayOrder,
          isActive: newMedia.isActive,
          thumbnailUrl: newMedia.thumbnailUrl,
          createdAt: newMedia.$createdAt,
          updatedAt: newMedia.$updatedAt
        };


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

  async deletePhoto(jwtToken, userId, photoKey, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting deletePhoto for user: ${userId}, photoKey: ${photoKey}`);
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

      // Get current media with order information
      const currentPhotos = await this.getUserMediaWithOrder(jwtToken, userId);

      // Find the media record to delete by photoKey ($id)
      const mediaToDelete = currentPhotos.find(media => media.$id === photoKey);

      // Check if photo exists in user's media
      if (!mediaToDelete) {
        throw new AppError(ERROR_CODES.PHOTO_NOT_FOUND, 'Photo not found in user profile');
      }

      log(`[${requestId}] Photo found in user profile media table`);

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

        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.SPACES_BUCKET,
          Key: photoKey,
        });

        await spaces.send(deleteCommand);
        log(`[${requestId}] Photo deleted from S3 with key: ${photoKey}`);
      } catch (s3Error) {
        throw new AppError(ERROR_CODES.S3_DELETE_ERROR, s3Error.message, s3Error);
      }

      // Delete from profile media table and update orders
      try {
        await this.deleteProfileMedia(jwtToken, userId, mediaToDelete.$id);
        log(`[${requestId}] Photo deleted from profile media table and orders updated`);

        // Get remaining media after deletion
        const remainingMedia = await this.getUserMediaWithOrder(jwtToken, userId);
        const remainingPhotoKeys = remainingMedia.map(media => media.$id);

        const operationDuration = Date.now() - operationStart;
        log(`[${requestId}] Photo deletion completed successfully in ${operationDuration}ms`);

        return {
          deletedPhotoKey: photoKey,
          deletedPhotoUrl: generatePhotoUrl(photoKey),
          remainingPhotos: remainingPhotoKeys,
          remainingPhotoUrls: generatePhotoUrls(remainingPhotoKeys),
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

  async deletePhotoOld(jwtToken, userId, photoKey, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting deletePhoto for user: ${userId}, photoKey: ${photoKey}`);

      // Photo key validation
      // this.validatePhotoKey(photoKey);
      // log(`[${requestId}] Photo key validation passed`);

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
      const currentPhotos = await this.getUserMediaWithOrder(jwtToken, userId);
      const currentPhotoKeys = currentPhotos.map(p => p.$id);

      // Check if photo exists in user's photos
      if (!currentPhotoKeys.includes(photoKey)) {
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

        await this.deleteProfileMedia(jwtToken, userId, photoKey);

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


  // getProfileMedia(profile.userId),
  // getProfilePreferences(profile.userId), 
  // getProfileQuotas(profile.userId),
  // getProfileModeration(profile.userId),
  // getProfileTimezone(profile.userId)

  async getFullProfile(jwtToken, userId) {
    const [profile, medias, preferences, quotas, moderation, timezone] = await Promise.all([
      this.getProfileData(jwtToken, userId),
      this.getProfileMedia(jwtToken, userId),
      this.getProfilePreferences(jwtToken, userId),
      this.getProfileQuotas(jwtToken, userId),
      this.getProfileModeration(jwtToken, userId),
      this.getProfileTimezoneTracking(jwtToken, userId)
    ]);

    return Object.assign(profile, {
      medias,
      preferences,
      quotas,
      moderation,
      timezoneTracking: timezone
    });
  }


  async createFullProfile(jwtToken, userId, username, email, birthDate, createDate, gender, countryCode, timezoneOffset) {
    const profileData = await this.createProfileData(jwtToken, userId, username, email, birthDate, createDate, gender, countryCode);

    const [profileTimezoneTracking, profileQuotaDirectMessage, profileQuotaTranslate] = await Promise.all([
      this.createProfileTimezoneTracking(jwtToken, userId, timezoneOffset, profileData.$id), // ✅
      this.createProfileQuota(jwtToken, userId, 'DIRECT_MESSAGE', 5, 5, profileData.$id), // ✅
      this.createProfileQuota(jwtToken, userId, 'TRANSLATE', 5, 5, profileData.$id) // ✅
    ]);

    return Object.assign(profileData, {
      quotas: [profileQuotaDirectMessage, profileQuotaTranslate],
      timezoneTracking: profileTimezoneTracking
    });
  }

  async createProfileData(jwtToken, userId, username, email, birthDate, createDate, gender, countryCode) {
    const appwriteService = AppwriteService.getInstance();
    return appwriteService.createDocumentWithAdminPrivileges(
      jwtToken,
      userId,
      process.env.DB_COLLECTION_PROFILES_ID,
      userId,
      { userId, username, email, birthDate, createDate, gender, countryCode },
      [
        { userId: userId, permissions: ['write', 'read', 'delete'] }
      ]
    );
  }

  async createProfileTimezoneTracking(jwtToken, userId, timezoneOffset, profileId) {
    const appwriteService = AppwriteService.getInstance();
    return appwriteService.createDocumentWithAdminPrivileges(
      jwtToken,
      userId,
      process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
      'unique()',
      { userId, timezoneOffset, profileRef: profileId },
      [
        { userId: userId, permissions: ['write', 'read', 'delete'] }
      ]
    );
  }

  async createProfileQuota(jwtToken, userId, quotaType, remainingCount, dailyLimit, profileId) {
    const appwriteService = AppwriteService.getInstance();
    return appwriteService.createDocumentWithAdminPrivileges(
      jwtToken,
      userId,
      process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
      'unique()',
      { userId, quotaType, remainingCount, dailyLimit, profileRef: profileId }, // ✅ profileId kullan
      [
        { userId: userId, permissions: ['write', 'read', 'delete'] }
      ]
    );
  }

  async getProfileData(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    return appwriteService.getDocument(
      jwtToken,
      process.env.DB_COLLECTION_PROFILES_ID,
      userId
    );
  }
  async getProfileMedia(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    const media = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
      [
        Query.equal('userId', userId),
      ]
    );
    return media.documents;
  }
  async getProfilePreferences(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    const preferences = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_PREFERENCES_ID,
      [
        Query.equal('userId', userId),
      ]
    );
    return preferences.documents.length > 0 ? preferences.documents[0] : null;
  }

  async getProfileQuotas(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    const quotas = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
      [
        Query.equal('userId', userId),
      ]
    );
    return quotas.documents;
  }

  async getProfileModeration(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    const moderation = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_MODERATION_ID,
      [
        Query.equal('userId', userId),
      ]
    );
    return moderation.documents.length > 0 ? moderation.documents[0] : null;
  }

  async getProfileTimezoneTracking(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    const timezone = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
      [
        Query.equal('userId', userId),
      ]
    );
    return timezone.documents.length > 0 ? timezone.documents[0] : null;
  }

  async getUserMediaWithOrder(jwtToken, userId) {
    const appwriteService = AppwriteService.getInstance();
    try {
      const media = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
        [
          Query.equal('userId', userId),
          Query.equal('isActive', true),
          Query.orderAsc('displayOrder')
        ]
      );
      return media.documents;
    } catch (error) {
      if (error.code === 401) {
        return []; // Yetki yoksa boş döndür
      }
      throw error;
    }
  }

  async getNextAvailableOrder(jwtToken, userId) {
    const existingMedia = await this.getUserMediaWithOrder(jwtToken, userId);

    if (existingMedia.length === 0) {
      return 1;
    }

    const maxOrder = Math.max(...existingMedia.map(m => m.displayOrder));
    return maxOrder + 1;
  }
  async addProfileMedia(jwtToken, userId, profileId, mediaType, url, thumbnailUrl = null) {
    const existingMedia = await this.getUserMediaWithOrder(userId, jwtToken);

    if (existingMedia.length >= 10) {
      throw new Error('Maksimum 10 fotoğraf ekleyebilirsiniz');
    }

    const displayOrder = await this.getNextAvailableOrder(jwtToken, userId);
    const appwriteService = AppwriteService.getInstance();
    return appwriteService.createDocumentWithAdminPrivileges(
      jwtToken,
      userId,
      process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
      'unique()',
      {
        userId,
        mediaType,
        url,
        displayOrder,
        isActive: true,
        thumbnailUrl,
        profileRef: profileId
      }, [
      { userId: userId, permissions: ['write', 'read', 'delete'] }
    ]
    );
  }
  async deleteProfileMedia(jwtToken, userId, mediaId) {
    const appwriteService = AppwriteService.getInstance();
    try {
      // 1. Silinecek media'yı bul
      const mediaToDelete = await appwriteService.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
        mediaId
      );

      if (!mediaToDelete || mediaToDelete.userId !== userId) {
        throw new Error('Media bulunamadı veya yetkiniz yok');
      }

      const deletedOrder = mediaToDelete.displayOrder;

      // 2. Media'yı tamamen sil (hard delete)
      await appwriteService.deleteDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
        mediaId
      );

      // 3. Silinen media'dan sonraki tüm media'ları bul ve order'larını güncelle
      const remainingMedia = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
        [
          Query.equal('userId', userId),
          Query.equal('isActive', true),
          Query.greaterThan('displayOrder', deletedOrder),
          Query.orderAsc('displayOrder')
        ]
      );

      // 4. Batch update ile order'ları yeniden düzenle
      const updatePromises = remainingMedia.documents.map(media =>
        appwriteService.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
          media.$id,
          {
            displayOrder: media.displayOrder - 1
          }
        )
      );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Delete profile media error:', error);
      throw error;
    }
  }


  // profileService.js'e eklenecek yeni metodlar

  async updateSpecificField(jwtToken, userId, fieldName, fieldValue, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting update for field: ${fieldName}`);

      const appwriteService = AppwriteService.getInstance();

      const updateData = { [fieldName]: fieldValue };

      const updatedProfile = await appwriteService.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        updateData
      );

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Field ${fieldName} updated successfully in ${operationDuration}ms`);

      return {
        profileId: updatedProfile.$id,
        updatedField: fieldName,
        newValue: fieldValue,
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in updateSpecificField: ${error.message}`);
      throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, error.message, error);
    }
  }

  async updateMultipleFields(jwtToken, userId, fields, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting update for fields: ${Object.keys(fields).join(', ')}`);

      const appwriteService = AppwriteService.getInstance();

      const updatedProfile = await appwriteService.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        fields
      );

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Multiple fields updated successfully in ${operationDuration}ms`);

      return {
        profileId: updatedProfile.$id,
        updatedFields: Object.keys(fields),
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in updateMultipleFields: ${error.message}`);
      throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, error.message, error);
    }
  }

  async updatePassions(jwtToken, userId, passions, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting passions update`);

      const appwriteService = AppwriteService.getInstance();

      // Önce mevcut preferences'ı kontrol et
      const preferences = await this.getProfilePreferences(jwtToken, userId);

      if (preferences) {
        // Preferences varsa güncelle
        await appwriteService.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_PREFERENCES_ID,
          preferences.$id,
          { passions: passions }
        );
      } else {
        // Preferences yoksa oluştur
        await appwriteService.createDocumentWithAdminPrivileges(
          jwtToken,
          userId,
          process.env.DB_COLLECTION_PROFILE_PREFERENCES_ID,
          'unique()',
          {
            userId,
            passions: passions,
            habits: [],
            profileRef: userId
          },
          [{ userId: userId, permissions: ['write', 'read', 'delete'] }]
        );
      }

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Passions updated successfully in ${operationDuration}ms`);

      return {
        userId,
        passions,
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in updatePassions: ${error.message}`);
      throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, error.message, error);
    }
  }

  async updateHabits(jwtToken, userId, habits, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting habits update`);

      const appwriteService = AppwriteService.getInstance();

      const preferences = await this.getProfilePreferences(jwtToken, userId);

      if (preferences) {
        await appwriteService.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_PREFERENCES_ID,
          preferences.$id,
          { habits: habits }
        );
      } else {
        await appwriteService.createDocumentWithAdminPrivileges(
          jwtToken,
          userId,
          process.env.DB_COLLECTION_PROFILE_PREFERENCES_ID,
          'unique()',
          {
            userId,
            passions: [],
            habits: habits,
            profileRef: userId
          },
          [{ userId: userId, permissions: ['write', 'read', 'delete'] }]
        );
      }

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Habits updated successfully in ${operationDuration}ms`);

      return {
        userId,
        habits,
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in updateHabits: ${error.message}`);
      throw new AppError(ERROR_CODES.PROFILE_UPDATE_FAILED, error.message, error);
    }
  }



  validateImageSize(imageBase64, config) {
    const imageSizeInBytes = (imageBase64.length * 3) / 4;

    if (imageSizeInBytes > config.maxSizeInBytes) {
      return {
        valid: false,
        error: {
          code: 'IMAGE_TOO_LARGE',
          message: `Image size (${Math.round(imageSizeInBytes / 1024 / 1024)}MB) exceeds maximum allowed size (${config.maxSizeMB}MB)`
        }
      };
    }

    return {
      valid: true,
      sizeInKB: Math.round(imageSizeInBytes / 1024)
    };
  }

  async validateImageFormat(imageBase64, config) {
    try {
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const fileInfo = await fileTypeFromBuffer(imageBuffer);

      if (!fileInfo || !config.allowedFormats.includes(fileInfo.mime)) {
        return {
          valid: false,
          buffer: imageBuffer,
          error: {
            code: 'IMAGE_FORMAT_INVALID',
            message: `Only ${config.allowedFormats.join(', ')} images are allowed`
          }
        };
      }

      return { valid: true, buffer: imageBuffer };
    } catch (error) {
      return {
        valid: false,
        error: {
          code: 'IMAGE_PROCESSING_ERROR',
          message: 'Failed to process image data'
        }
      };
    }
  }

  // 2. Google Vision API helper metodları
  async initializeVisionClient() {
    try {
      const credentialsPath = join(__dirname, './googleAuth.json');
      const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
      const auth = new GoogleAuth({ credentials });
      return new ImageAnnotatorClient({ auth });
    } catch (error) {
      throw {
        code: 'GOOGLE_VISION_AUTH_ERROR',
        message: 'Failed to initialize Google Vision API'
      };
    }
  }

  async detectFaces(imageBuffer, visionClient) {
    try {
      const [result] = await visionClient.faceDetection(imageBuffer);
      const hasFace = result.faceAnnotations.length > 0;

      if (!hasFace) {
        return {
          hasFace: false,
          error: {
            code: 'IMAGE_NO_FACE_DETECTED',
            message: 'Image must contain at least one face'
          }
        };
      }

      return { hasFace: true };
    } catch (error) {
      return {
        hasFace: false,
        error: {
          code: 'FACE_DETECTION_ERROR', message: 'Failed to perform face detection'
        }
      };
    }
  }

  async detectInappropriateContent(imageBuffer, visionClient) {
    try {
      const [result] = await visionClient.safeSearchDetection(imageBuffer);
      const { adult, medical, spoof, violence } = result.safeSearchAnnotation;

      const safetyDetails = { adult, medical, spoof, violence };
      const inappropriate = this.isInappropriate([adult, medical, spoof, violence]);

      if (inappropriate) {
        return {
          inappropriate: true,
          safetyDetails,
          error: {
            code: 'IMAGE_INAPPROPRIATE_CONTENT',
            message: 'Image contains inappropriate content'
          }
        };
      }

      return { inappropriate: false, safetyDetails };
    } catch (error) {
      return {
        inappropriate: true,
        safetyDetails: {
          adult: 'UNKNOWN',
          medical: 'UNKNOWN',
          spoof: 'UNKNOWN',
          violence: 'UNKNOWN'
        },
        error: {
          code: 'SAFE_SEARCH_ERROR',
          message: 'Failed to perform safety detection'
        }
      };
    }
  }


  // 3. S3 Upload helper
  async uploadToS3(imageBuffer, key) {
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
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'S3_UPLOAD_ERROR',
          message: 'Failed to upload image to storage'
        }
      };
    }
  }

  formatMediaForResponse(media) {
    return {
      id: media.$id,
      userId: media.userId,
      mediaType: media.mediaType,
      url: media.url,
      displayOrder: media.displayOrder,
      isActive: media.isActive,
      thumbnailUrl: media.thumbnailUrl,
      createdAt: media.$createdAt,
      updatedAt: media.$updatedAt
    };
  }

  initializeUploadResult(config) {
    return {
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
  }

  allValidationsPassed(validations) {
    return validations.sizeValid &&
      validations.formatValid &&
      validations.hasFace &&
      !validations.inappropriate;
  }

  async getProfileForUpload(jwtToken, userId) {
    try {
      const appwriteService = AppwriteService.getInstance();
      return await appwriteService.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );
    } catch (error) {
      return null;
    }
  }


  // 4. Ana uploadPhoto metodu - yeniden düzenlenmiş
  async uploadPhoto(jwtToken, userId, imageBase64, requestId, log) {
    const operationStart = Date.now();
    log(`[${requestId}] Starting uploadPhoto for user: ${userId}`);

    const config = this.getPhotoValidationConfig();

    // Initialize result object
    const result = this.initializeUploadResult(config);

    try {
      // Step 1: Size validation
      const sizeValidation = this.validateImageSize(imageBase64, config);
      if (!sizeValidation.valid) {
        result.errors.push(sizeValidation.error);
        result.operationDuration = Date.now() - operationStart;
        return result;
      }
      result.validations.sizeValid = true;
      log(`[${requestId}] Image size validation passed: ${sizeValidation.sizeInKB}KB`);

      // Step 2: Format validation and buffer conversion
      const formatValidation = await this.validateImageFormat(imageBase64, config);
      if (!formatValidation.valid) {
        result.errors.push(formatValidation.error);
        result.operationDuration = Date.now() - operationStart;
        return result;
      }
      result.validations.formatValid = true;
      const imageBuffer = formatValidation.buffer;
      log(`[${requestId}] Image format validation passed`);

      // Step 3: Initialize Vision API
      let visionClient;
      try {
        visionClient = await this.initializeVisionClient();
      } catch (error) {
        result.errors.push(error);
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

      // Step 4: Face detection
      const faceDetection = await this.detectFaces(imageBuffer, visionClient);
      result.validations.hasFace = faceDetection.hasFace;
      if (!faceDetection.hasFace) {
        result.errors.push(faceDetection.error);
        log(`[${requestId}] Face detection failed`);
      } else {
        log(`[${requestId}] Face detection passed`);
      }

      // Step 5: Inappropriate content detection
      const safetyCheck = await this.detectInappropriateContent(imageBuffer, visionClient);
      result.validations.inappropriate = safetyCheck.inappropriate;
      result.validations.safetyDetails = safetyCheck.safetyDetails;
      if (safetyCheck.inappropriate) {
        result.errors.push(safetyCheck.error);
        log(`[${requestId}] Safe search detection failed`);
      } else {
        log(`[${requestId}] Safe search detection passed`);
      }

      // Step 6: Check if all validations passed
      if (!this.allValidationsPassed(result.validations)) {
        result.operationDuration = Date.now() - operationStart;
        log(`[${requestId}] Upload skipped due to validation failures`);
        return result;
      }

      // Step 7: Get profile
      const profile = await this.getProfileForUpload(jwtToken, userId);
      if (!profile) {
        result.errors.push({
          code: 'PROFILE_NOT_FOUND',
          message: 'Profile not found'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }
      log(`[${requestId}] Profile found`);

      // Step 8: Generate key and upload to S3
      const key = randomBytes(18).toString('hex').toLowerCase();
      const uploadResult = await this.uploadToS3(imageBuffer, key);
      if (!uploadResult.success) {
        result.errors.push(uploadResult.error);
        result.operationDuration = Date.now() - operationStart;
        return result;
      }
      log(`[${requestId}] Photo uploaded to S3 with key: ${key}`);

      // Step 9: Add to profile media
      try {
        const newMedia = await this.addProfileMedia(
          jwtToken,
          userId,
          profile.$id,
          'PHOTO',
          this.generatePhotoUrl(key),
          this.generatePhotoUrl(key)
        );

        // Prepare success result
        result.success = true;
        result.photoKey = key;
        result.photoUrl = this.generatePhotoUrl(key);
        result.totalPhotos = (await this.getUserMediaWithOrder(jwtToken, userId)).length;
        result.newMedia = this.formatMediaForResponse(newMedia);
        result.operationDuration = Date.now() - operationStart;

        log(`[${requestId}] Photo upload completed successfully in ${result.operationDuration}ms`);
        return result;

      } catch (error) {
        result.errors.push({
          code: 'PROFILE_UPDATE_FAILED',
          message: 'Failed to update user profile with new photo'
        });
        result.operationDuration = Date.now() - operationStart;
        return result;
      }

    } catch (error) {
      log(`[${requestId}] UNEXPECTED ERROR in uploadPhoto: ${error.message}`);
      result.errors.push({
        code: 'UNEXPECTED_ERROR',
        message: 'An unexpected error occurred during photo upload'
      });
      result.operationDuration = Date.now() - operationStart;
      return result;
    }
  }
}

export default new ProfileService();  