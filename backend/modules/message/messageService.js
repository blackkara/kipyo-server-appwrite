import AppwriteService from '../../appwrite.js';

const { createQuery } = AppwriteService;
const Query = createQuery();
class MessageService {

  async send(message, senderId, receiverId, dialogId, jwtToken, requestedUserId, requestId, log) {

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
      this.updateDialog(message, senderId,  receiverId, dialogId, jwtToken, requestId, log)
    ]);
  }

  async sendMessage(message, senderId, receiverId, dialogId, jwtToken, requestId, log) {
    try {
      const date = new Date().toISOString();
      log(`[${requestId}] Creating new message for dialog: ${dialogId}`);

      const appwriteService = new AppwriteService();

      const newMessage = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken,
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

      const appwriteService = new AppwriteService();
      const updatedDialog = await appwriteService.updateDocumentWithAdminPrivileges(
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

const errorMessages = {
  'same_sender_receiver': 'senderId and receiverId cannot be the same',
  'requester_is_receiver': 'requesterUserId cannot be the same as receiverId',
  'requester_not_sender': 'requesterUserId must be the same as senderId',
  'message_empty': 'message cannot be empty',
  'dialogId_empty': 'dialogId cannot be empty'
};

export default new MessageService();