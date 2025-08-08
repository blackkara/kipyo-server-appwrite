import { Client, Databases, Permission, Query, Role } from 'node-appwrite';
import fetch from 'node-fetch';

const interactions = ['block', 'unblock', 'mute', 'unmute'];

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
        function_name: 'user-interactions'
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

// Optimize edilmiş block/unblock işlemi
async function blockUser(databases, senderId, receiverId, blocked, requestId, log, logger) {
  try {
    const operationStart = Date.now();

    // Dialog blockage ve user blockage işlemlerini paralel çalıştır
    const [dialogResult, userResult] = await Promise.all([
      handleDialogBlockageOptimized(databases, senderId, receiverId, blocked, requestId, log, logger),
      handleUserBlockageOptimized(databases, senderId, receiverId, blocked, requestId, log, logger)
    ]);

    const operationDuration = Date.now() - operationStart;

    await logger.track('user_interaction_completed', {
      request_id: requestId,
      interaction_type: blocked ? 'block' : 'unblock',
      sender_id: senderId,
      receiver_id: receiverId,
      operation_duration_ms: operationDuration,
      dialog_affected: dialogResult.affected,
      user_record_action: userResult.action,
      optimization: 'parallel_operations'
    });

    log(`[${requestId}] ${blocked ? 'Block' : 'Unblock'} operation completed in ${operationDuration}ms`);

    return { dialogResult, userResult, operationDuration };

  } catch (e) {
    log(`[${requestId}] ERROR in blockUserOptimized: ${e.message}`);
    throw new Error(`Failed to ${blocked ? 'block' : 'unblock'} user: ${e.message}`);
  }
}

// Optimize edilmiş dialog blockage handling
async function handleDialogBlockageOptimized(databases, senderId, receiverId, blocked, requestId, log, logger) {
  try {
    const queryStart = Date.now();
    const occupantsPair = [senderId, receiverId].sort();

    const documents = await databases.listDocuments(
      process.env.DB_ID,
      process.env.DB_COLLECTION_DIALOGS_ID,
      [
        Query.equal('occupantIds', occupantsPair),
        Query.limit(1)
      ]
    );

    const queryDuration = Date.now() - queryStart;

    await logger.track('database_query', {
      request_id: requestId,
      query_type: 'find_dialog_for_blockage',
      duration_ms: queryDuration,
      result_count: documents.total,
      occupants: occupantsPair
    });

    if (documents.total === 1) {
      const dialog = documents.documents[0];
      const currentBlockedIds = dialog.blockedIds || [];

      const newBlockedIds = blocked
        ? currentBlockedIds.includes(receiverId)
          ? currentBlockedIds
          : [...currentBlockedIds, receiverId]
        : currentBlockedIds.filter(id => id !== receiverId);

      // Sadece değişiklik varsa güncelle
      if (JSON.stringify(currentBlockedIds.sort()) !== JSON.stringify(newBlockedIds.sort())) {
        const updateStart = Date.now();

        await databases.updateDocument(
          process.env.DB_ID,
          process.env.DB_COLLECTION_DIALOGS_ID,
          dialog.$id,
          {
            'blockedIds': newBlockedIds
          }
        );

        const updateDuration = Date.now() - updateStart;

        await logger.track('database_operation', {
          request_id: requestId,
          operation_type: 'update_dialog_blockage',
          duration_ms: updateDuration,
          dialog_id: dialog.$id,
          blocked_ids_count: newBlockedIds.length,
          action: blocked ? 'add_block' : 'remove_block'
        });

        log(`[${requestId}] Dialog blockage updated in ${updateDuration}ms`);
        return { affected: true, action: blocked ? 'blocked' : 'unblocked', dialogId: dialog.$id };
      } else {
        log(`[${requestId}] Dialog blockage unchanged - no update needed`);
        return { affected: false, action: 'no_change', dialogId: dialog.$id };
      }
    } else {
      log(`[${requestId}] No dialog found for blockage update`);
      return { affected: false, action: 'no_dialog_found' };
    }

  } catch (e) {
    log(`[${requestId}] ERROR in handleDialogBlockageOptimized: ${e.message}`);
    throw new Error(`Failed to handle dialog blockage: ${e.message}`);
  }
}

