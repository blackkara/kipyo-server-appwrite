import AppwriteService from '../../services/appwrite/AppwriteService.js';
import profileService from '../profile/profileService.js';
import crypto from 'crypto';
import { generateDocumentId } from '#id-generator';

const { createQuery } = AppwriteService;
const Query = createQuery();

class DialogService {

  async initDialog(userId, occupantId, jwtToken, requestedUserId, requestId, log) {
    try {
      // Validation
      const validationErrors = [];
      if (!userId) validationErrors.push('userId');
      if (!occupantId) validationErrors.push('occupantId');
      if (!jwtToken) validationErrors.push('jwtToken');
      if (!requestedUserId) validationErrors.push('requestedUserId');

      if (occupantId === userId) validationErrors.push('same_user_ids');
      if (requestedUserId !== userId && requestedUserId !== occupantId) validationErrors.push('unauthorized_access');

      if (validationErrors.length > 0) {
        const errorMessage = validationErrors.includes('same_user_ids')
          ? 'userId and occupantId cannot be the same'
          : validationErrors.includes('unauthorized_access')
            ? 'requestedUserId must be the same as userId or occupantId'
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
        throw new Error('userId or occupantId are blocked');
      }

      let dialog = existingDialog;

      // if (!dialog) {
      //   log(`[${requestId}] Dialog not found, creating new one...`);
      //   dialog = await this.createDialog(jwtToken, deterministicPair, requestId, log);
      //   log(`[${requestId}] Dialog created with ID: ${dialog.$id}`);
      // } else {
      //   log(`[${requestId}] Existing dialog found with ID: ${dialog.$id}`);
      // }

      return dialog;

    } catch (error) {
      log(`[${requestId}] ERROR in initDialog: ${error.message}`);
      throw error;
    }
  }

  async checkIfDialogExists(jwtToken, occupantsPair, requestId, log) {
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

  async createDialog(jwtToken, occupants, requestedUserId, requestId, log) {
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
          { userId: occupants[0], permissions: ['write', 'read', 'update', 'delete'] },
          { userId: occupants[1], permissions: ['write', 'read', 'update', 'delete'] }
        ]
      );

