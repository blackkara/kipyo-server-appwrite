import AppwriteService from '../../appwrite_secure.js';

const { createQuery } = AppwriteService;
const Query = createQuery();

class MatchService {

  async unmatch(matchId, requestedUser, jwtToken, requestId, log) {
    try {
      // Validation
      const validationErrors = this.validateRequest(matchId, requestedUser.$id);

      if (validationErrors.length > 0) {
        const errorMessages = {
          'matchId': 'matchId parameter is required',
          'requestedUserId': 'requestedUserId parameter is required'
        };

        const errorMessage = validationErrors.map(err =>
          errorMessages[err] || `${err} parameter is required`
        ).join(', ');

        throw new Error(errorMessage);
      }

      log(`[${requestId}] Validation passed for unmatch operation`);

      // Process unmatch operation
      const processStart = Date.now();

      const result = await this.deleteMatch(jwtToken, matchId, requestedUser.$id, requestId, log);

      const processDuration = Date.now() - processStart;

      log(`[${requestId}] unmatch processed in ${processDuration}ms`);

      return {
        interactionType: 'unmatch',
        result: result,
        processDuration: processDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in unmatch: ${error.message}`);
      throw error;
    }
  }

  validateRequest(matchId, requestedUserId) {
    const validationErrors = [];

    // Required field validation
    if (!matchId) validationErrors.push('matchId');
    if (!requestedUserId) validationErrors.push('requestedUserId');

    return validationErrors;
  }

  async deleteMatch(jwtToken, matchId, requestedUserId, requestId, log) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting deleteMatch for matchId: ${matchId}`);

      const appwriteService = new AppwriteService();

      // First, get the match record to retrieve dialog information and validate ownership
      const queryStart = Date.now();
      const matchDocument = await appwriteService.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_MATCHES_ID,
        matchId
      );

      const queryDuration = Date.now() - queryStart;
      log(`[${requestId}] Match document retrieved in ${queryDuration}ms`);

      // Validate that the requesting user is part of this match
      const userFirst = matchDocument.userFirst;
      const userSecond = matchDocument.userSecond;

      if (requestedUserId !== userFirst && requestedUserId !== userSecond) {
        throw new Error('Unauthorized: User is not part of this match');
      }

      log(`[${requestId}] Match ownership validated for user: ${requestedUserId}`);

      // Get related document IDs first to delete them by specific IDs
      const [likesQuery, dialogsQuery] = await Promise.all([
        // Get likes documents
        appwriteService.listDocuments(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          [Query.equal('matchId', matchId)]
        ),
        // Get dialogs documents  
        appwriteService.listDocuments(
          jwtToken,
          process.env.DB_COLLECTION_DIALOGS_ID,
          [Query.equal('matchId', matchId)]
        )
      ]);

      // Delete all documents in parallel using specific document IDs
      const deleteStart = Date.now();

      const deletePromises = [
        // Delete match document
        appwriteService.deleteDocumentWithAdminPrivileges(

          process.env.DB_COLLECTION_MATCHES_ID,
          matchId
        )
      ];

      // Add likes deletion promises
      likesQuery.documents.forEach(doc => {
        deletePromises.push(
          appwriteService.deleteDocumentWithAdminPrivileges(

            process.env.DB_COLLECTION_LIKES_ID,
            doc.$id
          )
        );
      });

      // Add dialogs deletion promises
      dialogsQuery.documents.forEach(doc => {
        deletePromises.push(
          appwriteService.deleteDocumentWithAdminPrivileges(

            process.env.DB_COLLECTION_DIALOGS_ID,
            doc.$id
          )
        );
      });

      // Execute all deletions in parallel
      await Promise.all(deletePromises);

      const deleteDuration = Date.now() - deleteStart;
      const operationDuration = Date.now() - operationStart;

      log(`[${requestId}] Delete operations completed in ${deleteDuration}ms`);
      log(`[${requestId}] Match deletion completed in ${operationDuration}ms`);
      log(`[${requestId}] Deleted: 1 match, ${likesQuery.documents.length} likes, ${dialogsQuery.documents.length} dialogs`);

      return {
        action: 'deleted',
        matchId: matchId,
        deletedCounts: {
          match: 1,
          likes: likesQuery.documents.length,
          dialogs: dialogsQuery.documents.length
        },
        operationDuration: operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in deleteMatch: ${error.message}`);

      // Handle specific error cases
      if (error.code === 404 || error.message.includes('not found') || error.message.includes('does not exist')) {
        throw new Error(`Match not found: ${matchId}`);
      } else if (error.message.includes('Unauthorized')) {
        throw error; // Re-throw authorization errors as-is
      } else {
        throw new Error(`Failed to delete match: ${error.message}`);
      }
    }
  }

}

export default new MatchService();