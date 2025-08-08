import messageService from './messageService.js';
import AppwriteService, { extractJWTFromHeaders } from '../../appwrite.js';

class MessageController {

  async sendMessage(req, res) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] Message request started`);

      let jwtToken;
      let requestedUserId;

      try {
        jwtToken = extractJWTFromHeaders(req.headers);
        const appwriteService = new AppwriteService();
        requestedUserId = appwriteService.getUserIdFromJWT(jwtToken);
      } catch (tokenError) {
        log(`[${requestId}] ERROR: ${tokenError.message}`);
        return res.status(401).json({
          code: 401,
          type: 'general_unauthorized',
          message: tokenError.message
        });
      }

      const { message, senderId, receiverId, dialogId } = req.body;

      log(`[${requestId}] Request params: message=${message}, senderId=${senderId}, receiverId=${receiverId}, dialogId=${dialogId}, requesterId=${requestedUserId}`);

      const newMessage = await messageService.send(message, senderId, receiverId, dialogId, jwtToken, requestedUserId, requestId, log);

      const duration = Date.now() - startTime;
      log(`[${requestId}] Request completed successfully in ${duration}ms`);

      return res.status(200).json({ newMessage });
    } catch (e) {
      const duration = Date.now() - startTime;
      error(`[${requestId}] Request failed after ${duration}ms:`, e);
      log(`[${requestId}] ERROR Details: ${e.message}`);

      let statusCode = 500;
      let errorType = 'processing_error';

      if (e.message.includes('required') || e.message.includes('cannot be the same') || e.message.includes('unauthorized')) {
        statusCode = 400;
        errorType = 'general_argument_invalid';
      } else if (e.message.includes('blocked')) {
        statusCode = 400;
        errorType = 'has_blocked_participants';
      } else if (e.message.includes('JWT validation failed')) {
        statusCode = 401;
        errorType = 'general_unauthorized';
      }

      return res.status(statusCode).json({
        code: statusCode,
        type: errorType,
        message: e.message || 'Unknown error',
        requestId: requestId
      });
    }
  }
}

export default new MessageController();