      log(`[${requestId}] Dialog created successfully with ID: ${dialog.$id}`);
      return dialog;

    } catch (error) {
      // // error.type : document_already_exists
      // // error.code : 409
      // // Handle duplicate creation gracefully
      // if (error.code === 409 || error.message.includes('already exists')) {
      //   log(`[${requestId}] Dialog already exists, fetching existing one...`);

      //   const existingDialog = await this.checkIfDialogExists(jwtToken, occupants, requestId, log);
      //   if (existingDialog) {
      //     log(`[${requestId}] Retrieved existing dialog: ${existingDialog.$id}`);
      //     return existingDialog;
      //   }
      // }

      log(`[${requestId}] ERROR in createDialog: ${error.message}`);
      throw new Error(`Failed to create dialog: ${error.message}`);
    }
  }

  async hasAnyBlockage(jwtToken, senderId, receiverId, requestId, log) {
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

  async createDirectDialog(userId, occupantId, jwtToken, requestId, log) {
    try {
      const result = {
        hasBlockage: false,
        hasExistingDialog: false,
        remainingDirectMessages: 0,
        dialog: null
      };

      const deterministicPair = [userId, occupantId].sort();
      log(`[${requestId}] Sorted pair: [${deterministicPair.join(', ')}]`);

      log(`[${requestId}] Running parallel checks...`);
      const [blockage, existingDialog] = await Promise.all([
        this.hasAnyBlockage(jwtToken, userId, occupantId, requestId, log),
        this.checkIfDialogExists(jwtToken, deterministicPair, requestId, log)

      ]);
      log(`[${requestId}] Parallel checks completed`);

      if (blockage.length > 0) {
        log(`[${requestId}] Blockage found: ${blockage.map(b => b.$id).join(', ')}`);
        result.hasBlockage = true;
        return result;
      }

      if (existingDialog) {
        log(`[${requestId}] Existing dialog found: ${existingDialog.$id}`);
        result.dialog = existingDialog;
        result.hasExistingDialog = true;
        return result;
      }

      const usage = await profileService.useDirectMessageIfExists(
        jwtToken,
        userId,
        requestId,
        log
      );

      result.remainingDirectMessages = usage.remainingDirectMessages;

      if (usage.usedDirectMessageCount === 0) {
        log(`[${requestId}] No direct messages available`);
        return result;
      }
      const dialog = await this.createDialog(jwtToken, deterministicPair, occupantId, requestId, log);
      result.dialog = dialog;

      return result;
    } catch (error) {
      log(`[${requestId}] ERROR in createDirectDialog: ${error.message}`);
      throw new Error(`Failed to create direct dialog: ${error.message}`);
    }
  }

  async deleteDialogOld(jwtToken, dialogId, matchId, requestedUserId, requestId, log) {
    try {
      log(`[${requestId}] Starting dialog deletion for dialogId: ${dialogId} or matchId: ${matchId}`);

      const appwriteService = AppwriteService.getInstance();
      const results = {
        deletedDialog: null,
        deletedMatch: null,
        deletedAt: new Date().toISOString()
      };

      // Check dialog


      // Delete dialog if dialogId is provided
      if (dialogId) {
        try {
          const dialog = await appwriteService.getDocument(
            jwtToken,
            process.env.DB_COLLECTION_DIALOGS_ID,
            dialogId
          );

          if (dialog) {
            // Silme talebi ancak bu sohbetin katılımcıları tarafından yapılmalıdır
            const occupantIds = dialog.occupantIds || [];
            if (occupantIds.includes(requestedUserId)) {
              log(`[${requestId}] User ${requestedUserId} is a participant. Proceeding with deletion.`);
            } else {
              log(`[${requestId}] User ${requestedUserId} is not a participant. Deletion denied.`);
              throw new Error('User is not a participant of the dialog');
            }

            log(`[${requestId}] Deleting dialog with ID: ${dialogId}`);
            await appwriteService.deleteDocumentWithAdminPrivileges(
              jwtToken,
              process.env.DB_COLLECTION_DIALOGS_ID,
              dialogId
            );

            results.deletedDialog = dialogId;
            log(`[${requestId}] Dialog deleted successfully: ${dialogId}`);
          }


        } catch (dialogError) {
          log(`[${requestId}] Failed to delete dialog ${dialogId}: ${dialogError.message}`);
          // Don't throw immediately, try to delete match too
          if (!dialogError.message.includes('not found')) {
            throw new Error(`Failed to delete dialog: ${dialogError.message}`);
          }
        }
      }

      // Delete match if matchId is provided
      if (matchId) {
        try {
          const match = await appwriteService.getDocument(
            jwtToken,
            process.env.DB_COLLECTION_MATCHES_ID,
            matchId
          );

          if (match) {

            log(`[${requestId}] Deleting match with ID: ${matchId}`);
            await appwriteService.deleteDocumentWithAdminPrivileges(
              jwtToken,
              process.env.DB_COLLECTION_MATCHES_ID,
              matchId
            );
            results.deletedMatch = matchId;
            log(`[${requestId}] Match deleted successfully: ${matchId}`);
          }

        } catch (matchError) {
          log(`[${requestId}] Failed to delete match ${matchId}: ${matchError.message}`);
          if (!matchError.message.includes('not found')) {
            throw new Error(`Failed to delete match: ${matchError.message}`);
          }
        }
      }

      // Check if at least one deletion was successful
      if (!results.deletedDialog && !results.deletedMatch) {
        throw new Error('No documents were found to delete');
      }

      log(`[${requestId}] Deletion completed - Dialog: ${results.deletedDialog || 'N/A'}, Match: ${results.deletedMatch || 'N/A'}`);

      return {
        success: true,
        ...results
      };

    } catch (error) {
      log(`[${requestId}] ERROR in deleteDialog: ${error.message}`);

      // Re-throw with more specific error messages
      if (error.message.includes('not found') || error.code === 404) {
        throw new Error('Dialog or match not found');
      } else if (error.message.includes('unauthorized') || error.code === 401) {
        throw new Error('Unauthorized to delete dialog or match');
      } else if (error.code === 403) {
        throw new Error('Access denied to delete dialog or match');
      } else if (error.message.includes('required')) {
        throw error; // Pass validation errors as-is
      } else {
        throw new Error(`Failed to delete dialog/match: ${error.message}`);
      }
    }
  }
  /**
   * İki kullanıcı arasındaki TÜM ilişkileri siler
   * - Like'lar (her iki yönde)
   * - Match
   * - Dialog
   * 
   * NOT: Hangi kayıtların var olduğu önemli değil, bulduklarını siler
   * 404 hataları yoksayılır
   */
  async deleteDialog(jwtToken, occupantId, requestedUserId, blockAlso, requestId, log) {
    try {
      const startTime = Date.now();
      log(`[${requestId}] Removing all relations between ${requestedUserId} and ${occupantId}`);

      const appwriteService = AppwriteService.getInstance();

      // Generate all possible IDs
      const ids = {
        like: generateDocumentId('like', requestedUserId, occupantId),
        reverseLike: generateDocumentId('like', occupantId, requestedUserId),
        match: generateDocumentId('match', requestedUserId, occupantId),
        dialog: generateDocumentId('dialog', requestedUserId, occupantId),
        block: generateDocumentId('block', requestedUserId, occupantId)
      };

      log(`[${requestId}] Attempting to delete:`, ids);

      // Build deletion promises array
      const deletionPromises = [
        // Like: user1 → user2
        appwriteService.deleteDocumentWithAdminPrivileges(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          ids.like
        ).catch(err => {
          // 404 = Normal (like yoksa sorun değil)
          if (err.code !== 404) log(`[${requestId}] Like deletion error: ${err.message}`);
          return { deleted: false, type: 'like', error: err.code };
        }),

        // Like: user2 → user1
        appwriteService.deleteDocumentWithAdminPrivileges(
          jwtToken,
          process.env.DB_COLLECTION_LIKES_ID,
          ids.reverseLike
        ).catch(err => {
          if (err.code !== 404) log(`[${requestId}] Reverse like deletion error: ${err.message}`);
          return { deleted: false, type: 'reverseLike', error: err.code };
        }),

        // Match (her iki kullanıcı için aynı)
        appwriteService.deleteDocumentWithAdminPrivileges(
          jwtToken,
          process.env.DB_COLLECTION_MATCHES_ID,
          ids.match
        ).catch(err => {
          if (err.code !== 404) log(`[${requestId}] Match deletion error: ${err.message}`);
          return { deleted: false, type: 'match', error: err.code };
        }),

        // Dialog (her iki kullanıcı için aynı)
        appwriteService.deleteDocumentWithAdminPrivileges(
          jwtToken,
          process.env.DB_COLLECTION_DIALOGS_ID,
          ids.dialog
        ).catch(err => {
          if (err.code !== 404) log(`[${requestId}] Dialog deletion error: ${err.message}`);
          return { deleted: false, type: 'dialog', error: err.code };
        })
      ];

      // Add block creation if blockAlso is true
      if (blockAlso === true) {
        log(`[${requestId}] Block also requested, checking if block already exists`);

        deletionPromises.push(
          // First check if block already exists
          appwriteService.getDocument(
            jwtToken,
            process.env.DB_COLLECTION_BLOCKS_ID,
            ids.block
          ).then(existingBlock => {
            // Block already exists
            log(`[${requestId}] Block already exists: ${ids.block}`);
            return { created: false, type: 'block', id: ids.block, reason: 'already_exists' };
          }).catch(err => {
            // Block doesn't exist (404), create it
            if (err.code === 404 || err.message?.includes('not found')) {
              log(`[${requestId}] Block not found, creating new block: ${ids.block}`);

              return appwriteService.createDocumentWithAdminPrivileges(
                jwtToken,
                requestedUserId,
                process.env.DB_COLLECTION_BLOCKS_ID,
                ids.block,
                {
                  blockerId: requestedUserId,
                  blockedId: occupantId,
                  blockedProfile: occupantId
                },
                [
                  { userId: occupantId, permissions: ['read'] }
                ]
              ).then(result => {
                log(`[${requestId}] Block created successfully: ${ids.block}`);
                return { created: true, type: 'block', id: ids.block };
              }).catch(createErr => {
                // Handle potential race condition - another request might have created it
                if (createErr.code === 409 || createErr.message?.includes('already exists')) {
                  log(`[${requestId}] Block created by another request (race condition): ${ids.block}`);
                  return { created: false, type: 'block', id: ids.block, reason: 'race_condition' };
                }

                log(`[${requestId}] Block creation error: ${createErr.message}`);
                return { created: false, type: 'block', error: createErr.message };
              });
            } else {
              // Other error (network, auth, etc.)
              log(`[${requestId}] Block check error: ${err.message}`);
              return { created: false, type: 'block', error: err.message };
            }
          })
        );
      }

      // ✅ Promise.allSettled = HİÇBİRİ DİĞERİNİ ENGELLEMEZ!
      const deletions = await Promise.allSettled(deletionPromises);

      // Analyze results
      const summary = {
        deletedCount: 0,
        deleted: [],
        notFound: [],
        errors: [],
        blockCreated: false
      };

      const types = ['like', 'reverseLike', 'match', 'dialog'];
      // Add 'block' type if blockAlso was true
      if (blockAlso === true) {
        types.push('block');
      }

      deletions.forEach((result, index) => {
        const type = types[index];

        if (result.status === 'fulfilled') {
          // Handle block creation separately
          if (type === 'block') {
            if (result.value?.created === true) {
              summary.blockCreated = true;
              log(`[${requestId}] Block successfully created`);
            } else if (result.value?.created === false) {
              summary.errors.push({ type: 'block', error: result.value.error });
              log(`[${requestId}] Block creation failed: ${result.value.error}`);
            }
          } else {
            // Handle deletion results
            if (result.value?.deleted === false) {
              // Deletion failed
              if (result.value.error === 404) {
                summary.notFound.push(type);
              } else {
                summary.errors.push({ type, error: result.value.error });
              }
            } else {
              // Successfully deleted
              summary.deleted.push(type);
              summary.deletedCount++;
            }
          }
        } else {
          // Promise rejected (shouldn't happen with our catch blocks)
          summary.errors.push({ type, error: result.reason });
        }
      });

      const duration = Date.now() - startTime;

      log(`[${requestId}] Unmatch completed in ${duration}ms:`, {
        deleted: summary.deleted,
        notFound: summary.notFound,
        errors: summary.errors,
        blockCreated: summary.blockCreated
      });

      // ✅ EN AZ BİR KAYIT SİLİNDİYSE BAŞARILI!
      // Dialog-only case için bile çalışır
      const success = summary.deletedCount > 0 || summary.blockCreated;

      return {
        success,
        message: success
          ? `Removed ${summary.deletedCount} relation(s) between users${summary.blockCreated ? ' and blocked user' : ''}`
          : 'No relations found between users',
        deletedCount: summary.deletedCount,
        blockCreated: summary.blockCreated,
        details: {
          deleted: summary.deleted,
          notFound: summary.notFound,
          hasErrors: summary.errors.length > 0,
          blockCreated: summary.blockCreated
        },
        duration
      };

    } catch (error) {
      log(`[${requestId}] UNEXPECTED ERROR in unmatchUsers: ${error.message}`);
      // Unexpected error (network, auth, etc.)
      throw new Error(`Failed to unmatch users: ${error.message}`);
    }
  }


  async allowMedia(jwtToken, requestingUserId, dialogId, allowed, requestId, log) {
    try {
      const operationStart = Date.now();
      const appwriteService = AppwriteService.getInstance();

      const dialog = await appwriteService.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_DIALOGS_ID,
        dialogId
      );

      let mediaAllowedIds = dialog.mediaAllowedIds || [];
      if (allowed) {
        if (!mediaAllowedIds.includes(requestingUserId)) {
          mediaAllowedIds.push(requestingUserId);
        }
      } else {
        mediaAllowedIds = mediaAllowedIds.filter(id => id !== requestingUserId);
      }

      const occupantId = dialog.occupantIds.find(id => id !== requestingUserId);
      const result = await appwriteService.updateDocumentWithAdminPrivileges(
        jwtToken,
        requestingUserId,
        process.env.DB_COLLECTION_DIALOGS_ID,
        dialogId,
        { mediaAllowedIds: mediaAllowedIds },
        [{ userId: occupantId, permissions: ['write', 'read', 'update', 'delete'] }]
      );

      const operationDuration = Date.now() - operationStart;
      log(`[${requestId}] ${allowed ? 'Allow' : 'Disallow'} media operation completed in ${operationDuration}ms`);
      return result;
    } catch (error) {
      log(`[${requestId}] ERROR in allowMedia: ${error.message}`);
      throw new Error(`Failed to ${allowed ? 'allow' : 'disallow'} media: ${error.message}`);
    }
  }

}
export default new DialogService();