import { Client, Databases, Permission, Role } from 'node-appwrite';
import fetch from 'node-fetch';

class PostHogLogger {
  constructor(log, userId = null) {
    this.log = log;
    this.userId = userId;
    this.apiKey = process.env.POSTHOG_API_KEY;
    this.host = process.env.POSTHOG_HOST || 'https://app.posthog.com';
    this.enabled = Boolean(this.apiKey);
  }

  async track(event, properties = {}, customDistinctId = null) {
    if (!this.enabled) return;

    const distinctId = customDistinctId || this.userId || `anonymous_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const eventData = {
      api_key: this.apiKey,
      event,
      distinct_id: distinctId,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        service: 'appwrite-functions',
        function_name: 'message-handler'
      }
    };

    try {
      const response = await fetch(`${this.host}/capture/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PostHog Node.js Library'
        },
        body: JSON.stringify(eventData),
        timeout: 10000
      });

      if (!response.ok) {
        const responseText = await response.text();
        this.log('PostHog API error:', {
          status: response.status,
          response: responseText,
          event
        });
      }
    } catch (error) {
      this.log('PostHog request failed:', {
        error: error.message,
        event
      });
    }
  }

  async logError(error, context = {}) {
    await this.track('function_error', {
      error_message: error.message,
      error_stack: error.stack,
      error_code: error.code,
      ...context
    });
  }

  async logPerformance(requestId, duration, success = true, context = {}) {
    await this.track('function_performance', {
      request_id: requestId,
      duration_ms: duration,
      success,
      ...context
    });
  }

  async logStep(requestId, step, data = {}) {
    await this.track('function_step', {
      request_id: requestId,
      step,
      ...data
    });
  }
}

// Global client cache
let globalClient = null;
let globalDatabases = null;

function getClient() {
  if (!globalClient) {
    globalClient = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    globalDatabases = new Databases(globalClient);
  }
  return { client: globalClient, databases: globalDatabases };
}

// Optimize edilmiş mesaj gönderme - Parallel operations
async function sendMessage(databases, message, senderId, receiverId, dialogId, requestId, log, logger) {
  try {
    const operationStart = Date.now();

    // Mesaj oluşturma ve dialog güncelleme işlemlerini paralel çalıştır
    const [newMessage, updatedDialog] = await Promise.all([
      databases.createDocument(
        process.env.DB_ID,
        process.env.DB_COLLECTION_MESSAGES_ID,
        'unique()',
        {
          'message': message,
          'senderId': senderId,
          'receiverId': receiverId,
          'dialogId': dialogId
        },
        [
          Permission.read(Role.user(senderId)),
          Permission.update(Role.user(senderId)),
          Permission.delete(Role.user(senderId)),
          Permission.read(Role.user(receiverId))
        ]
      ),
      databases.updateDocument(
        process.env.DB_ID,
        process.env.DB_COLLECTION_DIALOGS_ID,
        dialogId,
        {
          'lastMessage': message,
          'lastMessageSenderId': senderId
        }
      )
    ]);

    const operationDuration = Date.now() - operationStart;

    await logger.track('message_sent', {
      request_id: requestId,
      message_id: newMessage.$id,
      dialog_id: dialogId,
      sender_id: senderId,
      receiver_id: receiverId,
      message_length: message.length,
      operation_duration_ms: operationDuration,
      optimization: 'parallel_operations'
    });

    log(`[${requestId}] Message sent and dialog updated in parallel: ${operationDuration}ms`);

    return { newMessage, updatedDialog };

  } catch (e) {
    log(`[${requestId}] ERROR in sendMessageOptimized: ${e.message}`);
    throw new Error(`Failed to send message: ${e.message}`);
  }
}

// Optimize edilmiş dialog kontrolü
async function checkDialogOptimized(databases, dialogId, senderId, receiverId, requestId, log, logger) {
  try {
    const checkStart = Date.now();

    const dialog = await databases.getDocument(
      process.env.DB_ID,
      process.env.DB_COLLECTION_DIALOGS_ID,
      dialogId
    );

    const checkDuration = Date.now() - checkStart;

    await logger.track('database_operation', {
      request_id: requestId,
      operation_type: 'check_dialog',
      duration_ms: checkDuration,
      dialog_id: dialogId,
      has_blocked_ids: dialog.blockedIds?.length > 0
    });

    // Dialog occupants kontrolü
    const occupants = dialog.occupantIds || [];
    if (!occupants.includes(senderId) || !occupants.includes(receiverId)) {
      throw new Error('Sender or receiver is not part of this dialog');
    }

    // Blokaj kontrolü
    if (dialog.blockedIds && dialog.blockedIds.length > 0) {
      const hasBlockage = dialog.blockedIds.includes(senderId) || dialog.blockedIds.includes(receiverId);
      if (hasBlockage) {
        throw new Error('Dialog has blocked participants');
      }
    }

    log(`[${requestId}] Dialog validated successfully in ${checkDuration}ms`);
    return dialog;

  } catch (e) {
    log(`[${requestId}] ERROR in checkDialogOptimized: ${e.message}`);
    throw new Error(`Dialog validation failed: ${e.message}`);
  }
}

