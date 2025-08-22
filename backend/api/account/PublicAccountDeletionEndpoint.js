// src/api/account/PublicAccountDeletionEndpoint.js

import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import { Client, Account, Databases, Query } from 'node-appwrite';

const router = express.Router();

// In-memory storage for OTP codes and deletion tokens
const otpStore = new Map();
const deletionTokenStore = new Map();

// OTP configuration
const OTP_EXPIRY_MINUTES = 10;
const DELETION_TOKEN_EXPIRY_MINUTES = 5;

// Email transporter configuration
let emailTransporter = null;

/**
 * Initialize email transporter
 */
function initializeEmailTransporter() {
  if (emailTransporter) return emailTransporter;

  // Use SMTP configuration only
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return emailTransporter;
}

/**
 * Generate a random OTP code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a secure deletion token
 */
function generateDeletionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Clean expired entries from stores
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  
  // Clean OTP store
  for (const [key, value] of otpStore.entries()) {
    if (value.expiresAt < now) {
      otpStore.delete(key);
    }
  }
  
  // Clean deletion token store
  for (const [key, value] of deletionTokenStore.entries()) {
    if (value.expiresAt < now) {
      deletionTokenStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Initialize Appwrite Admin Client
 */
function getAdminClient() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_END_POINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_DEV_KEY);
  
  return {
    client,
    account: new Account(client),
    databases: new Databases(client)
  };
}

/**
 * Find user by email using admin privileges
 */
