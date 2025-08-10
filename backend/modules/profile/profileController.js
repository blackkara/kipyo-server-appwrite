import profileService from './profileService.js';
import AppwriteService from '../../appwrite.js';
//import AppwriteService from '../../services/appwrite/AppwriteService.js';
import { ERROR_CODES, AppError, ErrorHandler } from '../../utils/errorConstants.js';

class ProfileController {

  async getProfile(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] getProfile request started`);

      let jwtToken;
      let requestedUser;

      try {
        const appwriteService = AppwriteService.getInstance();
        const authResult = await appwriteService.validateAndExtractUser(req.headers, requestId, log);

        jwtToken = authResult.jwtToken;
        requestedUser = authResult.userInfo;

      } catch (tokenError) {
        log(`[${requestId}] JWT validation failed: ${tokenError.message}`);
        const duration = Date.now() - startTime;

        return res.status(401).json({
          success: false,
          code: 401,
          type: 'general_unauthorized',
          message: tokenError.message,
          requestId: requestId,
          duration: duration
        });
      }

      const { timezoneOffset } = req.body;

      if (!timezoneOffset) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'timezoneOffset parameter is required');
      }

      log(`[${requestId}] Request params: userId=${requestedUser.$id}, timezoneOffset=${timezoneOffset}`);

      // Service call
      const result = await profileService.getProfile(
        jwtToken,
        requestedUser.$id,
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

  async updateProfile(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] updateProfile request started`);

      try {
        const appwriteService = AppwriteService.getInstance();
        const authResult = await appwriteService.validateAndExtractUser(req.headers, requestId, log);

        jwtToken = authResult.jwtToken;
        requestedUser = authResult.userInfo;

      } catch (tokenError) {
        log(`[${requestId}] JWT validation failed: ${tokenError.message}`);
        const duration = Date.now() - startTime;

        return res.status(401).json({
          success: false,
          code: 401,
          type: 'general_unauthorized',
          message: tokenError.message,
          requestId: requestId,
          duration: duration
        });
      }

      log(`[${requestId}] Request params: userId=${requestingUser.$id}, 
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
        requestingUser.$id,
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

      let jwtToken;
      let requestedUser;

      try {
        const appwriteService = AppwriteService.getInstance();
        const authResult = await appwriteService.validateAndExtractUser(req.headers, requestId, log);

        jwtToken = authResult.jwtToken;
        requestedUser = authResult.userInfo;

      } catch (tokenError) {
        log(`[${requestId}] JWT validation failed: ${tokenError.message}`);
        const duration = Date.now() - startTime;

        return res.status(401).json({
          success: false,
          code: 401,
          type: 'general_unauthorized',
          message: tokenError.message,
          requestId: requestId,
          duration: duration
        });
      }

      const { imageBase64 } = req.body;

      if (!imageBase64) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'imageBase64 parameter is required');
      }

      log(`[${requestId}] Request params: userId=${requestedUser.$id}, imageBase64 length=${imageBase64.length}`);

      // Service call
      const result = await profileService.uploadPhoto(
        jwtToken,
        requestedUser.$id,
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
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] deletePhoto request started`);

      let jwtToken;
      let requestedUser;

      try {
        const appwriteService = AppwriteService.getInstance();
        const authResult = await appwriteService.validateAndExtractUser(req.headers, requestId, log);

        jwtToken = authResult.jwtToken;
        requestedUser = authResult.userInfo;

      } catch (tokenError) {
        log(`[${requestId}] JWT validation failed: ${tokenError.message}`);
        const duration = Date.now() - startTime;

        return res.status(401).json({
          success: false,
          code: 401,
          type: 'general_unauthorized',
          message: tokenError.message,
          requestId: requestId,
          duration: duration
        });
      }


      const { photoKey } = req.body;

      if (!photoKey) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'photoKey parameter is required');
      }

      log(`[${requestId}] Request params: userId=${requestedUser.$id}, photoKey=${photoKey}`);

      // Service call
      const result = await profileService.deletePhoto(
        jwtToken,
        requestedUser.$id,
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


}

export default new ProfileController();