// Optimize edilmiş user blockage handling
async function handleUserBlockageOptimized(databases, senderId, receiverId, blocked, requestId, log, logger) {
  try {
    const queryStart = Date.now();

    const documents = await databases.listDocuments(
      process.env.DB_ID,
      process.env.DB_COLLECTION_BLOCKS_ID,
      [
        Query.equal('blockerId', senderId),
        Query.equal('blockedId', receiverId),
        Query.limit(1)
      ]
    );

    const queryDuration = Date.now() - queryStart;

    await logger.track('database_query', {
      request_id: requestId,
      query_type: 'find_user_block_record',
      duration_ms: queryDuration,
      result_count: documents.total,
      blocker_id: senderId,
      blocked_id: receiverId
    });

    const operationStart = Date.now();
    let result = { action: 'no_change' };

    if (documents.total === 1) {
      const document = documents.documents[0];
      if (!blocked) {
        // Unblock: Delete the record
        await databases.deleteDocument(
          process.env.DB_ID,
          process.env.DB_COLLECTION_BLOCKS_ID,
          document.$id
        );
        result = { action: 'deleted', recordId: document.$id };
        log(`[${requestId}] Block record deleted: ${document.$id}`);
      } else {
        // Block: Record already exists, no action needed
        result = { action: 'already_exists', recordId: document.$id };
        log(`[${requestId}] Block record already exists: ${document.$id}`);
      }
    } else if (documents.total === 0) {
      if (blocked) {
        // Block: Create new record
        const newRecord = await databases.createDocument(
          process.env.DB_ID,
          process.env.DB_COLLECTION_BLOCKS_ID,
          'unique()',
          {
            'blockerId': senderId,
            'blockedId': receiverId,
            'blockedProfile': receiverId
          },
          [
            Permission.read(Role.user(senderId)),
            Permission.update(Role.user(senderId)),
            Permission.delete(Role.user(senderId)),
            Permission.read(Role.user(receiverId))
          ]
        );
        result = { action: 'created', recordId: newRecord.$id };
        log(`[${requestId}] Block record created: ${newRecord.$id}`);
      } else {
        // Unblock: No record exists, no action needed
        result = { action: 'not_found' };
        log(`[${requestId}] No block record found to unblock`);
      }
    }

    const operationDuration = Date.now() - operationStart;

    await logger.track('database_operation', {
      request_id: requestId,
      operation_type: 'handle_user_blockage',
      duration_ms: operationDuration,
      action: result.action,
      blocker_id: senderId,
      blocked_id: receiverId,
      record_id: result.recordId
    });

    return result;

  } catch (e) {
    log(`[${requestId}] ERROR in handleUserBlockageOptimized: ${e.message}`);
    throw new Error(`Failed to handle user blockage: ${e.message}`);
  }
}

// Optimize edilmiş mute/unmute işlemi (gelecek implementasyon için hazır)
async function muteUserOptimized(databases, senderId, receiverId, muted, requestId, log, logger) {
  try {
    const operationStart = Date.now();

    // TODO: Mute/unmute logic burada implement edilecek
    // Şimdilik placeholder
    log(`[${requestId}] Mute operation (${muted ? 'mute' : 'unmute'}) - Implementation pending`);

    const operationDuration = Date.now() - operationStart;

    await logger.track('user_interaction_completed', {
      request_id: requestId,
      interaction_type: muted ? 'mute' : 'unmute',
      sender_id: senderId,
      receiver_id: receiverId,
      operation_duration_ms: operationDuration,
      status: 'pending_implementation'
    });

    return { action: 'pending_implementation', operationDuration };

  } catch (e) {
    log(`[${requestId}] ERROR in muteUserOptimized: ${e.message}`);
    throw new Error(`Failed to ${muted ? 'mute' : 'unmute'} user: ${e.message}`);
  }
}

