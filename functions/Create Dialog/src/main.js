import { Client, Databases, Query, Permission, Role } from 'node-appwrite';
import crypto from 'crypto';

// Global client - reuse across requests
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

// Main function - cleaned version without PostHog
export default async ({ req, res, log, error }) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  const requestedUserId = req.headers['x-appwrite-user-id'];

  try {
    log(`[${requestId}] Dialog request started`);

    if (!requestedUserId) {
      log(`[${requestId}] ERROR: Missing requesterUserId header`);
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'requesterUserId parameter is required'
      });
    }

    const { userId, occupantId } = req.body;
    log(`[${requestId}] Request params: userId=${userId}, occupantId=${occupantId}, requesterId=${requestedUserId}`);

    // Quick validation
    const validationErrors = [];
    if (!userId) validationErrors.push('userId');
    if (!occupantId) validationErrors.push('occupantId');
    if (occupantId === userId) validationErrors.push('same_user_ids');
    if (requestedUserId !== userId && requestedUserId !== occupantId) validationErrors.push('unauthorized_access');

    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.includes('same_user_ids')
        ? 'userId and occupantId cannot be the same'
        : validationErrors.includes('unauthorized_access')
          ? 'requesterUserId must be the same as userId or occupantId'
          : `${validationErrors.join(', ')} parameter(s) are required`;

      log(`[${requestId}] ERROR: ${errorMessage}`);
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: errorMessage
      });
    }

    const { databases } = getClient();
    log(`[${requestId}] Client initialized`);

    const deterministicPair = [userId, occupantId].sort();
    log(`[${requestId}] Sorted pair: [${deterministicPair.join(', ')}]`);

    // Run blockage check and dialog check in parallel
    log(`[${requestId}] Running parallel checks...`);

    const [blockage, existingDialog] = await Promise.all([
      hasAnyBlockage(databases, userId, occupantId, requestId, log),
      checkIfDialogExists(databases, deterministicPair, requestId, log)
    ]);

    log(`[${requestId}] Parallel checks completed`);

    if (blockage.length > 0) {
      log(`[${requestId}] Blockage found, rejecting request`);
      return res.json({
        code: 400,
        type: 'has_blocked_participants',
        message: 'senderId or receiverId are blocked'
      });
    }

    let dialog = existingDialog;

    if (!dialog) {
      log(`[${requestId}] Dialog not found, creating new one...`);
      dialog = await createDialog(databases, deterministicPair, requestId, log);
      log(`[${requestId}] Dialog created with ID: ${dialog.$id}`);
    } else {
      log(`[${requestId}] Existing dialog found with ID: ${dialog.$id}`);
    }

    const duration = Date.now() - startTime;
    log(`[${requestId}] Request completed successfully in ${duration}ms`);

    return res.json({ dialog: dialog });

  } catch (e) {
    const duration = Date.now() - startTime;
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

// Check if dialog exists
async function checkIfDialogExists(databases, occupantsPair, requestId, log) {
  try {
    log(`[${requestId}] Querying dialogs collection for occupants: [${occupantsPair.join(', ')}]`);

    const documents = await databases.listDocuments(
      process.env.DB_ID,
      process.env.DB_COLLECTION_DIALOGS_ID,
      [
        Query.contains('occupantIds', occupantsPair[0]),
        Query.contains('occupantIds', occupantsPair[1]),
        Query.limit(2) // En fazla 2 sonuç bekleriz
      ]
    );

    log(`[${requestId}] Dialog query result: ${documents.total} documents found`);

    if (documents.total < 1) {
      log(`[${requestId}] No existing dialog found`);
      return null;
    } else if (documents.total === 1) {
      log(`[${requestId}] Found existing dialog: ${documents.documents[0].$id}`);
      return documents.documents[0];
    } else {
      // Birden fazla dialog bulundu - bu teorik olarak olmamalı
      log(`[${requestId}] WARNING: Multiple dialogs found, returning first one`);
      return documents.documents[0];
    }
  } catch (e) {
    log(`[${requestId}] ERROR in checkIfDialogExists: ${e.message}`);
    throw new Error(`Failed to check dialog existence: ${e.message}`);
  }
}

// Create dialog with race condition handling
async function createDialog(databases, occupants, requestId, log) {
  try {
    const date = new Date().toISOString();
    log(`[${requestId}] Creating new dialog for occupants: [${occupants.join(', ')}]`);

    // Generate deterministic ID to prevent race conditions
    const combined = occupants.join('_');
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    const dialogId = `dialog_${hash.substring(0, 20)}`;

    const dialog = await databases.createDocument(
      process.env.DB_ID,
      process.env.DB_COLLECTION_DIALOGS_ID,
      dialogId,
      {
        'occupants': occupants,
        'occupantIds': occupants,
        'createdAt': date,
        'updatedAt': date,
        'lastMessage': '',
        'lastMessageSenderId': '',
        'blockedIds': []
      },
      [
        Permission.read(Role.user(occupants[0])),
        Permission.read(Role.user(occupants[1])),
        Permission.update(Role.user(occupants[0])),
        Permission.update(Role.user(occupants[1])),
        Permission.delete(Role.user(occupants[0])),
        Permission.delete(Role.user(occupants[1])),
      ]
    );

    log(`[${requestId}] Dialog created successfully with ID: ${dialog.$id}`);
    return dialog;

  } catch (e) {
    // Handle duplicate creation gracefully
    if (e.code === 409 || e.message.includes('already exists')) {
      log(`[${requestId}] Dialog already exists, fetching existing one...`);

      const existingDialog = await checkIfDialogExists(databases, occupants, requestId, log);
      if (existingDialog) {
        log(`[${requestId}] Retrieved existing dialog: ${existingDialog.$id}`);
        return existingDialog;
      }
    }

    log(`[${requestId}] ERROR in createDialog: ${e.message}`);
    throw new Error(`Failed to create dialog: ${e.message}`);
  }
}

// Check for blockages between users
async function hasAnyBlockage(databases, senderId, receiverId, requestId, log) {
  try {
    log(`[${requestId}] Checking blockages between ${senderId} and ${receiverId}`);

    const documents = await databases.listDocuments(
      process.env.DB_ID,
      process.env.DB_COLLECTION_BLOCKS_ID,
      [
        Query.or([
          Query.and([
            Query.equal('blockerId', senderId),
            Query.equal('blockedId', receiverId)
          ]),
          Query.and([
            Query.equal('blockerId', receiverId),
            Query.equal('blockedId', senderId)
          ])
        ]),
        Query.limit(1)
      ]
    );

    log(`[${requestId}] Blockage query result: ${documents.total} blocks found`);

    if (documents.total < 1) {
      log(`[${requestId}] No blockages found`);
      return [];
    } else {
      log(`[${requestId}] Found ${documents.total} blockage(s)`);
      return documents.documents;
    }

  } catch (e) {
    log(`[${requestId}] ERROR in hasAnyBlockage: ${e.message}`);
    throw new Error(`Failed to check blockages: ${e.message}`);
  }
}