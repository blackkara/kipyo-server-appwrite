import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dialogRoutes from './modules/dialog/dialogRoutes.js';
import messageRoutes from './modules/message/messageRoutes.js';
import interactionRoutes from './modules/interaction/interactionRoutes.js';
import matchRoutes from './modules/match/matchRoutes.js';
import exploreRoutes from './modules/explore/exploreRoutes.js';
import profileRoutes from './modules/profile/profileRoutes.js';
import { ERROR_CODES, AppError, ErrorHandler } from './utils/errorConstants.js'

import AppwriteService from './services/appwrite/AppwriteService.js';
const appwriteService = AppwriteService.getInstance();
setInterval(() => {
  const cacheStats = appwriteService.getCacheStats();
  console.log('Connection Cache:', cacheStats);
}, 5000); // 5 seconds


import { initializeApp, cert } from 'firebase-admin/app';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON dosya yolu
const serviceAccountPath = path.join(__dirname, 'kipyo-prod-firebase-adminsdk.json');
const serviceAccount = cert(serviceAccountPath);

initializeApp({
  credential: serviceAccount,
});

// Load environment variables
dotenv.config({ path: '.env.local', override: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Request timing middleware (en başta olmalı)
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// CORS middleware
app.use(cors());

// Body parser middleware with size limits
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Photo upload endpoint'i için özel kontrol
    if (req.url.includes('/uploadPhoto') && buf.length > 10 * 1024 * 1024) {
      const error = new AppError(ERROR_CODES.IMAGE_TOO_LARGE, 'Image size cannot exceed 10MB');
      throw error;
    }
  }
}));

app.use(express.urlencoded({
  limit: '10mb',
  extended: true
}));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  // Request ID'yi req objesine ekle
  req.requestId = requestId;

  console.log(`[${requestId}] ${timestamp} - ${req.method} ${req.path}`);

  // Response log için
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - req.startTime;
    console.log(`[${requestId}] Response: ${res.statusCode} - ${duration}ms`);
    return originalSend.call(this, data);
  };

  next();
});

// Routes
app.use('/api', dialogRoutes);
app.use('/api', exploreRoutes);
app.use('/api', interactionRoutes);
app.use('/api', matchRoutes);
app.use('/api', messageRoutes);
app.use('/api', profileRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Dialog Service API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /api/dialogs': 'Create or get dialog',
      'GET /api/dialogs/health': 'Health check',
      'POST /api/profile/update': 'Update profile',
      'POST /api/profile/uploadPhoto': 'Upload photo',
      'GET /api/explore': 'Explore profiles',
      'POST /api/interactions': 'Create interaction',
      'GET /api/matches': 'Get matches',
      'POST /api/messages': 'Send message'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// 404 handler (error handler'dan önce olmalı)
app.use((req, res, next) => {
  const error = new AppError(ERROR_CODES.UNKNOWN_ERROR, `Endpoint not found: ${req.method} ${req.path}`);
  error.statusCode = 404;
  error.type = 'general_not_found';
  next(error);
});

// Global error handling middleware (en sonda olmalı)
app.use((error, req, res, next) => {
  const requestId = req.requestId || Math.random().toString(36).substring(7);
  const duration = Date.now() - (req.startTime || Date.now());

  // PayloadTooLargeError handling
  if (error.type === 'entity.too.large') {
    const appError = new AppError(ERROR_CODES.IMAGE_TOO_LARGE,
      `Request payload too large. Maximum allowed size is 10MB, received: ${Math.round(error.length / 1024 / 1024)}MB`);
    return ErrorHandler.handleControllerError(appError, res, requestId, req.startTime || Date.now());
  }

  // SyntaxError (malformed JSON) handling
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    const appError = new AppError(ERROR_CODES.INVALID_PARAMETER_VALUE, 'Invalid JSON format in request body');
    return ErrorHandler.handleControllerError(appError, res, requestId, req.startTime || Date.now());
  }

  // AppError handling
  if (error instanceof AppError) {
    return ErrorHandler.handleControllerError(error, res, requestId, req.startTime || Date.now());
  }

  // Unhandled errors
  console.error(`[${requestId}] Unhandled error:`, {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    headers: req.headers
  });

  const unknownError = new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal server error occurred');
  return ErrorHandler.handleControllerError(unknownError, res, requestId, req.startTime || Date.now());
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});

export default app;