// Batch validation fonksiyonu
function validateRequest(req, requestedUserId, requestId, log, logger) {
  const { message, senderId, receiverId, dialogId } = req.body;

  const validationErrors = [];

  // Required field kontrolü
  if (!message) validationErrors.push('message');
  if (!senderId) validationErrors.push('senderId');
  if (!receiverId) validationErrors.push('receiverId');
  if (!dialogId) validationErrors.push('dialogId');

  // Empty field kontrolü
  if (message === '') validationErrors.push('message_empty');
  if (dialogId === '') validationErrors.push('dialogId_empty');

  // Logic kontrolü
  if (senderId === receiverId) validationErrors.push('same_sender_receiver');
  if (requestedUserId === receiverId) validationErrors.push('requester_is_receiver');
  if (requestedUserId !== senderId) validationErrors.push('requester_not_sender');

  return validationErrors;
}

// MAIN FUNCTION - OPTIMIZE EDİLMİŞ
export default async ({ req, res, log, error }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  const requestedUserId = req.headers['x-appwrite-user-id'];
  const logger = new PostHogLogger(log, requestedUserId);

  try {
    // Track request start
    await logger.track('message_request_started', {
      request_id: requestId,
      user_id: requestedUserId,
      optimization: 'parallel_enabled'
    });

    log(`[${requestId}] Message request started with PARALLEL optimization`);

    // Requester kontrolü
    if (!requestedUserId) {
      await logger.track('validation_error', {
        request_id: requestId,
        error_type: 'missing_header',
        field: 'x-appwrite-user-id'
      }, `anonymous_${requestId}`);

      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'requesterUserId parameter is required'
      });
    }

    // Batch validation
    const validationErrors = validateRequest(req, requestedUserId, requestId, log, logger);

    if (validationErrors.length > 0) {
      await logger.track('validation_error', {
        request_id: requestId,
        validation_errors: validationErrors,
        user_id: requestedUserId
      });

      const errorMessages = {
        'same_sender_receiver': 'senderId and receiverId cannot be the same',
        'requester_is_receiver': 'requesterUserId cannot be the same as receiverId',
        'requester_not_sender': 'requesterUserId must be the same as senderId',
        'message_empty': 'message cannot be empty',
        'dialogId_empty': 'dialogId cannot be empty'
      };

      const errorMessage = validationErrors.map(err =>
        errorMessages[err] || `${err} parameter is required`
      ).join(', ');

      log(`[${requestId}] ERROR: ${errorMessage}`);
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: errorMessage
      });
    }

    const { message, senderId, receiverId, dialogId } = req.body;

    // Client initialization
    const clientStart = Date.now();
    const { databases } = getClient();
    const clientDuration = Date.now() - clientStart;

    await logger.logStep(requestId, 'client_initialized', { duration_ms: clientDuration });
    log(`[${requestId}] STEP 1: Client initialized in ${clientDuration}ms`);

    // Dialog kontrolü
    const dialogStart = Date.now();
    const dialog = await checkDialogOptimized(databases, dialogId, senderId, receiverId, requestId, log, logger);
    const dialogDuration = Date.now() - dialogStart;

    await logger.logStep(requestId, 'dialog_validated', {
      duration_ms: dialogDuration,
      dialog_id: dialogId
    });
    log(`[${requestId}] STEP 2: Dialog validated in ${dialogDuration}ms`);

    // Mesaj gönderme (Parallel operations)
    const messageStart = Date.now();
    const { newMessage, updatedDialog } = await sendMessage(
      databases, message, senderId, receiverId, dialogId, requestId, log, logger
    );
    const messageDuration = Date.now() - messageStart;

    await logger.logStep(requestId, 'message_operations_completed', {
      duration_ms: messageDuration,
      message_id: newMessage.$id
    });
    log(`[${requestId}] STEP 3: Message operations completed in ${messageDuration}ms`);

    // Success!
    const endTime = Date.now();
    const duration = endTime - startTime;

    await logger.logPerformance(requestId, duration, true, {
      user_id: requestedUserId,
      message_id: newMessage.$id,
      dialog_id: dialogId,
      message_length: message.length,
      client_duration_ms: clientDuration,
      dialog_duration_ms: dialogDuration,
      message_duration_ms: messageDuration,
      optimization: 'parallel_enabled'
    });

    await logger.track('message_request_completed', {
      request_id: requestId,
      user_id: requestedUserId,
      message_id: newMessage.$id,
      dialog_id: dialogId,
      duration_ms: duration,
      optimization: 'parallel_enabled'
    });

    log(`[${requestId}] Request completed successfully in ${duration}ms with PARALLEL optimization`);

    return res.json({
      newMessage: newMessage,
      dialog: updatedDialog,
      _metadata: {
        requestId: requestId,
        duration: duration,
        optimization: 'parallel_enabled'
      }
    });

  } catch (e) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    await logger.logError(e, {
      request_id: requestId,
      user_id: requestedUserId,
      duration_ms: duration,
      optimization: 'parallel_enabled'
    });

    await logger.logPerformance(requestId, duration, false, {
      error_type: e.code || 'unknown_error',
      optimization: 'parallel_enabled'
    });

    error(`[${requestId}] Request failed after ${duration}ms:`, e);
    log(`[${requestId}] ERROR Details: ${e.message}`);

    // Specific error handling
    if (e.message.includes('Dialog validation failed')) {
      return res.json({
        code: 400,
        type: 'dialog_validation_error',
        message: e.message,
        requestId: requestId
      });
    }

    if (e.message.includes('Dialog has blocked participants')) {
      return res.json({
        code: 400,
        type: 'has_blocked_participants',
        message: 'dialog is blocked',
        requestId: requestId
      });
    }

    return res.json({
      code: 500,
      type: e.code || 'processing_error',
      message: e.message || 'Unknown error',
      requestId: requestId
    });
  }
};