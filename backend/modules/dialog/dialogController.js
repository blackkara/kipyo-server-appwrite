import dialogService from './dialogService.js';
import AppwriteService from '../../appwrite.js';

class DialogController {

  async initDialog(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] Dialog request started`);

      let jwtToken;
      let requestedUser;

      try {
        const appwriteService = new AppwriteService();
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

      const { userId, occupantId } = req.body;

      log(`[${requestId}] Request params: userId=${userId}, occupantId=${occupantId}, requesterId=${requestedUser.$id}`);

      // Service call
      const dialog = await dialogService.initDialog(
        userId,
        occupantId,
        jwtToken,
        requestedUser.$id,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] Request completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Dialog initialized successfully',
        data: { dialog },
        requestId: requestId,
        duration: duration
      });

    } catch (serviceError) {
      const duration = Date.now() - startTime;
      error(`[${requestId}] Request failed after ${duration}ms:`, serviceError);
      log(`[${requestId}] ERROR Details: ${serviceError.message}`);

      // Error categorization
      let statusCode = 500;
      let errorType = 'processing_error';
      let errorMessage = serviceError.message || 'Unknown error';

      if (errorMessage.includes('required') ||
        errorMessage.includes('parameter') ||
        errorMessage.includes('cannot be the same') ||
        errorMessage.includes('must be the same')) {
        statusCode = 400;
        errorType = 'general_argument_invalid';
      } else if (errorMessage.includes('blocked')) {
        statusCode = 403;
        errorType = 'has_blocked_participants';
      } else if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('JWT validation failed') ||
        errorMessage.includes('token')) {
        statusCode = 401;
        errorType = 'general_unauthorized';
      } else if (errorMessage.includes('not found') ||
        errorMessage.includes('does not exist')) {
        statusCode = 404;
        errorType = 'general_not_found';
      } else if (errorMessage.includes('Failed to create') ||
        errorMessage.includes('Failed to check') ||
        errorMessage.includes('Failed to update')) {
        statusCode = 500;
        errorType = 'processing_error';
      }

      return res.status(statusCode).json({
        success: false,
        code: statusCode,
        type: errorType,
        message: errorMessage,
        requestId: requestId,
        duration: duration
      });
    }
  }
}

export default new DialogController();