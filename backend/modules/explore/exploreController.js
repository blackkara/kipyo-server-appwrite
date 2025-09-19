import exploreService from './exploreService.js';

class ExploreController {

  async getCards(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] Get cards request started`);
      const { limit = 10, offset = 0 } = req.query;

      log(`[${requestId}] Request params: userId=${requestedUser.$id}, limit=${limit}, offset=${offset}`);
      const result = await exploreService.getSwipeCards(
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
      log(`[${requestId}] Request completed successfully in ${duration}ms, returned ${result.length} cards`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Cards retrieved successfully',
        data: {
          cards: result,
          count: result.length,
          hasMore: result.length === parseInt(limit)
        },
        requestId: requestId,
        duration: duration
      });

    } catch (serviceError) {
      const duration = Date.now() - startTime;
      error(`[${requestId}] Request failed after ${duration}ms:`, serviceError);
      log(`[${requestId}] ERROR Details: ${serviceError.message}`);
      
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
}

export default new ExploreController();