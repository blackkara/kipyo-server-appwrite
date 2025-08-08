import { Client, Databases, Account, Query, Permission, Role } from 'node-appwrite';
import PostHogService from './utils/posthog/PostHogService.js';

class AppwriteService {
  constructor(logger, postHogConfig = {}) {
    this.log = logger || console.log;
    this.postHog = new PostHogService(postHogConfig);
  }

  // ======================
  // Client Factory
  // ======================
  createClient(auth) {
    const context = { methodName: 'createClient' };
    
    try {
      if (!auth) {
        throw new Error('Authentication is required (JWT token or API key)');
      }

      const client = new Client()
        .setEndpoint(process.env.APPWRITE_END_POINT)
        .setProject(process.env.APPWRITE_PROJECT_ID);

      if (this.isJWTToken(auth)) {
        client.setJWT(auth);
      } else {
        client.setKey(auth);
      }

      return client;
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  isJWTToken(auth) {
    return auth.split('.').length === 3;
  }

  getDatabases(auth) {
    return new Databases(this.createClient(auth));
  }

  getAccount(auth) {
    return new Account(this.createClient(auth));
  }

  getAdminDatabases() {
    const context = { methodName: 'getAdminDatabases' };
    
    try {
      if (!process.env.APPWRITE_DEV_KEY) {
        throw new Error('APPWRITE_DEV_KEY is not configured');
      }
      return new Databases(this.createClient(process.env.APPWRITE_DEV_KEY));
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // JWT Validation
  // ======================
  async validateJWT(jwtToken) {
    const context = { 
      methodName: 'validateJWT',
      additionalData: { hasToken: !!jwtToken }
    };

    try {
      const account = this.getAccount(jwtToken);
      const user = await account.get();

      const result = {
        ...user,
        userId: user.$id,
      };

      // Başarılı authentication tracking
      await this.postHog.trackBusinessEvent('user_authenticated', {
        user_id: result.userId,
        authentication_method: 'jwt'
      }, result.userId);

      return result;
    } catch (error) {
      await this.postHog.trackError(error, context);
      throw new Error(`JWT validation failed: ${error.message}`);
    }
  }

  async validateAndExtractUser(headers, requestId) {
    const context = { 
      methodName: 'validateAndExtractUser', 
      requestId,
      additionalData: { hasHeaders: !!headers }
    };

    return this.postHog.withTracking('validateAndExtractUser', async () => {
      const jwtToken = extractJWTFromHeaders(headers);
      const userInfo = await this.validateJWT(jwtToken);

      if (!userInfo.userId) {
        throw new Error('Failed to extract user info from JWT');
      }

      this.log(`[${requestId}] JWT validation successful for user: ${userInfo.userId}`);
      return { jwtToken, userInfo };
    }, { ...context, userId: requestId });
  }

  // ======================
  // Permission Builder
  // ======================
  buildPermissions(ownerId, additionalUsers = []) {
    const context = { 
      methodName: 'buildPermissions', 
      userId: ownerId,
      additionalData: { 
        additionalUsersCount: additionalUsers.length,
        ownerProvided: !!ownerId
      }
    };

    try {
      const permissions = [
        Permission.read(Role.user(ownerId)),
        Permission.update(Role.user(ownerId)),
        Permission.delete(Role.user(ownerId)),
        Permission.write(Role.user(ownerId)),
      ];

      additionalUsers.forEach(({ userId, permissions: perms = ['read'] }) => {
        perms.forEach(perm => {
          if (Permission[perm]) {
            permissions.push(Permission[perm](Role.user(userId)));
          } else {
            console.warn(`Unknown permission: ${perm}`);
            // Bilinmeyen permission tracking
            this.postHog.trackError(new Error(`Unknown permission: ${perm}`), {
              ...context,
              additionalData: { unknownPermission: perm }
            });
          }
        });
      });

      return permissions;
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // Admin Privilege Check
  // ======================
  requireSystemUser(userInfo) {
    const context = { 
      methodName: 'requireSystemUser', 
      userId: userInfo?.userId,
      additionalData: { isSystemUser: userInfo?.isSystemUser }
    };

    try {
      if (!userInfo.isSystemUser) {
        throw new Error('Unauthorized: Admin privileges required');
      }
    } catch (error) {
      this.postHog.trackError(error, context);
      throw error;
    }
  }

  // ======================
  // User-Level Actions
  // ======================
  async listDocuments(jwtToken, collectionId, queries = []) {
    const context = { 
      methodName: 'listDocuments', 
      collectionId,
      additionalData: { queriesCount: queries.length }
    };

    return this.postHog.withTracking('listDocuments', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      const result = await this.getDatabases(jwtToken).listDocuments(
        process.env.APPWRITE_DB_ID,
        collectionId,
        queries
      );

      // Business event tracking
      await this.postHog.trackBusinessEvent('documents_listed', {
        collection_id: collectionId,
        documents_count: result.documents.length,
        total_count: result.total
      }, userInfo.userId);

      return result;
    }, { ...context, userId: jwtToken });
  }

  async getDocument(jwtToken, collectionId, documentId) {
    const context = { 
      methodName: 'getDocument', 
      collectionId, 
      documentId
    };

    return this.postHog.withTracking('getDocument', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      const result = await this.getDatabases(jwtToken).getDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId
      );

      await this.postHog.trackBusinessEvent('document_retrieved', {
        collection_id: collectionId,
        document_id: documentId
      }, userInfo.userId);

      return result;
    }, { ...context, userId: jwtToken });
  }

  async updateDocument(jwtToken, collectionId, documentId, data) {
    const context = { 
      methodName: 'updateDocument', 
      collectionId, 
      documentId,
      additionalData: { hasData: !!data, dataKeys: Object.keys(data || {}) }
    };

    return this.postHog.withTracking('updateDocument', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      const result = await this.getDatabases(jwtToken).updateDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId,
        data
      );

      await this.postHog.trackBusinessEvent('document_updated', {
        collection_id: collectionId,
        document_id: documentId,
        fields_updated: Object.keys(data || {}).length
      }, userInfo.userId);

      return result;
    }, { ...context, userId: jwtToken });
  }

  async deleteDocument(jwtToken, collectionId, documentId) {
    const context = { 
      methodName: 'deleteDocument', 
      collectionId, 
      documentId
    };

    return this.postHog.withTracking('deleteDocument', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      const result = await this.getDatabases(jwtToken).deleteDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId
      );

      await this.postHog.trackBusinessEvent('document_deleted', {
        collection_id: collectionId,
        document_id: documentId
      }, userInfo.userId);

      return result;
    }, { ...context, userId: jwtToken });
  }

  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    const context = { 
      methodName: 'deleteUserDocuments', 
      collectionId,
      additionalData: { additionalQueriesCount: additionalQueries.length }
    };

    return this.postHog.withTracking('deleteUserDocuments', async () => {
      const { userId } = await this.validateJWT(jwtToken);

      const queries = [Query.equal('userId', userId), ...additionalQueries];
      const result = await this.getDatabases(jwtToken).listDocuments(
        process.env.APPWRITE_DB_ID,
        collectionId,
        queries
      );

      const deletedIds = [];
      for (const doc of result.documents) {
        try {
          await this.getDatabases(jwtToken).deleteDocument(
            process.env.APPWRITE_DB_ID,
            collectionId,
            doc.$id
          );
          deletedIds.push(doc.$id);
        } catch (err) {
          console.warn(`Failed to delete document ${doc.$id}: ${err.message}`);
          await this.postHog.trackError(err, {
            methodName: 'deleteUserDocuments_individual',
            collectionId,
            documentId: doc.$id,
            userId
          });
        }
      }

      const deletionResult = { 
        deletedCount: deletedIds.length, 
        totalFound: result.documents.length, 
        deletedIds 
      };

      await this.postHog.trackBusinessEvent('user_documents_bulk_deleted', {
        collection_id: collectionId,
        documents_found: result.documents.length,
        documents_deleted: deletedIds.length,
        deletion_success_rate: (deletedIds.length / result.documents.length) * 100
      }, userId);

      return deletionResult;
    }, { ...context, userId: jwtToken });
  }

  // ======================
  // Admin-Level Actions
  // ======================
  async createDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    const context = { 
      methodName: 'createDocumentWithAdminPrivileges', 
      collectionId, 
      documentId,
      userId: requestingUserId,
      additionalData: { 
        hasData: !!data, 
        additionalUsersCount: additionalUsers.length,
        dataKeys: Object.keys(data || {})
      }
    };

    return this.postHog.withTracking('createDocumentWithAdminPrivileges', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      this.requireSystemUser(userInfo);

      const permissions = this.buildPermissions(requestingUserId, additionalUsers);
      this.log(`[ADMIN ACTION] ${userInfo.userId} creating document in ${collectionId} with permissions:`, permissions);

      const result = await this.getAdminDatabases().createDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId,
        data,
        permissions
      );

      await this.postHog.trackBusinessEvent('admin_document_created', {
        collection_id: collectionId,
        document_id: documentId,
        requesting_user_id: requestingUserId,
        admin_user_id: userInfo.userId,
        additional_users_count: additionalUsers.length
      }, userInfo.userId);

      return result;
    }, context);
  }

  async updateDocumentWithAdminPrivileges(jwtToken, requestingUserId, collectionId, documentId, data, additionalUsers = []) {
    const context = { 
      methodName: 'updateDocumentWithAdminPrivileges', 
      collectionId, 
      documentId,
      userId: requestingUserId,
      additionalData: { 
        hasData: !!data, 
        additionalUsersCount: additionalUsers.length,
        dataKeys: Object.keys(data || {})
      }
    };

    return this.postHog.withTracking('updateDocumentWithAdminPrivileges', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      this.requireSystemUser(userInfo);

      const permissions = this.buildPermissions(requestingUserId, additionalUsers);
      this.log(`[ADMIN ACTION] ${userInfo.userId} updating document ${documentId} in ${collectionId}`);

      const result = await this.getAdminDatabases().updateDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId,
        data,
        permissions
      );

      await this.postHog.trackBusinessEvent('admin_document_updated', {
        collection_id: collectionId,
        document_id: documentId,
        requesting_user_id: requestingUserId,
        admin_user_id: userInfo.userId,
        additional_users_count: additionalUsers.length,
        fields_updated: Object.keys(data || {}).length
      }, userInfo.userId);

      return result;
    }, context);
  }

  async deleteDocumentWithAdminPrivileges(jwtToken, collectionId, documentId) {
    const context = { 
      methodName: 'deleteDocumentWithAdminPrivileges', 
      collectionId, 
      documentId
    };

    return this.postHog.withTracking('deleteDocumentWithAdminPrivileges', async () => {
      const userInfo = await this.validateJWT(jwtToken);
      this.requireSystemUser(userInfo);

      this.log(`[ADMIN ACTION] ${userInfo.userId} deleting document ${documentId} in ${collectionId}`);
      
      const result = await this.getAdminDatabases().deleteDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId
      );

      await this.postHog.trackBusinessEvent('admin_document_deleted', {
        collection_id: collectionId,
        document_id: documentId,
        admin_user_id: userInfo.userId
      }, userInfo.userId);

      return result;
    }, { ...context, userId: userInfo.userId });
  }

  // ======================
  // Graceful Shutdown
  // ======================
  async shutdown() {
    try {
      await this.postHog.flush();
      await this.postHog.shutdown();
    } catch (error) {
      console.error('Error during AppwriteService shutdown:', error);
    }
  }

  // ======================
  // Static helpers
  // ======================
  static createQuery() {
    return Query;
  }

  static createPermission() {
    return Permission;
  }

  static createRole() {
    return Role;
  }

  // ======================
  // PostHog Access
  // ======================
  getPostHogService() {
    return this.postHog;
  }
}

// ======================
// JWT Extract Helper
// ======================
export function extractJWTFromHeaders(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader) throw new Error('Authorization header is missing');
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format. Expected: Bearer <token>');
  }
  return authHeader.substring(7);
}

export default AppwriteService;