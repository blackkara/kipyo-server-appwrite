// src/api/account/AccountDeletionEndpoint.js

import express from 'express';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import authenticateUser from '../../middleware/authenticateUser.js';

const router = express.Router();

/**
 * Delete account directly with JWT authentication
 * DELETE /api/account/deletion
 * 
 * This endpoint is for authenticated users within the app
 * No email verification needed as JWT authentication is sufficient
 */
router.delete('/deletion', authenticateUser, async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Perform account deletion
    log(`Starting account deletion for user ${requestedUser.$id}`);
    
    // 1. Delete user's profile data
    try {
      await appwriteService.deleteUserProfile(jwtToken, requestedUser.$id);
      log(`Deleted profile for user ${requestedUser.$id}`);
    } catch (err) {
      log(`Failed to delete profile: ${err.message}`);
    }

    // 2. Delete user account from Appwrite
    try {
      await appwriteService.deleteUserAccount(jwtToken, requestedUser.$id);
      log(`Deleted account for user ${requestedUser.$id}`);
    } catch (err) {
      log(`Failed to delete account: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    log(`Account deleted for user ${requestedUser.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      message: 'Account successfully deleted',
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    error(`Failed to delete account: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to delete account',
      requestId,
      duration
    });
  }
});

export default router;