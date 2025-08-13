
import AppwriteService from '../services/appwrite/AppwriteService.js';

const authenticateUser = async (req, res, next) => {
  const {startTime, requestId} = req;
  const log = (message) => console.log(`[${requestId}] ${message}`);
  const error = (message, err) => console.error(`[${requestId}] ${message}`, err);
  req.log = log;
  req.error = error;

  try {
    const appwriteService = AppwriteService.getInstance();
    const authResult = await appwriteService.validateAndExtractUser(
      req.headers,
      requestId,
      log
    );

    req.jwtToken = authResult.jwtToken;
    req.requestedUser = authResult.userInfo;

    next();
  } catch (tokenError) {
    req.error(`[${requestId}] JWT validation failed: ${tokenError.message}`);
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
};

export default authenticateUser;