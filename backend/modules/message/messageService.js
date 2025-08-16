import AppwriteService from '../../services/appwrite/AppwriteService.js';

const { createQuery } = AppwriteService;
const Query = createQuery();

import crypto from 'crypto';

class MessageService {

  async sendMessage(message, senderId, receiverId, dialogId, jwtToken, requestedUserId, requestId, log) {

    const validationErrors = [];
    if (!message) validationErrors.push('message');
    if (!senderId) validationErrors.push('senderId');
    if (!receiverId) validationErrors.push('receiverId');
    if (!dialogId) validationErrors.push('dialogId');
    if (senderId === receiverId) validationErrors.push('same_user_ids');

    if (message === '') validationErrors.push('message_empty');
    if (dialogId === '') validationErrors.push('dialogId_empty');

    if (senderId === receiverId) validationErrors.push('same_sender_receiver');
    if (requestedUserId === receiverId) validationErrors.push('requester_is_receiver');
    if (requestedUserId !== senderId) validationErrors.push('requester_not_sender');

    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.map(err =>
        errorMessages[err] || `${err} parameter is required`
      ).join(', ');

      throw new Error(errorMessage);
    }

    const blockage = await this.checkBlockage(senderId, receiverId, jwtToken, requestId, log);

    if (blockage.length > 0) {
      log(`[${requestId}] Blockage found, rejecting request`);
      throw new Error('senderId or receiverId are blocked');
    }

