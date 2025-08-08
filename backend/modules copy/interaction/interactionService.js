import AppwriteService from '../../appwrite_secure.js';
import crypto from 'crypto';

const { createQuery } = AppwriteService;
const Query = createQuery();

class InteractionService {

  async handleUserInteraction(interactionType, senderId, receiverId, jwtToken, requestedUserId, requestId, log) {
    try {
      // Validation
      const validationErrors = this.validateRequest(interactionType, senderId, receiverId, requestedUserId);

      if (validationErrors.length > 0) {
        const errorMessages = {
          'invalid_interaction_type': 'interactionType parameter is not valid',
          'same_sender_receiver': 'senderId and receiverId cannot be the same',
          'requester_is_receiver': 'requestedUserId cannot be the same as receiverId',
          'requester_not_sender': 'requestedUserId must be the same as senderId'
        };

        const errorMessage = validationErrors.map(err =>
          errorMessages[err] || `${err} parameter is required`
        ).join(', ');

        throw new Error(errorMessage);
      }

      log(`[${requestId}] Validation passed for ${interactionType} interaction`);

      // Process interaction based on type
      let result;
      const processStart = Date.now();

      if (interactionType === 'block') {
        result = await this.blockUser(jwtToken, senderId, receiverId, true, requestId, log);
      } else if (interactionType === 'unblock') {
        result = await this.blockUser(jwtToken, senderId, receiverId, false, requestId, log);
      } else if (interactionType === 'mute') {
        result = await this.muteUser(jwtToken, senderId, receiverId, true, requestId, log);
      } else if (interactionType === 'unmute') {
        result = await this.muteUser(jwtToken, senderId, receiverId, false, requestId, log);
      } else if (interactionType === 'like') {
        result = await this.likeUserV3(jwtToken, senderId, receiverId, requestId, log);
      } else if (interactionType === 'dislike') {
        result = await this.dislikeUser(jwtToken, senderId, receiverId, requestId, log);
      } else if (interactionType === 'unmatch') {
        result = await this.unmatchUser(jwtToken, senderId, receiverId, requestId, log);
      }

      const processDuration = Date.now() - processStart;
      log(`[${requestId}] ${interactionType} processed in ${processDuration}ms`);

      return {
        interactionType: interactionType,
        result: result,
        processDuration: processDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in handleUserInteraction: ${error.message}`);
      throw error;
    }
  }

  async getAllInteractions(jwtToken, requestedUserId, requestId, log, options = {}) {
    try {
      const operationStart = Date.now();
      log(`[${requestId}] Starting getAllInteractions for user: ${requestedUserId}`);

      const appwriteService = new AppwriteService();

      // Varsayılan seçenekler
      const {
        includeLikes = true,
        includeMatches = true,
        includeBlocks = true,
        includeDislikes = true,
        limit = 100
      } = options;

      // Sadece istenen sorguları hazırla
      const queries = [];
      const queryNames = [];

      if (includeLikes) {
        queries.push(
          // Alınan beğeniler
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_LIKES_ID,
            [
              Query.equal('likedId', requestedUserId),
              Query.isNull('matchId'),
              Query.limit(limit)
            ]
          ),
          // Gönderilen beğeniler
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_LIKES_ID,
            [
              Query.equal('likerId', requestedUserId),
              Query.isNull('matchId'),
              Query.limit(limit)
            ]
          )
        );
        queryNames.push('receivedLikes', 'sentLikes');
      }

      if (includeMatches) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_MATCHES_ID,
            [
              Query.or([
                Query.equal('userFirst', requestedUserId),
                Query.equal('userSecond', requestedUserId)
              ]),
              Query.limit(limit)
            ]
          )
        );
        queryNames.push('matches');
      }

      if (includeBlocks) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_BLOCKS_ID,
            [
              Query.equal('blockerId', requestedUserId),
              Query.limit(limit)
            ]
          )
        );
        queryNames.push('blocks');
      }

      if (includeDislikes) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_DISLIKES_ID,
            [
              Query.equal('dislikerId', requestedUserId),
              Query.limit(limit)
            ]
          )
        );
        queryNames.push('dislikes');
      }

      // Paralel sorgu execution
      const results = await Promise.all(queries);
      const operationDuration = Date.now() - operationStart;

      // Sonuçları organize et
      const interactions = {};
      const summary = {};

      results.forEach((result, index) => {
        const queryName = queryNames[index];
        interactions[queryName] = result.documents;
        summary[`${queryName}Count`] = result.total;
      });

      // Sonuçları logla
      log(`[${requestId}] Query results:`);
      queryNames.forEach(queryName => {
        log(`[${requestId}] - ${queryName}: ${summary[`${queryName}Count`]}`);
      });
      log(`[${requestId}] getAllInteractions completed in ${operationDuration}ms`);

      return {
        interactions,
        summary,
        operationDuration,
        queriesExecuted: queryNames
      };

    } catch (error) {
      log(`[${requestId}] ERROR in getAllInteractions: ${error.message}`);
      throw new Error(`Failed to retrieve interactions: ${error.message}`);
    }
  }

  // Kullanım örnekleri:
  // Tüm etkileşimleri al:
  // getAllInteractions(jwtToken, userId, requestId, log)

  // Sadece beğeniler ve eşleşmeler:
  // getAllInteractions(jwtToken, userId, requestId, log, { includeBlocks: false, includeDislikes: false })

  // Limit ile:
  // getAllInteractions(jwtToken, userId, requestId, log, { limit: 50 })

  // Kullanım örnekleri:
  // Tüm etkileşimleri al:
  // getAllInteractions(jwtToken, userId, requestId, log)

  // Sadece beğeniler ve eşleşmeler:
  // getAllInteractions(jwtToken, userId, requestId, log, { includeBlocks: false, includeDislikes: false })

  // Limit ile:
  // getAllInteractions(jwtToken, userId, requestId, log, { limit: 50 })

  async blockUser(jwtToken, senderId, receiverId, blocked, requestId, log) {
    try {
      const operationStart = Date.now();

      // Run dialog blockage and user blockage operations in parallel
      const [dialogResult, userResult] = await Promise.all([
        this.handleDialogBlockage(jwtToken, senderId, receiverId, blocked, requestId, log),
        this.handleUserBlockage(jwtToken, senderId, receiverId, blocked, requestId, log)
      ]);

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] ${blocked ? 'Block' : 'Unblock'} operation completed in ${operationDuration}ms`);

      return { dialogResult, userResult, operationDuration };

    } catch (error) {
      log(`[${requestId}] ERROR in blockUser: ${error.message}`);
      throw new Error(`Failed to ${blocked ? 'block' : 'unblock'} user: ${error.message}`);
    }
  }

