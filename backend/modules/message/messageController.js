import messageService from './messageService.js';
import AppwriteService from '../../services/appwrite/AppwriteService.js';

class MessageController {

  async sendMessage(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] Send message request started`);
      const { message, senderId, receiverId, dialogId, messageType } = req.body;

      log(`[${requestId}] Request params: message=${message}, senderId=${senderId}, receiverId=${receiverId}, dialogId=${dialogId}, messageType=${messageType}, requesterId=${requestedUser.$id}`);
      const appwriteService = new AppwriteService();
      const newMessage = await appwriteService.sendMessage(jwtToken, senderId, receiverId, message, messageType, dialogId);

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

  async sendDirectMessage(req, res) {
    const { startTime, requestId, jwtToken, requestedUser } = req;
    const log = (message) => console.log(message);
    const error = (message, err) => console.error(message, err);

    try {
      log(`[${requestId}] Send direct message request started`);
      const { message, receiverId, messageType } = req.body;
      const senderId = requestedUser.$id;

      log(`[${requestId}] Direct message params: message=${message}, senderId=${senderId}, receiverId=${receiverId}, requesterId=${requestedUser.$id}`);
      const appwriteService = new AppwriteService();
      const newMessage = await appwriteService.sendDirectMessage(jwtToken, senderId, receiverId, message, messageType, {});

      const duration = Date.now() - startTime;
      log(`[${requestId}] Direct message request completed successfully in ${duration}ms`);

      // return res.status(200).json({
      //   newMessage: newMessage.newMessage,
      //   dialog: newMessage.dialog
      // });

      return res.status(200).json({
        success: true,
        code: 200,
        data: newMessage,
        requestId: requestId,
        duration: duration
      });

    } catch (e) {
      const duration = Date.now() - startTime;
      error(`[${requestId}] Direct message request failed after ${duration}ms:`, e);
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
      } else if (e.message.includes('Dialog already exists')) {
        statusCode = 409;
        errorType = 'dialog_already_exists';
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