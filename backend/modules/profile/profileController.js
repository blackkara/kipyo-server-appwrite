import profileService from './profileService.js';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import { ERROR_CODES, AppError, ErrorHandler } from '../../utils/errorConstants.js';

class ProfileController {


  calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }


  async createProfile(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] createProfile request started`);

      const { username, birthDate, gender, countryCode, timezoneOffset } = req.body;

      // Email'i güvenli bir şekilde requestedUser'dan alıyoruz
      const email = requestedUser.email;

      // createDate'i sunucuda üretiyoruz - daha güvenli
      const createDate = new Date().toISOString();

      // Validation
      if (!email) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'email parameter is required');
      }

      if (!username) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'username parameter is required');
      }

      if (!birthDate) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'birthDate parameter is required');
      }

      if (!gender) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'gender parameter is required');
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid email format');
      }

      const usernameRegex = /^[\p{L}0-9_]{3,20}$/u;

      if (!usernameRegex.test(username)) {
        throw new AppError(ERROR_CODES.PROFILE_USERNAME_INVALID, 'Username must be 3-30 characters and contain only letters, numbers, and underscores');
      }

      // Gender validation
      const validGenders = ['man', 'woman', 'nonBinary'];
      if (!validGenders.includes(gender)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Gender must be man, woman, or nonBinary');
      }

      // BirthDate validation (must be a valid date and user must be 18+)
      const birthDateObj = new Date(birthDate);
      if (isNaN(birthDateObj.getTime())) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid birthDate format');
      }

      const age = calculateAge(birthDate);
      if (age < 18) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'User must be at least 18 years old');
      }

      if (age > 120) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid birthDate');
      }

      // Validate timezoneOffset if provided
      if (timezoneOffset !== undefined && timezoneOffset !== null) {
        if (typeof timezoneOffset !== 'number' || timezoneOffset < -720 || timezoneOffset > 840) {
          throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid timezoneOffset value');
        }
      }

      log(`[${requestId}] Request params: userId=${requestedUser.$id}, email=${email}, username=${username}, gender=${gender}, countryCode=${countryCode}`);

      // Service call
      const result = await profileService.createProfile(
        jwtToken,
        requestedUser.$id,
        username,
        email,
        birthDate,
        createDate,
        gender,
        countryCode,
        timezoneOffset,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] createProfile completed successfully in ${duration}ms`);

      return res.status(201).json({
        success: true,
        code: 201,
        message: 'Profile created successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async getProfile(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] getProfile request started`);

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
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);
    try {
      log(`[${requestId}] updateProfile request started`);

      const { passions, habits, relationStatus, relationGoal, height, about, birthDate, gender } = req.body;
      const reallyUpdatedFields = {};
      if (passions && passions.length > 0) reallyUpdatedFields['passions'] = passions;
      if (habits && habits.length > 0) reallyUpdatedFields['habits'] = habits;
      if (relationStatus !== undefined && relationStatus.length > 0) reallyUpdatedFields['relationStatus'] = relationStatus;
      if (relationGoal !== undefined && relationGoal.length > 0) reallyUpdatedFields['relationGoal'] = relationGoal;
      if (height !== undefined && height.length > 0) reallyUpdatedFields['height'] = height;
      if (about !== undefined && about.length > 0) reallyUpdatedFields['about'] = about;
      if (birthDate !== undefined && birthDate.length > 0) reallyUpdatedFields['birthDate'] = birthDate;
      if (gender !== undefined && gender.length > 0) reallyUpdatedFields['gender'] = gender;

      const result = await profileService.updateProfile(
        jwtToken,
        requestedUser.$id,
        reallyUpdatedFields,
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

  // profileController.js'e eklenecek yeni metodlar

  async updateAbout(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateAbout request started`);

      const { about } = req.body;

      if (!about || about.trim().length === 0) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'about parameter is required');
      }

      if (about.length > 300) {
        throw new AppError(ERROR_CODES.PARAMETER_LENGTH_EXCEEDED, 'about cannot exceed 300 characters');
      }

      const result = await profileService.updateSpecificField(
        jwtToken,
        requestedUser.$id,
        'about',
        about,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateAbout completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'About section updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async updatePassions(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updatePassions request started`);

      const { passions } = req.body;

      if (!passions || !Array.isArray(passions)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_TYPE, 'passions must be an array');
      }

      if (passions.length < 3) {
        throw new AppError(ERROR_CODES.PARAMETER_COUNT_INSUFFICIENT, 'At least 3 passions are required');
      }

      if (passions.length > 10) {
        throw new AppError(ERROR_CODES.PARAMETER_COUNT_EXCEEDED, 'passions cannot exceed 10 items');
      }

      const result = await profileService.updatePassions(
        jwtToken,
        requestedUser.$id,
        passions,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updatePassions completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Passions updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async updateRelationGoal(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateRelationGoal request started`);

      const { relationGoal } = req.body;

      if (!relationGoal || relationGoal.trim().length === 0) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'relationGoal parameter is required');
      }

      const result = await profileService.updateSpecificField(
        jwtToken,
        requestedUser.$id,
        'relationGoal',
        relationGoal,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateRelationGoal completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Relation goal updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async updatePersonalInfo(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updatePersonalInfo request started`);

      const { relationStatus, height } = req.body;

      const updateData = {};

      if (relationStatus !== undefined) {
        if (relationStatus.trim().length === 0) {
          throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'relationStatus cannot be empty');
        }
        updateData.relationStatus = relationStatus;
      }

      if (height !== undefined) {
        if (typeof height !== 'number' || height < 100 || height > 250) {
          throw new AppError(ERROR_CODES.PARAMETER_RANGE_INVALID, 'height must be between 100 and 250 cm');
        }
        updateData.height = height;
      }

      if (Object.keys(updateData).length === 0) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'At least one field must be provided');
      }

      const result = await profileService.updateMultipleFields(
        jwtToken,
        requestedUser.$id,
        updateData,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updatePersonalInfo completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Personal info updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async updateGender(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateGender request started`);

      const { gender } = req.body;

      const validGenders = ['man', 'woman', 'nonBinary'];
      if (!gender || !validGenders.includes(gender)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Gender must be man, woman, or nonBinary');
      }

      const result = await profileService.updateSpecificField(
        jwtToken,
        requestedUser.$id,
        'gender',
        gender,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateGender completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Gender updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async updateBirthDate(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateBirthDate request started`);

      const { birthDate } = req.body;

      if (!birthDate) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'birthDate parameter is required');
      }

      // Age validation
      const birthDateObj = new Date(birthDate);
      if (isNaN(birthDateObj.getTime())) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid birthDate format');
      }

      const age = Math.floor((Date.now() - birthDateObj.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      if (age < 18 || age > 120) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid age');
      }

      const result = await profileService.updateSpecificField(
        jwtToken,
        requestedUser.$id,
        'birthDate',
        birthDate,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateBirthDate completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Birth date updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }


  // profileController.js'e eklenecek/düzeltilecek metod

  async updateHabits(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateHabits request started`);

      const { habits } = req.body;

      if (!habits || !Array.isArray(habits)) {
        throw new AppError(ERROR_CODES.INVALID_PARAMETER_TYPE, 'habits must be an array');
      }

      if (habits.length > 10) {
        throw new AppError(ERROR_CODES.PARAMETER_COUNT_EXCEEDED, 'habits cannot exceed 10 items');
      }

      // profileService.updateHabits metodunu çağır
      const result = await profileService.updateHabits(
        jwtToken,
        requestedUser.$id,
        habits,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateHabits completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Habits updated successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, requestId, startTime);
    }
  }

  async updateLocation(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);

    try {
      log(`[${requestId}] updateLocation request started`);

      const { geohash, latitude, longitude } = req.body;

      if (!geohash || !latitude || !longitude) {
        throw new AppError(ERROR_CODES.REQUIRED_PARAMETER_MISSING, 'geohash, latitude and longitude are required');
      }


      // profileService.updateLocation metodunu çağır
      const result = await profileService.updateLocation(
        jwtToken,
        requestedUser.$id,
        geohash,
        latitude,
        longitude,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] updateLocation completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Location updated successfully',
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