  async handleDialogBlockage(jwtToken, senderId, receiverId, blocked, requestId, log) {
    try {
      const queryStart = Date.now();
      const occupantsPair = [senderId, receiverId].sort();

      const appwriteService = new AppwriteService();
      const documents = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_DIALOGS_ID,
        [
          Query.equal('occupantIds', occupantsPair),
          Query.limit(1)
        ]
      );

      const queryDuration = Date.now() - queryStart;
      log(`[${requestId}] Dialog query completed in ${queryDuration}ms, found ${documents.total} documents`);

      if (documents.total === 1) {
        const dialog = documents.documents[0];
        const currentBlockedIds = dialog.blockedIds || [];

        const newBlockedIds = blocked
          ? currentBlockedIds.includes(receiverId)
            ? currentBlockedIds
            : [...currentBlockedIds, receiverId]
          : currentBlockedIds.filter(id => id !== receiverId);

        // Only update if there's a change
        if (JSON.stringify(currentBlockedIds.sort()) !== JSON.stringify(newBlockedIds.sort())) {
          const updateStart = Date.now();

          await appwriteService.updateDocument(
            jwtToken,
            process.env.DB_COLLECTION_DIALOGS_ID,
            dialog.$id,
            {
              'blockedIds': newBlockedIds
            }
          );

          const updateDuration = Date.now() - updateStart;
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

    } catch (error) {
      log(`[${requestId}] ERROR in handleDialogBlockage: ${error.message}`);
      throw new Error(`Failed to handle dialog blockage: ${error.message}`);
    }
  }

  async handleUserBlockage(jwtToken, senderId, receiverId, blocked, requestId, log) {
    try {
      const queryStart = Date.now();

      const appwriteService = new AppwriteService();
      const documents = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_BLOCKS_ID,
        [
          Query.equal('blockerId', senderId),
          Query.equal('blockedId', receiverId),
          Query.limit(1)
        ]
      );

      const queryDuration = Date.now() - queryStart;
      log(`[${requestId}] User blockage query completed in ${queryDuration}ms, found ${documents.total} documents`);

      const operationStart = Date.now();
      let result = { action: 'no_change' };

      if (documents.total === 1) {
        const document = documents.documents[0];
        if (!blocked) {
          // Unblock: Delete the record
          await appwriteService.deleteDocument(
            jwtToken,
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
          const newRecord = await appwriteService.createDocumentWithAdminPrivileges(
            jwtToken,
            process.env.DB_COLLECTION_BLOCKS_ID,
            'unique()',
            {
              'blockerId': senderId,
              'blockedId': receiverId,
              'blockedProfile': receiverId
            },
            [
              { userId: senderId, permissions: ['read', 'update', 'delete'] },
              { userId: receiverId, permissions: ['read'] }
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
      log(`[${requestId}] User blockage operation completed in ${operationDuration}ms`);

      return result;

    } catch (error) {
      log(`[${requestId}] ERROR in handleUserBlockage: ${error.message}`);
      throw new Error(`Failed to handle user blockage: ${error.message}`);
    }
  }

  async muteUser(jwtToken, senderId, receiverId, muted, requestId, log) {
    try {
      const operationStart = Date.now();

      // TODO: Implement mute/unmute logic here
      // For now, this is a placeholder
      log(`[${requestId}] Mute operation (${muted ? 'mute' : 'unmute'}) - Implementation pending`);

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Mute operation completed in ${operationDuration}ms`);

      return { action: 'pending_implementation', operationDuration };

    } catch (error) {
      log(`[${requestId}] ERROR in muteUser: ${error.message}`);
      throw new Error(`Failed to ${muted ? 'mute' : 'unmute'} user: ${error.message}`);
    }
  }

  async likeUser(jwtToken, senderId, receiverId, requestId, log) {
    try {
      const operationStart = Date.now();

      // Check if user already liked this person
      const appwriteService = new AppwriteService();
      const existingLikes = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_LIKES_ID,
        [
          Query.equal('likerId', senderId),
          Query.equal('likedId', receiverId),
          Query.limit(1)
        ]
      );

      let action;
      let like;

      if (existingLikes.total > 0) {
        const existingLike = existingLikes.documents[0];
        const currentDate = new Date();
        const expireDate = new Date(existingLike.expireDate);

        if (currentDate <= expireDate) {
          // Like exists and is still valid - skip
          log(`[${requestId}] User already liked this person and like is still valid (expires: ${expireDate.toISOString()})`);
          like = existingLike;
          action = 'already_liked';
        } else {
          // Like exists but expired - create new like
          log(`[${requestId}] Previous like expired (${expireDate.toISOString()}), creating new like`);
          action = 'liked';

          // Calculate expiration date (7 days from now)
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + 7);

          like = await appwriteService.createDocumentWithAdminPrivileges(
            jwtToken,
            process.env.DB_COLLECTION_LIKES_ID,
            'unique()',
            {
              'likerId': senderId,
              'likedId': receiverId,
              'likerRef': senderId,
              'likedRef': receiverId,
              'expireDate': expirationDate.toISOString()
            },
            [
              { userId: senderId, permissions: ['read', 'delete'] },
              { userId: receiverId, permissions: ['read'] }
            ]
          );
        }
      } else {
        // Create new like record with expiration date
        action = 'liked';

        // Calculate expiration date (7 days from now)
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);

        like = await appwriteService.createDocumentWithAdminPrivileges(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          'unique()',
          {
            'likerId': senderId,
            'likedId': receiverId,
            'likerRef': senderId,
            'likedRef': receiverId,
            'expireDate': expirationDate.toISOString()
          },
          [
            { userId: senderId, permissions: ['read', 'delete'] },
            { userId: receiverId, permissions: ['read'] }
          ]
        );
      }

      // Check if it's a match (both users liked each other and both likes are valid)
      const matchCheck = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_LIKES_ID,
        [
          Query.equal('likerId', receiverId),
          Query.equal('likedId', senderId),
          Query.limit(1)
        ]
      );

      let isMatch = false;
      let matchRecord;

      if (matchCheck.total > 0) {
        const reciprocalLike = matchCheck.documents[0];
        const currentDate = new Date();
        const expireDate = new Date(reciprocalLike.expireDate);

        if (currentDate <= expireDate) {
          isMatch = true;
          log(`[${requestId}] Reciprocal like found and is valid (expires: ${expireDate.toISOString()})`);
        } else {
          log(`[${requestId}] Reciprocal like found but expired (${expireDate.toISOString()})`);
        }
      }

      if (isMatch) {
        // Create match record
        matchRecord = await this.createMatchRecord(jwtToken, senderId, receiverId, requestId, log);
        log(`[${requestId}] It's a match! Match record created: ${matchRecord.$id}`);
      }

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Like operation completed in ${operationDuration}ms`);

      return {
        action: action,
        likeId: like.$id,
        isMatch: isMatch,
        matchId: isMatch ? matchRecord?.$id : null,
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in likeUser: ${error.message}`);
      throw new Error(`Failed to like user: ${error.message}`);
    }
  }

  async createMatchRecord(jwtToken, userId1, userId2, requestId, log) {
    try {
      const appwriteService = new AppwriteService();
      const occupantsPair = [userId1, userId2].sort();

      log(`[${requestId}] Creating match record for users: [${occupantsPair.join(', ')}]`);

      const existingMatches = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_MATCHES_ID,
        [
          Query.equal('userFirst', occupantsPair[0]),
          Query.equal('userSecond', occupantsPair[1]),
          Query.limit(1)
        ]
      );

      if (existingMatches.total > 0) {
        log(`[${requestId}] Match already exists with ID: ${existingMatches.documents[0].$id}`);
        return existingMatches.documents[0];
      }

      const newMatch = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken,
        process.env.DB_COLLECTION_MATCHES_ID,
        'unique()',
        {
          'userFirst': occupantsPair[0],
          'userFirstRef': occupantsPair[0],
          'userSecond': occupantsPair[1],
          'userSecondRef': occupantsPair[1],
          'createDate': new Date().toISOString()
        },
        [
          { userId: occupantsPair[0], permissions: ['write'] },
          { userId: occupantsPair[1], permissions: ['write'] }
        ]
      );

      log(`[${requestId}] Match record created: ${newMatch.$id}`);
      return { ...newMatch };

    } catch (error) {
      log(`[${requestId}] ERROR in createMatchRecord: ${error.message}`);
      throw new Error(`Failed to create match record: ${error.message}`);
    }
  }

  async createDialogForMatch(jwtToken, userId1, userId2, matchId, requestId, log) {
    const appwriteService = new AppwriteService();

    try {
      const occupantsPair = [userId1, userId2].sort();

      log(`[${requestId}] Creating dialog for match between users: [${occupantsPair.join(', ')}]`);

      // Check if dialog already exists (race condition protection)
      const existingDialogs = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_DIALOGS_ID,
        [
          Query.contains('occupantIds', occupantsPair[0]),
          Query.contains('occupantIds', occupantsPair[1]),
          Query.limit(1)
        ]
      );

      if (existingDialogs.total > 0) {
        log(`[${requestId}] Dialog already exists with ID: ${existingDialogs.documents[0].$id}`);
        return existingDialogs.documents[0];
      }

      // Create deterministic dialog ID
      const combined = occupantsPair.join('_');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      const dialogId = `dialog_${hash.substring(0, 20)}`;

      const date = new Date().toISOString();

      log(`[${requestId}] Creating new dialog with ID: ${dialogId}`);

      // Create new dialog
      const occupants = [userId1, userId2].sort();
      const newDialog = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken,
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
          'matchId': matchId
        },
        [
          { userId: occupants[0], permissions: ['write'] },
          { userId: occupants[1], permissions: ['write'] }
        ]
      );