// Batch validation fonksiyonu
function validateRequest(req, requestedUserId, requestId, log, logger) {
  const { interactionType, senderId, receiverId } = req.body;

  const validationErrors = [];

  // Required field kontrolü
  if (!interactionType) validationErrors.push('interactionType');
  if (!senderId) validationErrors.push('senderId');
  if (!receiverId) validationErrors.push('receiverId');

  // Interaction type kontrolü
  if (interactionType && !interactions.includes(interactionType)) {
    validationErrors.push('invalid_interaction_type');
  }

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
    await logger.track('interaction_request_started', {
      request_id: requestId,
      user_id: requestedUserId,
      interaction_type: req.body.interactionType,
      optimization: 'parallel_enabled'
    });

    log(`[${requestId}] User interaction request started with PARALLEL optimization`);

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
        'invalid_interaction_type': 'interactionType parameter is not valid',
        'same_sender_receiver': 'senderId and receiverId cannot be the same',
        'requester_is_receiver': 'requesterUserId cannot be the same as receiverId',
        'requester_not_sender': 'requesterUserId must be the same as senderId'
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

    const { interactionType, senderId, receiverId } = req.body;

    // Client initialization
    const clientStart = Date.now();
    const { databases } = getClient();
    const clientDuration = Date.now() - clientStart;

    await logger.logStep(requestId, 'client_initialized', { duration_ms: clientDuration });
    log(`[${requestId}] STEP 1: Client initialized in ${clientDuration}ms`);

    // Interaction processing
    const processStart = Date.now();
    let result;

    if (interactionType === 'block') {
      result = await blockUser(databases, senderId, receiverId, true, requestId, log, logger);
    } else if (interactionType === 'unblock') {
      result = await blockUser(databases, senderId, receiverId, false, requestId, log, logger);
    } else if (interactionType === 'mute') {
      result = await muteUserOptimized(databases, senderId, receiverId, true, requestId, log, logger);
    } else if (interactionType === 'unmute') {
      result = await muteUserOptimized(databases, senderId, receiverId, false, requestId, log, logger);
    }

    const processDuration = Date.now() - processStart;

    await logger.logStep(requestId, 'interaction_processed', {
      duration_ms: processDuration,
      interaction_type: interactionType,
      result: result
    });
    log(`[${requestId}] STEP 2: ${interactionType} processed in ${processDuration}ms`);

    // Success!
    const endTime = Date.now();
    const duration = endTime - startTime;

    await logger.logPerformance(requestId, duration, true, {
      user_id: requestedUserId,
      interaction_type: interactionType,
      sender_id: senderId,
      receiver_id: receiverId,
      client_duration_ms: clientDuration,
      process_duration_ms: processDuration,
      optimization: 'parallel_enabled'
    });

    await logger.track('interaction_request_completed', {
      request_id: requestId,
      user_id: requestedUserId,
      interaction_type: interactionType,
      sender_id: senderId,
      receiver_id: receiverId,
      duration_ms: duration,
      result: result,
      optimization: 'parallel_enabled'
    });

    log(`[${requestId}] Request completed successfully in ${duration}ms with PARALLEL optimization`);

    return res.json({
      success: true,
      interactionType: interactionType,
      result: result,
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
      interaction_type: req.body.interactionType,
      duration_ms: duration,
      optimization: 'parallel_enabled'
    });

    await logger.logPerformance(requestId, duration, false, {
      error_type: e.code || 'unknown_error',
      optimization: 'parallel_enabled'
    });

    error(`[${requestId}] Request failed after ${duration}ms:`, e);
    log(`[${requestId}] ERROR Details: ${e.message}`);

    return res.json({
      code: 500,
      type: e.code || 'processing_error',
      message: e.message || 'Unknown error',
      requestId: requestId
    });
  }
};