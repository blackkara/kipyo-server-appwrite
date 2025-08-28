import AppwriteService from '../../services/appwrite/AppwriteService.js';
import pushNotificationService from '../../pushNotificationsService.js';
import { generatePhotoUrls } from '../../utils/photoUtils.js';
import crypto from 'crypto';
import { generateDocumentId } from '#id-generator';



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
        result = await this.likeUser(jwtToken, senderId, receiverId, requestId, log);
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

      const appwriteService = AppwriteService.getInstance();

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

      // Photo processing helper function
      const processDocumentsWithPhotos = (queryName, documents) => {
        return documents.map(doc => {
          // likerRef içinde photos dizisi var mı kontrol et
          if (queryName === 'receivedLikes' && doc.likerRef && doc.likerRef.photos) {
            const photos = doc.likerRef.photos || [];
            const photosWithUrl = photos.length > 0 ? generatePhotoUrls(photos) : [];

            return {
              ...doc,
              likerRef: {
                ...doc.likerRef,
                photosWithUrl
              }
            };
          }

          if (queryName === 'sentLikes' && doc.likedRef && doc.likedRef.photos) {
            const photos = doc.likedRef.photos || [];
            const photosWithUrl = photos.length > 0 ? generatePhotoUrls(photos) : [];

            return {
              ...doc,
              likedRef: {
                ...doc.likedRef,
                photosWithUrl
              }
            };
          }

          if (queryName === 'matches' && doc.userFirstRef && doc.userFirstRef.photos) {
            const photos = doc.userFirstRef.photos || [];
            const photosWithUrl = photos.length > 0 ? generatePhotoUrls(photos) : [];

            return {
              ...doc,
              userFirstRef: {
                ...doc.userFirstRef,
                photosWithUrl
              }
            };
          }

          // Herhangi bir profil referansı yoksa orijinal dökümanı döndür
          return doc;
        });
      };

      // Sonuçları organize et ve photos işle
      const interactions = {};
      const summary = {};

      results.forEach((result, index) => {
        const queryName = queryNames[index];
        // Documents'a photosWithUrl ekle
        const processedDocuments = processDocumentsWithPhotos(queryName, result.documents);

        interactions[queryName] = processedDocuments;
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

      const appwriteService = AppwriteService.getInstance();
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

      const appwriteService = AppwriteService.getInstance();
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
            senderId,
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
    // SOON..
  }


  async createMatchRecord(jwtToken, requestingUserId, userId2, requestId, log) {
    try {
      const appwriteService = AppwriteService.getInstance();
      const occupantsPair = [requestingUserId, userId2].sort();

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
        requestingUserId,
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
          { userId: occupantsPair[0], permissions: ['read', 'update', 'delete', 'write'] },
          { userId: occupantsPair[1], permissions: ['read', 'update', 'delete', 'write'] }
        ]
      );

      log(`[${requestId}] Match record created: ${newMatch.$id}`);
      return { ...newMatch };

    } catch (error) {
      log(`[${requestId}] ERROR in createMatchRecord: ${error.message}`);
      throw new Error(`Failed to create match record: ${error.message}`);
    }
  }

  async createDialogForMatch(jwtToken, requestingUserId, receiverId, matchId, requestId, log) {
    const appwriteService = AppwriteService.getInstance();

    try {
      const occupantsPair = [requestingUserId, receiverId].sort();

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
      const occupants = [requestingUserId, receiverId].sort();
      const newDialog = await appwriteService.createDocumentWithAdminPrivileges(
        jwtToken,
        requestingUserId,
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
          { userId: receiverId, permissions: ['write', 'read', 'update', 'delete'] },
          { userId: requestingUserId, permissions: ['write', 'read', 'update', 'delete'] }
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

  async dislikeUser(jwtToken, senderId, receiverId, requestId, log) {
    try {
      const operationStart = Date.now();

      // Check if user already disliked this person
      const appwriteService = AppwriteService.getInstance();
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
        senderId,
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


  async likeUserOld(jwtToken, senderId, receiverId, requestId, log) {
    try {
      const likeId = generateDocumentId('like', senderId, receiverId);
      const reverseLikeId = generateDocumentId('like', receiverId, senderId);
      const matchId = generateDocumentId('match', senderId, receiverId);
      const reverseMatchId = generateDocumentId('match', receiverId, senderId);
      const dialogId = generateDocumentId('dialog', senderId, receiverId);
      const reverseDialogId = generateDocumentId('dialog', receiverId, senderId);

      log(`[${requestId}] Generated IDs - Like: ${likeId}`);
      log(`[${requestId}] Generated IDs - Reverse Like: ${reverseLikeId}`);
      log(`[${requestId}] Generated IDs - Match: ${matchId}`);
      log(`[${requestId}] Generated IDs - Reverse Match: ${reverseMatchId}`);
      log(`[${requestId}] Generated IDs - Dialog: ${dialogId}`);
      log(`[${requestId}] Generated IDs - Reverse Dialog: ${reverseDialogId}`);

      const operationStart = Date.now();
      const appwriteService = AppwriteService.getInstance();
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
        const expireDate = new Date(reciprocalLike.expireDate);
        const currentDate = new Date();
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
            await appwriteService.updateDocumentWithAdminPrivileges(
              jwtToken,
              receiverId,
              process.env.DB_COLLECTION_LIKES_ID,
              reciprocalLike.$id,
              {
                matchId: matchRecord.$id
              },
              [
                { userId: senderId, permissions: ['read'] }
              ]
            );

            // 🎯 SEND MATCH NOTIFICATION
            try {
              log(`[${requestId}] Sending match notification to both users`);
              await pushNotificationService.sendMatchNotification(
                senderId,
                receiverId,
                { matchId: matchRecord.$id }
              );
              log(`[${requestId}] Match notification sent successfully`);
            } catch (notificationError) {
              // Don't fail the operation if notification fails
              log(`[${requestId}] Match notification failed: ${notificationError.message}`);
            }
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
            senderId,
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
          senderId,
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

        // 🎯 SEND LIKE NOTIFICATION (only for new likes, not matches)
        if (!isMatch && action === 'liked') {
          try {
            // Get liker's profile info for notification
            log(`[${requestId}] Sending like notification to user: ${receiverId}`);
            await pushNotificationService.sendLikeNotification(
              senderId,
              receiverId,
              'someone liked you'
            );
            log(`[${requestId}] Like notification sent successfully`);
          } catch (notificationError) {
            // Don't fail the operation if notification fails
            log(`[${requestId}] Like notification failed: ${notificationError.message}`);
          }
        }
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
      const appwriteService = AppwriteService.getInstance();

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

  async likeUser(jwtToken, senderId, receiverId, requestId, log) {
    const operationStart = Date.now();

    try {
      // ===============================================
      // 1️⃣ VALIDATION
      // ===============================================
      if (senderId === receiverId) {
        throw new Error('Cannot like yourself');
      }

      const appwriteService = AppwriteService.getInstance();

      // ===============================================
      // 2️⃣ DETERMINISTIC IDs
      // ===============================================

      const likeId = generateDocumentId('like', senderId, receiverId);
      const reverseLikeId = generateDocumentId('like', receiverId, senderId);
      const matchId = generateDocumentId('match', senderId, receiverId);
      const reverseMatchId = generateDocumentId('match', receiverId, senderId);
      const dialogId = generateDocumentId('dialog', senderId, receiverId);
      const reverseDialogId = generateDocumentId('dialog', receiverId, senderId);

      log(`[${requestId}] Generated IDs - Like: ${likeId}`);
      log(`[${requestId}] Generated IDs - Reverse Like: ${reverseLikeId}`);
      log(`[${requestId}] Generated IDs - Match: ${matchId}`);
      log(`[${requestId}] Generated IDs - Reverse Match: ${reverseMatchId}`);
      log(`[${requestId}] Generated IDs - Dialog: ${dialogId}`);
      log(`[${requestId}] Generated IDs - Reverse Dialog: ${reverseDialogId}`);


      log(`[${requestId}] Starting like operation: ${senderId} -> ${receiverId}`);



      // ===============================================
      // 4️⃣ PARALLEL QUERIES (Optimized)
      // ===============================================
      const [existingMatch, reciprocalLike, existingLike] = await Promise.all([
        // Check if already matched
        appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_MATCHES_ID,
          matchId
        ).catch(err => err.code === 404 ? null : Promise.reject(err)),

        // Check reciprocal like
        appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          reverseLikeId
        ).catch(err => err.code === 404 ? null : Promise.reject(err)),

        // Check existing like
        appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          likeId
        ).catch(err => err.code === 404 ? null : Promise.reject(err))
      ]);

      log(`[${requestId}] Query results - Match: ${!!existingMatch}, Reciprocal: ${!!reciprocalLike}, Existing: ${!!existingLike}`);

      // ===============================================
      // 5️⃣ EARLY RETURN - Already Matched
      // ===============================================
      if (existingMatch) {

        log(`[${requestId}] Already matched`);
        return {
          action: 'already_matched',
          matchId: existingMatch.$id,
          operationDuration: Date.now() - operationStart
        };
      }

      // ===============================================
      // 6️⃣ CHECK RECIPROCAL LIKE VALIDITY
      // ===============================================
      const now = new Date();
      const isReciprocalValid = reciprocalLike &&
        !reciprocalLike.matchId &&
        new Date(reciprocalLike.expireDate) > now;

      log(`[${requestId}] Reciprocal like valid: ${isReciprocalValid}`);

      // ===============================================
      // 7️⃣ HANDLE LIKE CREATION/UPDATE
      // ===============================================
      let like;
      let action;
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 7);

      if (existingLike) {
        // Like exists - check if expired or matched
        if (existingLike.matchId) {
          log(`[${requestId}] Like already matched`);
          return {
            action: 'already_matched',
            matchId: existingLike.matchId,
            operationDuration: Date.now() - operationStart
          };
        }

        const isExpired = new Date(existingLike.expireDate) < now;

        if (isExpired) {
          // Update expired like
          log(`[${requestId}] Updating expired like`);
          like = await appwriteService.updateDocument(
            jwtToken,
            process.env.DB_COLLECTION_LIKES_ID,
            likeId,
            {
              expireDate: expirationDate.toISOString(),
              updatedAt: now.toISOString(),
              matchId: null
            }
          );
          action = 're-liked';
        } else {
          // Like still valid
          log(`[${requestId}] Like still valid`);
          like = existingLike;
          action = 'already_liked';
        }
      } else {
        // Create new like with deterministic ID
        log(`[${requestId}] Creating new like`);
        try {
          like = await appwriteService.createDocumentWithAdminPrivileges(
            jwtToken,
            senderId,
            process.env.DB_COLLECTION_LIKES_ID,
            likeId, // DETERMINISTIC ID
            {
              likerId: senderId,
              likedId: receiverId,
              likerRef: senderId,
              likedRef: receiverId,
              expireDate: expirationDate.toISOString(),
              matchId: null

            },
            [
              { userId: senderId, permissions: ['read', 'update', 'delete'] },
              { userId: receiverId, permissions: ['read'] }
            ]
          );
          action = 'liked';
        } catch (error) {
          if (error.code === 409) {
            // Document already exists (race condition handled)
            log(`[${requestId}] Like already exists (race condition)`);
            like = await appwriteService.getDocument(
              jwtToken,
              process.env.DB_COLLECTION_LIKES_ID,
              likeId
            );
            action = 'already_liked';
          } else {
            throw error;
          }
        }
      }

      // ===============================================
      // 8️⃣ HANDLE MATCH CREATION
      // ===============================================
      if (isReciprocalValid && action !== 'already_liked' && action !== 'already_matched') {
        log(`[${requestId}] Creating match`);

        try {
          // Create match with deterministic ID
          const match = await appwriteService.createDocumentWithAdminPrivileges(
            jwtToken,
            senderId,
            process.env.DB_COLLECTION_MATCHES_ID,
            matchId, // DETERMINISTIC ID
            {
              userFirst: [senderId, receiverId].sort()[0],
              userFirstRef: [senderId, receiverId].sort()[0],
              userSecond: [senderId, receiverId].sort()[1],
              userSecondRef: [senderId, receiverId].sort()[1],
              createDate: now.toISOString()
            },
            [
              { userId: senderId, permissions: ['read', 'update', 'delete'] },
              { userId: receiverId, permissions: ['read', 'update', 'delete'] }
            ]
          );

          // Update both likes with match ID (parallel)
          await Promise.all([
            appwriteService.updateDocument(
              jwtToken,
              process.env.DB_COLLECTION_LIKES_ID,
              likeId,
              { matchId: matchId }
            ),
            appwriteService.updateDocumentWithAdminPrivileges(
              jwtToken,
              receiverId, // Important: correct userId for permissions
              process.env.DB_COLLECTION_LIKES_ID,
              reverseLikeId,
              { matchId: matchId },
              [{ userId: senderId, permissions: ['read'] }]
            )
          ]);

          // Create dialog synchronously (critical for consistency)
          try {
            await appwriteService.createDocumentWithAdminPrivileges(
              jwtToken,
              senderId,
              process.env.DB_COLLECTION_DIALOGS_ID,
              dialogId, // DETERMINISTIC ID
              {
                occupants: [senderId, receiverId].sort(),
                occupantIds: [senderId, receiverId].sort(),
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
                lastMessage: '',
                lastMessageSenderId: '',
                blockedIds: [],
                matchId: matchId
              },
              [
                { userId: senderId, permissions: ['read', 'write', 'update', 'delete'] },
                { userId: receiverId, permissions: ['read', 'write', 'update', 'delete'] }
              ]
            );
          } catch (dialogError) {
            if (dialogError.code !== 409) {
              // If not duplicate error, it's a real problem
              log(`[${requestId}] ERROR creating dialog: ${dialogError.message}`);
            }
          }

          // Send notifications asynchronously (non-blocking)
          this.sendMatchNotificationAsync(senderId, receiverId, matchId, requestId, log);

          const operationDuration = Date.now() - operationStart;
          log(`[${requestId}] Match created successfully in ${operationDuration}ms`);

          return {
            action: 'matched',
            likeId: like.$id,
            matchId: match.$id,
            isMatch: true,
            operationDuration
          };

        } catch (matchError) {
          if (matchError.code === 409) {
            // Match already exists (race condition)
            log(`[${requestId}] Match already exists (race condition)`);

            const existingMatch = await appwriteService.getDocument(
              jwtToken,
              process.env.DB_COLLECTION_MATCHES_ID,
              matchId
            );

            // Update like with match ID
            await appwriteService.updateDocument(
              jwtToken,
              process.env.DB_COLLECTION_LIKES_ID,
              likeId,
              { matchId: matchId }
            );

            return {
              action: 'matched',
              likeId: like.$id,
              matchId: existingMatch.$id,
              isMatch: true,
              operationDuration: Date.now() - operationStart
            };
          }
          throw matchError;
        }
      }

      // ===============================================
      // 9️⃣ SEND LIKE NOTIFICATION (if new like)
      // ===============================================
      if (action === 'liked' || action === 're-liked') {
        this.sendLikeNotificationAsync(senderId, receiverId, requestId, log);
      }

      // ===============================================
      // 🔟 RETURN RESULT
      // ===============================================
      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] Like operation completed in ${operationDuration}ms`);

      return {
        action: action,
        likeId: like.$id,
        isMatch: false,
        matchId: null,
        operationDuration
      };

    } catch (error) {
      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] ERROR in likeUser after ${operationDuration}ms: ${error.message}`);

      // Don't expose internal errors to client
      if (error.message === 'Cannot like yourself') {
        throw error;
      }

      throw new Error('Failed to process like request. Please try again.');
    }
  }


  async sendLikeNotificationAsync(senderId, receiverId, requestId, log) {
    // Fire and forget pattern
    pushNotificationService.sendLikeNotification(
      senderId,
      receiverId,
      { message: 'Someone liked you!' }
    ).catch(error => {
      log(`[${requestId}] Failed to send like notification: ${error.message}`);
    });
  }

  async sendMatchNotificationAsync(senderId, receiverId, matchId, requestId, log) {
    // Fire and forget pattern
    Promise.all([
      pushNotificationService.sendMatchNotification(
        senderId,
        receiverId,
        { matchId, message: "It's a match!" }
      ),
      pushNotificationService.sendMatchNotification(
        receiverId,
        senderId,
        { matchId, message: "It's a match!" }
      )
    ]).catch(error => {
      log(`[${requestId}] Failed to send match notification: ${error.message}`);
    });
  }

}

export default new InteractionService();