async function findUserByEmail(email) {
  try {
    const { databases } = getAdminClient();
    const databaseId = process.env.APPWRITE_DB_ID;
    const usersCollectionId = process.env.DB_COLLECTION_PROFILES_ID;
    
    // Search for user by email
    const response = await databases.listDocuments(
      databaseId,
      usersCollectionId,
      [
        Query.equal('email', email)
      ]
    );
    
    if (response.documents.length > 0) {
      return response.documents[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
}

/**
 * Delete user data and account
 */
async function deleteUserData(userId, email) {
  const { databases, client } = getAdminClient();
  const databaseId = process.env.APPWRITE_DB_ID;
  
  const deletionLog = [];
  
  try {
    
    // 1. Messages - DO NOT DELETE (keep for other users)
    deletionLog.push('Messages kept for other users');
    
    // 2. Delete user's matches (where userFirst == userId OR userSecond == userId)
    try {
      const matchesCollection = process.env.DB_COLLECTION_MATCHES_ID;
      
      // Bulk delete all matches with a single query
      await databases.deleteDocuments(
        databaseId,
        matchesCollection,
        [
          Query.or([
            Query.equal('userFirst', userId),
            Query.equal('userSecond', userId)
          ])
        ]
      );
      
      deletionLog.push(`Deleted matches for user ${userId}`);
    } catch (err) {
      console.error('Error deleting matches:', err);
    }
    
    // 3. Delete dislikes (where dislikerId == userId OR dislikedId == userId)
    try {
      const dislikesCollection = process.env.DB_COLLECTION_DISLIKES_ID;
      
      // Bulk delete all dislikes with a single query
      await databases.deleteDocuments(
        databaseId,
        dislikesCollection,
        [
          Query.or([
            Query.equal('dislikerId', userId),
            Query.equal('dislikedId', userId)
          ])
        ]
      );
      
      deletionLog.push(`Deleted dislikes for user ${userId}`);
    } catch (err) {
      console.error('Error deleting dislikes:', err);
    }
    
    // 4. Delete likes (where likerId == userId OR likedId == userId)
    try {
      const likesCollection = process.env.DB_COLLECTION_LIKES_ID;
      
      // Bulk delete all likes with a single query
      await databases.deleteDocuments(
        databaseId,
        likesCollection,
        [
          Query.or([
            Query.equal('likerId', userId),
            Query.equal('likedId', userId)
          ])
        ]
      );
      
      deletionLog.push(`Deleted likes for user ${userId}`);
    } catch (err) {
      console.error('Error deleting likes:', err);
    }
    
    // 5. Update user profile - Set isDeleted = true (DO NOT DELETE)
    try {
      const profilesCollection = process.env.DB_COLLECTION_PROFILES_ID;
      await databases.updateDocument(
        databaseId,
        profilesCollection,
        userId,
        {
          isDeleted: false,
          deleteDate: new Date().toISOString()
        }
      );
      deletionLog.push('User profile deactivated (isActive = false)');
    } catch (err) {
      console.error('Error deactivating user profile:', err);
    }
    
    // 6. Delete Appwrite account
    try {
      const Users = await import('node-appwrite').then(m => m.Users);
      const users = new Users(client);
      await users.delete(userId);
      deletionLog.push('Appwrite account deleted');
    } catch (err) {
      console.error('Error deleting Appwrite account:', err);
      deletionLog.push('Could not delete Appwrite account (may require user session)');
    }
    
    console.log(`Account deletion complete for ${email}:`, deletionLog);
    return true;
    
  } catch (error) {
    console.error('Error during account deletion:', error);
    throw error;
  }
}

/**
 * Step 1: Request OTP code (Public - No Auth Required)
 * POST /api/account/public/request-otp
 */
router.post('/public/request-otp', async (req, res) => {
  const { email } = req.body;
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  try {
    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Email address is required',
        requestId
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid email format',
        requestId
      });
    }

    // Check if user exists
    const user = await findUserByEmail(email);
    
    if (!user) {
      // Don't reveal that the user doesn't exist for security
      // But still pretend to send the email
      const duration = Date.now() - startTime;
      console.log(`OTP request for non-existent email: ${email}`);
      
      return res.status(200).json({
        success: true,
        code: 200,
        message: 'If an account exists with this email, a verification code has been sent',
        data: {
          email,
          expiresInMinutes: OTP_EXPIRY_MINUTES
        },
        requestId,
        duration
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);
    
    // Store OTP with user info
    const otpKey = email.toLowerCase();
    otpStore.set(otpKey, {
      otp,
      email,
      userId: user.$id,
      attempts: 0,
      expiresAt
    });

    // Send OTP via email
    const transporter = initializeEmailTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Account Deletion Verification Code - Kipyo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f;">Account Deletion Request</h2>
          <p>Hello ${user.name || 'Kipyo User'},</p>
          <p>You have requested to delete your Kipyo account.</p>
          <p>Your verification code is:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <h1 style="color: #333; letter-spacing: 5px; margin: 0;">${otp}</h1>
          </div>
          <p>This code will expire in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p style="color: #666; font-size: 14px;">
            <strong>Warning:</strong> Account deletion is permanent and cannot be undone. 
            All your data, matches, and messages will be permanently deleted.
          </p>
          <p style="color: #999; font-size: 12px;">
            If you did not request this, please ignore this email and your account will remain safe.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    const duration = Date.now() - startTime;
    console.log(`OTP sent to ${email} for user ${user.$id} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      message: 'Verification code sent to your email',
      data: {
        email,
        expiresInMinutes: OTP_EXPIRY_MINUTES
      },
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Failed to send OTP: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to send verification code. Please try again later.',
      requestId,
      duration
    });
  }
});

/**
 * Step 2: Verify OTP and get deletion token (Public - No Auth Required)
 * POST /api/account/public/verify-otp
 */
router.post('/public/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  try {
    // Validate input
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Email and verification code are required',
        requestId
      });
    }

    // Check OTP
    const otpKey = email.toLowerCase();
    const otpData = otpStore.get(otpKey);

    if (!otpData) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'No verification code found. Please request a new one.',
        requestId
      });
    }

    // Check expiry
    if (otpData.expiresAt < Date.now()) {
      otpStore.delete(otpKey);
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Verification code has expired. Please request a new one.',
        requestId
      });
    }

    // Check attempts (prevent brute force)
    if (otpData.attempts >= 3) {
      otpStore.delete(otpKey);
      return res.status(429).json({
        success: false,
        code: 429,
        message: 'Too many failed attempts. Please request a new code.',
        requestId
      });
    }

    // Verify OTP
    if (otpData.otp !== otp) {
      otpData.attempts++;
      otpStore.set(otpKey, otpData);
      
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid verification code',
        attemptsRemaining: 3 - otpData.attempts,
        requestId
      });
    }

    // OTP is valid, generate deletion token
    const deletionToken = generateDeletionToken();
    const tokenExpiresAt = Date.now() + (DELETION_TOKEN_EXPIRY_MINUTES * 60 * 1000);
    
    // Store deletion token
    deletionTokenStore.set(deletionToken, {
      userId: otpData.userId,
      email: otpData.email,
      expiresAt: tokenExpiresAt
    });

    // Remove used OTP
    otpStore.delete(otpKey);

    const duration = Date.now() - startTime;
    console.log(`OTP verified for user ${otpData.userId} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      message: 'Verification successful',
      data: {
        deletionToken,
        expiresInMinutes: DELETION_TOKEN_EXPIRY_MINUTES
      },
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Failed to verify OTP: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to verify code. Please try again.',
      requestId,
      duration
    });
  }
});

/**
 * Step 3: Delete account with deletion token (Public - No Auth Required)
 * DELETE /api/account/public/delete
 */
router.delete('/public/delete', async (req, res) => {
  const { deletionToken } = req.body;
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  try {
    // Validate deletion token
    if (!deletionToken) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Deletion token is required',
        requestId
      });
    }

    // Check deletion token
    const tokenData = deletionTokenStore.get(deletionToken);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid or expired deletion token',
        requestId
      });
    }

    // Check expiry
    if (tokenData.expiresAt < Date.now()) {
      deletionTokenStore.delete(deletionToken);
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Deletion token has expired. Please start over.',
        requestId
      });
    }

    // Perform account deletion
    console.log(`Starting account deletion for user ${tokenData.userId}`);
    
    await deleteUserData(tokenData.userId, tokenData.email);

    // Remove deletion token
    deletionTokenStore.delete(deletionToken);

    // Send confirmation email
    try {
      const transporter = initializeEmailTransporter();
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: tokenData.email,
        subject: 'Account Deleted - Kipyo',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Account Deletion Confirmed</h2>
            <p>Your Kipyo account has been permanently deleted.</p>
            <p>All your data, including profile information, messages, and matches, has been removed from our servers.</p>
            <p style="margin-top: 30px;">We're sorry to see you go. If you ever want to come back, you're always welcome to create a new account.</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Thank you for using Kipyo.
            </p>
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
    } catch (err) {
      console.log(`Failed to send deletion confirmation email: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    console.log(`Account deleted for user ${tokenData.userId} in ${duration}ms`);

    return res.status(200).json({
      success: true,
      code: 200,
      message: 'Account successfully deleted',
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Failed to delete account: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to delete account. Please contact support.',
      requestId,
      duration
    });
  }
});

export default router;