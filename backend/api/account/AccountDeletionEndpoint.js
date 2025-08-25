// src/api/account/AccountDeletionEndpoint.js

import express from 'express';
import { Client, Users } from 'node-appwrite';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import authenticateUser from '../../middleware/authenticateUser.js';

const router = express.Router();

/**
 * Delete account directly with JWT authentication
 * DELETE or POST /api/account/deletion
 * 
 * This endpoint is for authenticated users within the app
 * No email verification needed as JWT authentication is sufficient
 */
const deleteAccountHandler = async (req, res) => {
  const { jwtToken, requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    const appwriteService = AppwriteService.getInstance();
    const userId = requestedUser.$id;
    
    const deletionLog = [];
    
    // Perform account deletion
    log(`Starting account deletion for user ${userId}`);
    
    // 1. Delete user profile using AppwriteService
    try {
      await appwriteService.deleteDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );
      deletionLog.push('User profile deleted');
      log(`Deleted profile for user ${userId}`);
    } catch (err) {
      log(`Failed to delete profile: ${err.message}`);
      deletionLog.push(`Profile deletion failed: ${err.message}`);
    }

    // 2. Delete Appwrite account using Users API with API key
    try {
      const client = new Client()
        .setEndpoint(process.env.APPWRITE_END_POINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_DEV_KEY);

      const users = new Users(client);
      
      // Delete the user account
      await users.delete(userId);
      
      deletionLog.push('Appwrite account deleted');
      log(`Deleted account for user ${userId}`);
    } catch (err) {
      log(`Failed to delete account: ${err.message}`);
      deletionLog.push(`Account deletion failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    log(`Account deletion complete for user ${userId} in ${duration}ms: ${deletionLog.join(', ')}`);

    return res.status(200).json({
      success: true,
      code: 200,
      message: 'Account successfully deleted',
      details: deletionLog,
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
      error: err.message,
      requestId,
      duration
    });
  }
};

// Support both DELETE and POST methods for compatibility
router.delete('/deletion', authenticateUser, deleteAccountHandler);
router.post('/deletion', authenticateUser, deleteAccountHandler);

export default router;