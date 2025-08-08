import profileService from './profileService.js';
import AppwriteService, { extractJWTFromHeaders } from '../../appwrite.js';
import { ERROR_CODES, AppError, ErrorHandler } from '../../utils/errorConstants.js';

class ProfileController {

  async updateProfile(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateProfile request started`);

      const { jwtToken, requestingUserId } = await this.validateAndExtractUser(req.headers, requestId, log);
      const { passions, habits, relationStatus, relationGoal, height, about, birthDate, gender } = req.body;

      log(`[${requestId}] Request params: userId=${requestingUserId}, 
        passions=${JSON.stringify(passions)}, 
        habits=${JSON.stringify(habits)}, 
        relationStatus=${relationStatus}, 
        relationGoal=${relationGoal}, 
        height=${height}, 
        about=${about}, 
        birthDate=${birthDate}, 
        gender=${gender}`);

      const result = await profileService.updateProfile(
        jwtToken,
        requestingUserId,
        {
          passions,
          habits,
          relationStatus,
          relationGoal,
          height,
          about,
          birthDate,
          gender
        },
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateProfile completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Profile updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async uploadPhoto(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] uploadPhoto request started`);

      const { jwtToken, requestingUserId } = await this.validateAndExtractUser(req.headers, requestId, log);
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'imageBase64 parameter is required');
      }

      log(`[${requestId}] Request params: userId=${requestingUserId}, imageBase64 length=${imageBase64.length}`);

      // Service call
      const result = await profileService.uploadPhoto(
        jwtToken,
        requestingUserId,
        imageBase64,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] uploadPhoto completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Photo uploaded successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }


  async deletePhoto(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] deletePhoto request started`);

      const { jwtToken, requestingUserId } = await this.validateAndExtractUser(req.headers, requestId, log);
      const { photoKey } = req.body;

      if (!photoKey) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'photoKey parameter is required');
      }

      log(`[${requestId}] Request params: userId=${requestingUserId}, photoKey=${photoKey}`);

      // Service call
      const result = await profileService.deletePhoto(
        jwtToken,
        requestingUserId,
        photoKey,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] deletePhoto completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Photo deleted successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }
  async validateAndExtractUser(headers, requestId, log) {
    try {
      const jwtToken = extractJWTFromHeaders(headers);
      if (!jwtToken) {
        throw new AppError(ERROR_CODES.JWT_TOKEN_MISSING, 'JWT token not found in headers');
      }

      const appwriteService = new AppwriteService();

      // Validate JWT and get user info
      const userInfo = await appwriteService.validateJWT(jwtToken);

      if (!userInfo || !userInfo.$id) {
        throw new AppError(ERROR_CODES.USER_ID_EXTRACTION_FAILED, 'Failed to extract user info from JWT');
      }

      log(`[${requestId}] JWT validation successful for user: ${userInfo.$id}`);

      return { jwtToken, requestingUserId: userInfo.$id };

    } catch (error) {
      log(`[${requestId}] JWT validation failed: ${error.message}`);

      if (error instanceof AppError) {
        throw error;
      }

      // Handle JWT validation errors
      if (error.message.includes('invalid') || error.message.includes('expired')) {
        throw new AppError(ERROR_CODES.JWT_TOKEN_INVALID, error.message, error);
      }

      throw new AppError(ERROR_CODES.JWT_TOKEN_INVALID, error.message, error);
    }
  }

  // ProfileController.js - getProfile method ekleyin

  async getProfile(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] getProfile request started`);

      const { jwtToken, requestingUserId } = await this.validateAndExtractUser(req.headers, requestId, log);

      const { timezoneOffset } = req.body;

      if (!timezoneOffset) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'timezoneOffset parameter is required');
      }

      log(`[${requestId}] Request params: userId=${requestingUserId}`);

      // Service call
      const result = await profileService.getProfile(
        jwtToken,
        requestingUserId,
        requestId,
        log,
        timezoneOffset
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] getProfile completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Profile retrieved successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }
}

export default new ProfileController();