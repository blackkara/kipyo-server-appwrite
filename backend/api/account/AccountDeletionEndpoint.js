// src/api/account/AccountDeletionEndpoint.js

import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import AppwriteService from '../../services/appwrite/AppwriteService.js';
import authenticateUser from '../../middleware/authenticateUser.js';

const router = express.Router();

// In-memory storage for OTP codes and deletion tokens
// In production, consider using Redis or database storage
const otpStore = new Map();
const deletionTokenStore = new Map();

// OTP configuration
const OTP_LENGTH = 6;
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
 * Step 1: Request OTP code
 * POST /api/account/deletion/request-otp
 */
router.post('/deletion/request-otp', authenticateUser, async (req, res) => {
  const { email } = req.body;
  const { requestedUser, requestId, log, error } = req;
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

    // Check if user's email matches (optional security check)
    // You might want to verify this against the user's registered email
    
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000);
    
    // Store OTP with user info
    const otpKey = `${requestedUser.$id}:${email}`;
    otpStore.set(otpKey, {
      otp,
      email,
      userId: requestedUser.$id,
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
            If you did not request this, please ignore this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    const duration = Date.now() - startTime;
    log(`OTP sent to ${email} for user ${requestedUser.$id} in ${duration}ms`);

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
    error(`Failed to send OTP: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to send verification code',
      requestId,
      duration
    });
  }
});

/**
 * Step 2: Verify OTP and get deletion token
 * POST /api/account/deletion/verify-otp
 */
router.post('/deletion/verify-otp', authenticateUser, async (req, res) => {
  const { email, otp } = req.body;
  const { requestedUser, requestId, log, error } = req;
  const startTime = Date.now();

  try {
    // Validate input
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Email and OTP code are required',
        requestId
      });
    }

    // Check OTP
    const otpKey = `${requestedUser.$id}:${email}`;
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
      userId: requestedUser.$id,
      email,
      expiresAt: tokenExpiresAt
    });

    // Remove used OTP
    otpStore.delete(otpKey);

    const duration = Date.now() - startTime;
    log(`OTP verified for user ${requestedUser.$id} in ${duration}ms`);

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
    error(`Failed to verify OTP: ${err.message}`, err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to verify code',
      requestId,
      duration
    });
  }
});

/**
 * Step 3: Delete account with deletion token
 * DELETE /api/account/deletion/confirm
 */
router.delete('/deletion/confirm', authenticateUser, async (req, res) => {
  const { deletionToken } = req.body;
  const { jwtToken, requestedUser, requestId, log, error } = req;
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
        message: 'Deletion token has expired',
        requestId
      });
    }

    // Verify token belongs to requesting user
    if (tokenData.userId !== requestedUser.$id) {
      return res.status(403).json({
        success: false,
        code: 403,
        message: 'Unauthorized deletion attempt',
        requestId
      });
    }

    // Get AppwriteService instance
    const appwriteService = AppwriteService.getInstance();
    
    // Perform account deletion
    log(`Starting account deletion for user ${requestedUser.$id}`);
    
    // 1. Delete user's messages
    try {
      await appwriteService.deleteUserMessages(jwtToken, requestedUser.$id);
      log(`Deleted messages for user ${requestedUser.$id}`);
    } catch (err) {
      log(`Failed to delete messages: ${err.message}`);
    }

    // 2. Delete user's matches
    try {
      await appwriteService.deleteUserMatches(jwtToken, requestedUser.$id);
      log(`Deleted matches for user ${requestedUser.$id}`);
    } catch (err) {
      log(`Failed to delete matches: ${err.message}`);
    }

    // 3. Delete user's profile data
    try {
      await appwriteService.deleteUserProfile(jwtToken, requestedUser.$id);
      log(`Deleted profile for user ${requestedUser.$id}`);
    } catch (err) {
      log(`Failed to delete profile: ${err.message}`);
    }

    // 4. Delete user account from Appwrite
    try {
      await appwriteService.deleteUserAccount(jwtToken, requestedUser.$id);
      log(`Deleted account for user ${requestedUser.$id}`);
    } catch (err) {
      log(`Failed to delete account: ${err.message}`);
    }

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
      log(`Failed to send deletion confirmation email: ${err.message}`);
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

/**
 * Get deletion status (for UI)
 * GET /api/account/deletion/status
 */
router.get('/deletion/status', authenticateUser, async (req, res) => {
  const { requestedUser, requestId } = req;
  const startTime = Date.now();

  try {
    // Check if user has pending OTP
    let hasPendingOTP = false;
    for (const [key, value] of otpStore.entries()) {
      if (key.startsWith(`${requestedUser.$id}:`) && value.expiresAt > Date.now()) {
        hasPendingOTP = true;
        break;
      }
    }

    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      code: 200,
      data: {
        hasPendingOTP,
        otpExpiryMinutes: OTP_EXPIRY_MINUTES,
        deletionTokenExpiryMinutes: DELETION_TOKEN_EXPIRY_MINUTES
      },
      requestId,
      duration
    });

  } catch (err) {
    const duration = Date.now() - startTime;

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to get status',
      requestId,
      duration
    });
  }
});

export default router;