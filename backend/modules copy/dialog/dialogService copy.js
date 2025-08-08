import AppwriteService from '../../appwrite.js';
import crypto from 'crypto';

const { createQuery } = AppwriteService;
const Query = createQuery();

class DialogService {

  async handleDialogRequest(userId, occupantId, jwtToken, requestedUserId, requestId, log) {
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

      throw new Error(errorMessage);
    }

    const deterministicPair = [userId, occupantId].sort();
    log(`[${requestId}] Sorted pair: [${deterministicPair.join(', ')}]`);

    // Run blockage check and dialog check in parallel
    log(`[${requestId}] Running parallel checks...`);

    const [blockage, existingDialog] = await Promise.all([
      this.hasAnyBlockage(jwtToken, userId, occupantId, requestId, log),
      this.checkIfDialogExists(jwtToken, deterministicPair, requestId, log)
    ]);

    log(`[${requestId}] Parallel checks completed`);

    if (blockage.length > 0) {
      log(`[${requestId}] Blockage found, rejecting request`);
      throw new Error('senderId or receiverId are blocked');
    }

    let dialog = existingDialog;

    if (!dialog) {
      log(`[${requestId}] Dialog not found, creating new one...`);
      dialog = await this.createDialog(jwtToken, deterministicPair, requestId, log);
      log(`[${requestId}] Dialog created with ID: ${dialog.$id}`);
    } else {
      log(`[${requestId}] Existing dialog found with ID: ${dialog.$id}`);
    }

    return dialog;
  }

  // Check if dialog exists between two users (using JWT - read operation)
  async checkIfDialogExists(jwtToken, occupantsPair, requestId, log) {
    try {
      log(`[${requestId}] Querying dialogs collection for occupants: [${occupantsPair.join(', ')}]`);

      const appwriteService = new AppwriteService();
      const documents = await appwriteService.listDocuments(
        jwtToken, // Use JWT for read operations
        process.env.DB_COLLECTION_DIALOGS_ID,
        [
          Query.contains('occupantIds', occupantsPair[0]),
          Query.contains('occupantIds', occupantsPair[1]),
          Query.limit(2)
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
        // Multiple dialogs found - this shouldn't happen theoretically
        log(`[${requestId}] WARNING: Multiple dialogs found, returning first one`);
        return documents.documents[0];
      }
    } catch (e) {
      log(`[${requestId}] ERROR in checkIfDialogExists: ${e.message}`);
      throw new Error(`Failed to check dialog existence: ${e.message}`);
    }
  }

  // Create new dialog with admin privileges for permission assignment
  async createDialog(jwtToken, occupants, requestId, log) {
    try {
      const date = new Date().toISOString();
      log(`[${requestId}] Creating new dialog for occupants: [${occupants.join(', ')}]`);

      const combined = occupants.join('_');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      const dialogId = `dialog_${hash.substring(0, 20)}`;

      const appwriteService = new AppwriteService();

      // Use admin privileges to create document with permissions for both users
      const dialog = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken, // This validates the JWT first
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
          { userId: receiverId, permissions: ['read'] }
        ]
      );

      log(`[${requestId}] Dialog created successfully with ID: ${dialog.$id}`);
      return dialog;

    } catch (e) {
      // Handle duplicate creation gracefully
      if (e.code === 409 || e.message.includes('already exists')) {
        log(`[${requestId}] Dialog already exists, fetching existing one...`);

        const existingDialog = await this.checkIfDialogExists(jwtToken, occupants, requestId, log);
        if (existingDialog) {
          log(`[${requestId}] Retrieved existing dialog: ${existingDialog.$id}`);
          return existingDialog;
        }
      }

      log(`[${requestId}] ERROR in createDialog: ${e.message}`);
      throw new Error(`Failed to create dialog: ${e.message}`);
    }
  }

  // Check for blockages between users (using JWT - read operation)
  async hasAnyBlockage(jwtToken, senderId, receiverId, requestId, log) {
    try {
      log(`[${requestId}] Checking blockages between ${senderId} and ${receiverId}`);
      const appwriteService = new AppwriteService();
      const documents = await appwriteService.listDocuments(
        jwtToken, // Use JWT for read operations
        process.env.DB_COLLECTION_BLOCKS_ID,
        [
          Query.or([
            Query.and([
              Query.equal('blockerId', [senderId]),
              Query.equal('blockedId', [receiverId]),
            ]),
            Query.and([
              Query.equal('blockerId', [receiverId]),
              Query.equal('blockedId', [senderId]),
            ])
          ])
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
}

export default new DialogService();