import matchService from './matchService.js';
import AppwriteService, { extractJWTFromHeaders } from '../../appwrite.js';

class MatchController {

  async unmatch(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] unmatch request started`);

      let jwtToken;
      let requestingUserId;

      try {
        const authResult = await this.validateAndExtractUser(req.headers, requestId, log);
        jwtToken = authResult.jwtToken;
        requestingUserId = authResult.userInfo.$id;

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

      const { matchId } = req.body;

      log(`[${requestId}] Request params: matchId=${matchId}, requesterId=${requestingUserId}`);

      // Service call
      const result = await matchService.unmatch(
        matchId,
        requestingUserId,
        jwtToken,
        requestId,
        log
      );

      const duration = Date.now() - startTime;
      log(`[${requestId}] unmatch completed successfully in ${duration}ms`);

      return res.status(200).json({
        success: true,
        code: 200,
        message: 'Unmatch completed successfully',
        data: result,
        requestId: requestId,
        duration: duration
      });

    } catch (serviceError) {
      const duration = Date.now() - startTime;
      error(`[${requestId}] unmatch failed after ${duration}ms:`, serviceError);
      log(`[${requestId}] ERROR Details: ${serviceError.message}`);

      let statusCode = 500;
      let errorType = 'processing_error';
      let errorMessage = serviceError.message || 'Unknown error';

      if (errorMessage.includes('required') ||
        errorMessage.includes('parameter') ||
        errorMessage.includes('matchId')) {
        statusCode = 400;
        errorType = 'general_argument_invalid';
      } else if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('JWT validation failed') ||
        errorMessage.includes('token')) {
        statusCode = 401;
        errorType = 'general_unauthorized';
      } else if (errorMessage.includes('not found') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('Match not found')) {
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

export default new MatchController();