      log(`[${requestId}] Dialog created successfully with ID: ${newDialog.$id}`);
      return newDialog;

    } catch (error) {
      // Handle duplicate creation gracefully (race condition)
      if (error.code === 409 || error.message.includes('already exists')) {
        log(`[${requestId}] Dialog already exists during creation, fetching existing one...`);

        const existingDialog = await appwriteService.listDocuments(
          jwtToken,
          process.env.DB_COLLECTION_DIALOGS_ID,
          [
            Query.contains('occupantIds', occupantsPair[0]),
            Query.contains('occupantIds', occupantsPair[1]),
            Query.limit(1)
          ]
        );

        if (existingDialog.total > 0) {
          log(`[${requestId}] Retrieved existing dialog: ${existingDialog.documents[0].$id}`);
          return existingDialog.documents[0];
        }
      }

      log(`[${requestId}] ERROR in createDialogForMatch: ${error.message}`);
      throw new Error(`Failed to create dialog for match: ${error.message}`);
    }
  }


  async cleanupLikesAfterMatch(jwtToken, userId1, userId2, requestId, log) {
    try {
      const appwriteService = new AppwriteService();

      const [likes1, likes2] = await Promise.all([
        appwriteService.listDocuments(jwtToken, process.env.DB_COLLECTION_LIKES_ID, [
          Query.equal('likerId', userId1),
          Query.equal('likedId', userId2)
        ]),
        appwriteService.listDocuments(jwtToken, process.env.DB_COLLECTION_LIKES_ID, [
          Query.equal('likerId', userId2),
          Query.equal('likedId', userId1)
        ])
      ]);

      const deletePromises = [];

      if (likes1.documents.length > 0) {
        deletePromises.push(
          appwriteService.deleteDocumentWithAdminPrivileges(jwtToken, process.env.DB_COLLECTION_LIKES_ID, likes1.documents[0].$id)
        );
      }

      if (likes2.documents.length > 0) {
        deletePromises.push(
          appwriteService.deleteDocumentWithAdminPrivileges(jwtToken, process.env.DB_COLLECTION_LIKES_ID, likes2.documents[0].$id)
        );
      }

      await Promise.all(deletePromises);
      log(`[${requestId}] Cleaned up ${deletePromises.length} like records after match`);

    } catch (error) {
      log(`[${requestId}] ERROR cleaning up likes after match: ${error.message}`);
      // Don't throw - match is more important than cleanup
    }
  }


  async dislikeUser(jwtToken, senderId, receiverId, requestId, log) {
    try {
      const operationStart = Date.now();

      // Check if user already disliked this person
      const appwriteService = new AppwriteService();
      const existingDislikes = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_DISLIKES_ID,
        [
          Query.equal('dislikerId', senderId),
          Query.equal('dislikedId', receiverId),
          Query.limit(1)
        ]
      );

      if (existingDislikes.total > 0) {
        log(`[${requestId}] User already disliked this person`);
        return { action: 'already_disliked', dislikeId: existingDislikes.documents[0].$id };
      }

      // Create new dislike record
      const newDislike = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken,
        process.env.DB_COLLECTION_DISLIKES_ID,
        'unique()',
        {
          'dislikerId': senderId,
          'dislikedId': receiverId
        },
        [
          { userId: senderId, permissions: ['read', 'delete'] }
        ]
      );

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Dislike operation completed in ${operationDuration}ms`);

      return {
        action: 'disliked',
        dislikeId: newDislike.$id,
        operationDuration
      };

    } catch (error) {
      log(`[${requestId}] ERROR in dislikeUser: ${error.message}`);
      throw new Error(`Failed to dislike user: ${error.message}`);
    }
  }



  validateRequest(interactionType, senderId, receiverId, requestedUserId) {
    const interactions = ['block', 'unblock', 'mute', 'unmute', 'like', 'dislike'];
    const validationErrors = [];

    // Required field validation
    if (!interactionType) validationErrors.push('interactionType');
    if (!senderId) validationErrors.push('senderId');
    if (!receiverId) validationErrors.push('receiverId');

    // Interaction type validation
    if (interactionType && !interactions.includes(interactionType)) {
      validationErrors.push('invalid_interaction_type');
    }

    // Logic validation
    if (senderId === receiverId) validationErrors.push('same_sender_receiver');
    if (requestedUserId === receiverId) validationErrors.push('requester_is_receiver');
    if (requestedUserId !== senderId) validationErrors.push('requester_not_sender');

    return validationErrors;
  }


  async likeUserV3(jwtToken, senderId, receiverId, requestId, log) {
    try {
      const operationStart = Date.now();
      const appwriteService = new AppwriteService();

      // 1. Önce karşı taraftan like var mı kontrol et
      const reciprocalLikeCheck = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_LIKES_ID,
        [
          Query.equal('likerId', receiverId),
          Query.equal('likedId', senderId),
          Query.limit(1)
        ]
      );

      const hasReciprocalLike = reciprocalLikeCheck.total > 0;
      let isMatch = false;
      let matchRecord = null;

      if (hasReciprocalLike) {
        const reciprocalLike = reciprocalLikeCheck.documents[0];
        const currentDate = new Date();
        const expireDate = new Date(reciprocalLike.expireDate);

        // Karşı like hala geçerliyse match!
        if (currentDate <= expireDate) {
          isMatch = true;
          log(`[${requestId}] Reciprocal like found and valid - It's a match!`);

          const occupantsPair = [senderId, receiverId].sort();
          const existingMatches = await appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_MATCHES_ID,
            [
              Query.equal('userFirst', occupantsPair[0]),
              Query.equal('userSecond', occupantsPair[1]),
              Query.limit(1)
            ]
          );

          if (existingMatches.total > 0) {
            log(`[${requestId}] Match already exists with ID: ${existingMatches.documents[0].$id}`);
            matchRecord = existingMatches.documents[0];

            // ERKEN SONLANDIRMA: Zaten match varsa işlemi bitir
            const operationDuration = Date.now() - operationStart;
            log(`[${requestId}] Operation terminated early - match already exists (${operationDuration}ms)`);

            const result = {
              action: 'already_matched',
              likeId: reciprocalLike.$id, // Karşı tarafın like ID'si
              isMatch: false, // Zaten match olmuş
              matchId: matchRecord.$id,
              operationDuration
            };

            log(`[${requestId}] RETURN: ${JSON.stringify(result)}`);
            return result;
          } else {
            log(`[${requestId}] Creating match record for users: [${occupantsPair.join(', ')}]`);
            matchRecord = await this.createMatchRecord(jwtToken, senderId, receiverId, requestId, log);
            await this.createDialogForMatch(jwtToken, senderId, receiverId, matchRecord.$id, requestId, log);
            // Karşı like'ı match olarak işaretle
            await appwriteService.updateDocument(
              jwtToken,
              process.env.DB_COLLECTION_LIKES_ID,
              reciprocalLike.$id,
              {
                matchId: matchRecord.$id
              }
            );
          }
        }
      }

      // 2. Şimdi kendi like'ımızı kontrol et
      const existingLikes = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_LIKES_ID,
        [
          Query.equal('likerId', senderId),
          Query.equal('likedId', receiverId),
          Query.limit(1)
        ]
      );

      let like;
      let action;

      if (existingLikes.total > 0) {
        const existingLike = existingLikes.documents[0];

        // Zaten match olduysa, hiçbir şey yapma
        if (existingLike.matchId) {
          log(`[${requestId}] Like already exists and is matched`);

          const result = {
            action: 'already_matched',
            likeId: existingLike.$id,
            isMatch: false, // Zaten match olmuş
            matchId: existingLike.matchId,
            operationDuration: Date.now() - operationStart
          };

          log(`[${requestId}] RETURN: ${JSON.stringify(result)}`);
          return result;
        }

        // Like var ama match olmamış - expire kontrolü
        const currentDate = new Date();
        const expireDate = new Date(existingLike.expireDate);

        if (currentDate <= expireDate) {
          // Like hala geçerli
          if (isMatch) {
            // Match olduysa like'ı güncelle
            like = await appwriteService.updateDocument(
              jwtToken,
              process.env.DB_COLLECTION_LIKES_ID,
              existingLike.$id,
              {
                matchId: matchRecord.$id
              }
            );
            action = 'matched';
          } else {
            // Match olmadı, like zaten var
            like = existingLike;
            action = 'already_liked';
          }
        } else {
          // Eski like expire olmuş - yeni like oluştur
          action = isMatch ? 'matched' : 'liked';
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + 7);

          like = await appwriteService.createDocumentWithAdminPrivileges(
            jwtToken,
            process.env.DB_COLLECTION_LIKES_ID,
            'unique()',
            {
              'likerId': senderId,
              'likedId': receiverId,
              'likerRef': senderId,
              'likedRef': receiverId,
              'expireDate': expirationDate.toISOString(),
              'matchId': isMatch ? matchRecord?.$id : null,
              'createDate': new Date().toISOString()
            },
            [
              { userId: receiverId, permissions: ['read'] }
            ]
          );
        }
      } else {
        // Hiç like yok - yeni oluştur
        action = isMatch ? 'matched' : 'liked';
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);

        like = await appwriteService.createDocumentWithAdminPrivileges(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          'unique()',
          {
            'likerId': senderId,
            'likedId': receiverId,
            'likerRef': senderId,
            'likedRef': receiverId,
            'expireDate': expirationDate.toISOString(),
            'matchId': isMatch ? matchRecord?.$id : null
          },
          [
            { userId: receiverId, permissions: ['read'] }
          ]
        );
      }

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Like operation completed in ${operationDuration}ms`);

      const result = {
        action: action,
        likeId: like.$id,
        isMatch: isMatch,
        matchId: isMatch ? matchRecord?.$id : null,
        operationDuration
      };

      log(`[${requestId}] RETURN: ${JSON.stringify(result)}`);
      return result;

    } catch (error) {
      log(`[${requestId}] ERROR in likeUser: ${error.message}`);

      const errorResult = {
        error: true,
        message: `Failed to like user: ${error.message}`
      };

      log(`[${requestId}] ERROR RETURN: ${JSON.stringify(errorResult)}`);
      throw new Error(`Failed to like user: ${error.message}`);
    }
  }


  async unmatchUser(jwtToken, matchId, requestId, log) {
    try {
      const operationStart = Date.now();
      const appwriteService = new AppwriteService();

      await appwriteService.deleteDocumentsWithAdminPrivileges(
        jwtToken,
        process.env.DB_COLLECTION_MATCHES_ID,
        [
          Query.equal('matchId', matchId)
        ]
      );

    } catch (error) {
      log(`[${requestId}] ERROR in unmatch user: ${error.message}`);

      const errorResult = {
        error: true,
        message: `Failed to unmatch user: ${error.message}`
      };

      log(`[${requestId}] ERROR RETURN: ${JSON.stringify(errorResult)}`);
      throw new Error(`Failed to unmatch user: ${error.message}`);
    }
  }
}

export default new InteractionService();