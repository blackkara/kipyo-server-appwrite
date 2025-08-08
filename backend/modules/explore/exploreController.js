import exploreService from './exploreService.js';
import AppwriteService, { extractJWTFromHeaders } from '../../appwrite.js';

class ExploreController {

  async getCards(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] Get cards request started`);

      let jwtToken;
      let requestedUser;
      let requestingUserId;

      try {
        const authResult = await this.validateAndExtractUser(req.headers, requestId, log);
        jwtToken = authResult.jwtToken;
        requestedUser = authResult.userInfo;
        requestingUserId = authResult.userInfo.$id;

        if (!requestingUserId) {
          throw new Error('Failed to extract user ID from JWT');
        }
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

      const {
        limit = 10,
        offset = 0
      } = req.query;

      log(`[${requestId}] Request params: userId=${requestingUserId}, limit=${limit}, offset=${offset}`);

      // Service call
      const cards = await exploreService.getSwipeCards(
       requestedUser,
        jwtToken,
        {
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] Request completed successfully in ${duration}ms, returned ${cards.length} cards`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Cards retrieved successfully',
        data: {
          cards,
          count: cards.length,
          hasMore: cards.length === parseInt(limit)
        },
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
        errorMessage.includes('invalid')) {
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
      } else if (errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Failed to filter') ||
        errorMessage.includes('Failed to query')) {
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

  async validateAndExtractUser(headers, requestId, log) {
    try {
      const jwtToken = extractJWTFromHeaders(headers);
      if (!jwtToken) {
        throw new Error('JWT token not found in headers');
      }

      const appwriteService = new AppwriteService();

      // TEK SEFERDE HEM VALİDE ET HEM USER INFO AL
      const userInfo = await appwriteService.validateJWT(jwtToken);

      if (!userInfo || !userInfo.$id) {
        throw new Error('Failed to extract user info from JWT');
      }

      log(`[${requestId}] JWT validation successful for user: ${userInfo.$id}`);

      return { jwtToken, userInfo };

    } catch (tokenError) {
      log(`[${requestId}] JWT validation failed: ${tokenError.message}`);
      throw new Error(tokenError.message);
    }
  }
}

export default new ExploreController();