    const [newMessage, updatedDialog] = await Promise.all([
      this.sendMessage(message, senderId, receiverId, dialogId, jwtToken, requestId, log),
      this.updateDialog(message, senderId, receiverId, dialogId, jwtToken, requestId, log)
    ]);
  }

  async sendDirectMessage(message, senderId, receiverId, jwtToken, requestedUserId, requestId, log) {
    const validationErrors = [];
    if (!message) validationErrors.push('message');
    if (!senderId) validationErrors.push('senderId');
    if (!receiverId) validationErrors.push('receiverId');

    if (message === '') validationErrors.push('message_empty');
    if (senderId === receiverId) validationErrors.push('same_sender_receiver');
    if (requestedUserId === receiverId) validationErrors.push('requester_is_receiver');
    if (requestedUserId !== senderId) validationErrors.push('requester_not_sender');

    if (validationErrors.length > 0) {
      const errorMessage = validationErrors.map(err =>
        errorMessages[err] || `${err} parameter is required`
      ).join(', ');

      throw new Error(errorMessage);
    }

    const result = {
      hasBlockage: false,
      hasExistingDialog: false,
      remainingDirectMessages: 0,
      dialog: null
    };

    const deterministicPair = [senderId, receiverId].sort();
    log(`[${requestId}] Sorted pair: [${deterministicPair.join(', ')}]`);

    log(`[${requestId}] Running parallel checks...`);
    const [blockage, dialog] = await Promise.all([
      this.hasBlockage(jwtToken, senderId, receiverId, requestId, log),
      this.hasDialog(jwtToken, deterministicPair, requestId, log)
    ]);

    if (blockage.length > 0) {
      log(`[${requestId}] Blockage found: ${blockage.map(b => b.$id).join(', ')}`);
      result.hasBlockage = true;
      return result;
    }

    if (dialog) {
      result.dialog = dialog;
      result.hasExistingDialog = true;
      log(`[${requestId}] Existing dialog found: ${dialog.$id}, sending message to existing dialog`);
      const [newMessage, updatedDialog] = await Promise.all([
        this.createMessage(message, senderId, receiverId, dialog.$id, jwtToken, requestId, log),
        this.updateDialog(message, senderId, receiverId, dialog.$id, jwtToken, requestId, log)
      ]);

      return {
        newMessage: newMessage,
        dialog: updatedDialog
      };
    } else {
      log(`[${requestId}] No existing dialog found, creating new dialog`);
      result.dialog = await this.createDialog(deterministicPair, senderId, jwtToken, requestId, log);
      const [newMessage, updatedDialog] = await Promise.all([
        this.createMessage(message, senderId, receiverId, result.dialog.$id, jwtToken, requestId, log),
        this.updateDialog(message, senderId, receiverId, result.dialog.$id, jwtToken, requestId, log)
      ]);

      return {
        newMessage: newMessage,
        dialog: updatedDialog
      };
    }
  }

  async createMessage(message, senderId, receiverId, dialogId, jwtToken, requestId, log) {
    try {

      log(`[${requestId}] Creating new message for dialog: ${dialogId}`);

      const appwriteService = AppwriteService.getInstance();
      const newMessage = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken,
        senderId,
        process.env.DB_COLLECTION_MESSAGES_ID,
        'unique()',
        {
          'message': message,
          'senderId': senderId,
          'receiverId': receiverId,
          'dialogId': dialogId
        },
        [
          { userId: receiverId, permissions: ['read'] }
        ]
      );

      log(`[${requestId}] Message created successfully with ID: ${newMessage.$id}`);
      return newMessage;
    } catch (e) {
      log(`[${requestId}] ERROR in sendMessage: ${e.message}`);
      throw new Error(`Failed to send message: ${e.message}`);
    }
  }

  async updateDialog(message, senderId, receiverId, dialogId, jwtToken, requestId, log) {
    try {
      log(`[${requestId}] Updating dialog last message: ${dialogId}`);

      const appwriteService = AppwriteService.getInstance();
      const updatedDialog = await appwriteService.updateDocumentWithAdminPrivileges(
        jwtToken,
        senderId,
        process.env.DB_COLLECTION_DIALOGS_ID,
        dialogId,
        {
          'lastMessage': message,
          'lastMessageSenderId': senderId
        },
        [
          { userId: receiverId, permissions: ['read'] }
        ]
      );

      log(`[${requestId}] Dialog updated successfully with ID: ${updatedDialog.$id}`);
      return updatedDialog;
    } catch (e) {
      log(`[${requestId}] ERROR in updateDialog: ${e.message}`);
      throw new Error(`Failed to update dialog: ${e.message}`);
    }
  }

  async checkBlockage(senderId, receiverId, jwtToken, requestId, log) {
    try {
      log(`[${requestId}] Checking blockages between ${senderId} and ${receiverId}`);
      const appwriteService = AppwriteService.getInstance();
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

  async hasBlockage(jwtToken, senderId, receiverId, requestId, log) {
    try {
      log(`[${requestId}] Checking blockages between ${senderId} and ${receiverId}`);

      const appwriteService = AppwriteService.getInstance();
      const documents = await appwriteService.listDocuments(
        jwtToken,
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

    } catch (error) {
      log(`[${requestId}] ERROR in hasAnyBlockage: ${error.message}`);
      throw new Error(`Failed to check blockages: ${error.message}`);
    }
  }

  async hasDialog(jwtToken, occupantsPair, requestId, log) {
    try {
      log(`[${requestId}] Querying dialogs collection for occupants: [${occupantsPair.join(', ')}]`);

      const appwriteService = AppwriteService.getInstance();
      const documents = await appwriteService.listDocuments(
        jwtToken,
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

    } catch (error) {
      log(`[${requestId}] ERROR in checkIfDialogExists: ${error.message}`);
      throw new Error(`Failed to check dialog existence: ${error.message}`);
    }
  }

  async createDialog(occupants, requestedUserId, jwtToken, requestId, log) {
    try {
      const date = new Date().toISOString();
      log(`[${requestId}] Creating new dialog for occupants: [${occupants.join(', ')}]`);

      const combined = occupants.join('_');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      const dialogId = `dialog_${hash.substring(0, 20)}`;

      const appwriteService = AppwriteService.getInstance();

      const dialog = await appwriteService.upsertDocumentWithAdminPrivileges(
        jwtToken,
        requestedUserId,
        process.env.DB_COLLECTION_DIALOGS_ID,
        dialogId,
        {
          'occupants': occupants,
          'occupantIds': occupants,
          'createdAt': date,
          'updatedAt': date,
          'lastMessage': '',
          'lastMessageSenderId': '',
          'blockedIds': [],
          'isDirect': true,
        },
        [
          { userId: occupants[0], permissions: ['read'] },
          { userId: occupants[1], permissions: ['read'] }
        ]
      );

      log(`[${requestId}] Dialog created successfully with ID: ${dialog.$id}`);
      return dialog;

    } catch (error) {
      log(`[${requestId}] ERROR in createDialog: ${error.message}`);
      throw new Error(`Failed to create dialog: ${error.message}`);
    }
  }
}

const errorMessages = {
  'same_sender_receiver': 'senderId and receiverId cannot be the same',
  'requester_is_receiver': 'requesterUserId cannot be the same as receiverId',
  'requester_not_sender': 'requesterUserId must be the same as senderId',
  'message_empty': 'message cannot be empty',
  'dialogId_empty': 'dialogId cannot be empty'
};

export default new MessageService();