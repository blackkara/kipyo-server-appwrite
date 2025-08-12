import interactionService from './interactionService.js';
import AppwriteService from '../../services/appwrite/AppwriteService.js';

class InteractionController {

  async blockUser(req, res) {
    return await this.handleInteraction(req, res, 'block');
  }

  async unblockUser(req, res) {
    return await this.handleInteraction(req, res, 'unblock');
  }

  async likeUser(req, res) {
    return await this.handleInteraction(req, res, 'like');
  }

  async dislikeUser(req, res) {
    return await this.handleInteraction(req, res, 'dislike');
  }

  async unmatch(req, res) {
    return await this.handleInteraction(req, res, 'unmatch');
  }

  async getAllInteractions(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] getAllInteractions request started`);

      const options = {
        includeLikes: req.query.includeLikes !== 'false',
        includeMatches: req.query.includeMatches !== 'false',
        includeBlocks: req.query.includeBlocks !== 'false',
        includeDislikes: req.query.includeDislikes !== 'false',
        limit: parseInt(req.query.limit) || 100
      };

      log(`[${requestId}] Request params: requesterId=${requestedUser.$id}, options=${JSON.stringify(options)}`);

      const result = await interactionService.getAllInteractions(
        jwtToken,
        requestedUser.$id,
        requestId,
        log,
        options
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] getAllInteractions completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'All interactions retrieved successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (serviceError) {
      const duration = Date.now() - startTime;
      error(`[${requestId}] getAllInteractions failed after ${duration}ms:`, serviceError);
      log(`[${requestId}] ERROR Details: ${serviceError.message}`);

      // Error categorization
      let statusCode = 500;
      let errorType = 'processing_error';
      let errorMessage = serviceError.message || 'Unknown error';

      if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('JWT validation failed') ||
        errorMessage.includes('token')) {
        statusCode = 401;
        errorType = 'general_unauthorized';
      } else if (errorMessage.includes('not found') ||
        errorMessage.includes('does not exist')) {
        statusCode = 404;
        errorType = 'general_not_found';
      } else if (errorMessage.includes('Failed to') ||
        errorMessage.includes('Database operation failed')) {
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

  async handleInteraction(req, res, interactionType) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] ${interactionType} interaction request started`);
      const { receiverId } = req.body;


      log(`[${requestId}] Request params: receiverId=${receiverId}, requesterId=${requestedUser.$id}, interactionType=${interactionType}`);

      // Service call
      const result = await interactionService.handleUserInteraction(
        interactionType,
        requestedUser.$id,
        receiverId,
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
        message: `${interactionType} interaction completed successfully`,
        data: result,
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
      } else if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('JWT validation failed') ||
        errorMessage.includes('token')) {
        statusCode = 401;
        errorType = 'general_unauthorized';
      } else if (errorMessage.includes('not found') ||
        errorMessage.includes('does not exist')) {
        statusCode = 404;
        errorType = 'general_not_found';
      } else if (errorMessage.includes('Failed to') ||
        errorMessage.includes('Database operation failed')) {
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

export default new InteractionController();