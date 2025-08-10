// src/services/appwrite/operations/AdminOperations.js

import { Permission, Role } from 'node-appwrite';
import { TRACKING_EVENTS } from '../utils/Constants.js';

/**
 * Handles admin-level operations with elevated privileges
 */
export class AdminOperations {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.clientManager = dependencies.clientManager;
    this.jwtValidator = dependencies.jwtValidator;
    this.retryManager = dependencies.retryManager;
    this.performanceMonitor = dependencies.performanceMonitor;
    this.postHog = dependencies.postHogService;
    this.config = dependencies.configManager;
  }

  /**
   * Create document with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} requestingUserId - User ID to set permissions for
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Object} data - Document data
   * @param {Array} additionalUsers - Additional users with permissions
   * @returns {Promise<Object>} - Created document
   */
  async createDocumentWithAdminPrivileges(
    jwtToken,
    requestingUserId,
    collectionId,
    documentId,
    data,
    additionalUsers = []
  ) {
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

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      const permissions = this.buildPermissions(requestingUserId, additionalUsers);
      
      this.log(`[ADMIN ACTION] Creating document in ${collectionId} with permissions for user ${requestingUserId}`);

      // This uses API key internally (configured in environment)
      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.createDocument(
        databaseId,
        collectionId,
        documentId,
        data,
        permissions
      );

      await this.trackAdminEvent(TRACKING_EVENTS.ADMIN_DOCUMENT_CREATED, {
        collection_id: collectionId,
        document_id: documentId,
        requesting_user_id: requestingUserId,
        additional_users_count: additionalUsers.length,
        data_fields_count: Object.keys(data || {}).length
      }, requestingUserId);

      return result;
    }, context);
  }

  /**
   * Update document with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} requestingUserId - User ID to set permissions for
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Object} data - Update data
   * @param {Array} additionalUsers - Additional users with permissions
   * @returns {Promise<Object>} - Updated document
   */
  async updateDocumentWithAdminPrivileges(
    jwtToken,
    requestingUserId,
    collectionId,
    documentId,
    data,
    additionalUsers = []
  ) {
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

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      const permissions = this.buildPermissions(requestingUserId, additionalUsers);
      
      this.log(`[ADMIN ACTION] Updating document ${documentId} in ${collectionId} for user ${requestingUserId}`);

      // This uses API key internally (configured in environment)
      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.updateDocument(
        databaseId,
        collectionId,
        documentId,
        data,
        permissions
      );

      await this.trackAdminEvent(TRACKING_EVENTS.ADMIN_DOCUMENT_UPDATED, {
        collection_id: collectionId,
        document_id: documentId,
        requesting_user_id: requestingUserId,
        additional_users_count: additionalUsers.length,
        fields_updated: Object.keys(data || {}).length
      }, requestingUserId);

      return result;
    }, context);
  }

  /**
   * Delete document with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteDocumentWithAdminPrivileges(jwtToken, collectionId, documentId) {
    const context = {
      methodName: 'deleteDocumentWithAdminPrivileges',
      collectionId,
      documentId
    };

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      this.log(`[ADMIN ACTION] Deleting document ${documentId} in ${collectionId}`);

      // This uses API key internally (configured in environment)
      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.deleteDocument(
        databaseId,
        collectionId,
        documentId
      );

      await this.trackAdminEvent(TRACKING_EVENTS.ADMIN_DOCUMENT_DELETED, {
        collection_id: collectionId,
        document_id: documentId
      }, 'admin');

      return result;
    }, context);
  }

  /**
   * List all documents in collection with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {Array} queries - Query array
   * @returns {Promise<Object>} - Documents list
   */
  async listAllDocuments(jwtToken, collectionId, queries = []) {
    const context = {
      methodName: 'listAllDocuments',
      collectionId,
      additionalData: { queriesCount: queries.length }
    };

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      this.log(`[ADMIN ACTION] Listing all documents in ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.listDocuments(
        databaseId,
        collectionId,
        queries
      );

      return result;
    }, context);
  }

  /**
   * Bulk update documents with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {Array} updates - Array of {documentId, data} objects
   * @returns {Promise<Object>} - Bulk update result
   */
  async bulkUpdateDocuments(jwtToken, collectionId, updates) {
    const context = {
      methodName: 'bulkUpdateDocuments',
      collectionId,
      additionalData: { updatesCount: updates.length }
    };

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      this.log(`[ADMIN ACTION] Bulk updating ${updates.length} documents in ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const results = {
        successful: [],
        failed: [],
        totalProcessed: 0
      };

      for (const update of updates) {
        try {
          const result = await databases.updateDocument(
            databaseId,
            collectionId,
            update.documentId,
            update.data
          );
          results.successful.push({
            documentId: update.documentId,
            result
          });
        } catch (error) {
          results.failed.push({
            documentId: update.documentId,
            error: error.message
          });
        }
        results.totalProcessed++;
      }

      results.successRate = (results.successful.length / results.totalProcessed) * 100;

      await this.trackAdminEvent('admin_bulk_update', {
        collection_id: collectionId,
        total_documents: updates.length,
        successful_updates: results.successful.length,
        failed_updates: results.failed.length,
        success_rate: results.successRate
      }, 'admin');

      return results;
    }, context);
  }

  /**
   * Bulk delete documents with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {Array} documentIds - Document IDs to delete
   * @returns {Promise<Object>} - Bulk deletion result
   */
  async bulkDeleteDocuments(jwtToken, collectionId, documentIds) {
    const context = {
      methodName: 'bulkDeleteDocuments',
      collectionId,
      additionalData: { documentCount: documentIds.length }
    };

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      this.log(`[ADMIN ACTION] Bulk deleting ${documentIds.length} documents in ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const results = {
        successful: [],
        failed: [],
        totalProcessed: 0
      };

      for (const documentId of documentIds) {
        try {
          await databases.deleteDocument(
            databaseId,
            collectionId,
            documentId
          );
          results.successful.push(documentId);
        } catch (error) {
          results.failed.push({
            documentId,
            error: error.message
          });
        }
        results.totalProcessed++;
      }

      results.successRate = (results.successful.length / results.totalProcessed) * 100;

      await this.trackAdminEvent('admin_bulk_delete', {
        collection_id: collectionId,
        total_documents: documentIds.length,
        successful_deletes: results.successful.length,
        failed_deletes: results.failed.length,
        success_rate: results.successRate
      }, 'admin');

      return results;
    }, context);
  }

  /**
   * Update document permissions
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Array} permissions - New permissions
   * @returns {Promise<Object>} - Updated document
   */
  async updateDocumentPermissions(jwtToken, collectionId, documentId, permissions) {
    const context = {
      methodName: 'updateDocumentPermissions',
      collectionId,
      documentId,
      additionalData: { permissionsCount: permissions.length }
    };

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      this.log(`[ADMIN ACTION] Updating permissions for document ${documentId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      // Get current document
      const document = await databases.getDocument(
        databaseId,
        collectionId,
        documentId
      );

      // Update with new permissions
      const result = await databases.updateDocument(
        databaseId,
        collectionId,
        documentId,
        document, // Keep existing data
        permissions // New permissions
      );

      await this.trackAdminEvent('admin_permissions_updated', {
        collection_id: collectionId,
        document_id: documentId,
        permissions_count: permissions.length
      }, 'admin');

      return result;
    }, context);
  }

  // Helper methods

  /**
   * Build permissions array
   * @param {string} ownerId - Document owner ID
   * @param {Array} additionalUsers - Additional users
   * @returns {Array} - Permissions array
   */
  buildPermissions(ownerId, additionalUsers = []) {
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
        }
      });
    });

    return permissions;
  }

  /**
   * Note: Admin operations explanation
   * 
   * These methods receive JWT tokens for user identification/context,
   * but internally use API key (configured via APPWRITE_DEV_KEY) 
   * to perform privileged operations through getAdminDatabases().
   * 
   * This allows regular users to trigger admin operations (if allowed by your business logic)
   * while the actual database operations are performed with admin privileges.
   * 
   * The JWT is used for:
   * - Tracking who initiated the action
   * - Setting appropriate permissions for the requesting user
   * 
   * The API key is used for:
   * - Actually performing the database operations with elevated privileges
   * - Bypassing normal user permission restrictions
   */

  /**
   * Execute admin operation with retry and performance tracking
   * @private
   */
  async executeAdminOperation(operation, context) {
    // Track performance if monitor available
    if (this.performanceMonitor) {
      return this.performanceMonitor.trackOperation(
        context.methodName,
        async () => this.executeWithRetry(operation, context),
        context
      );
    }

    return this.executeWithRetry(operation, context);
  }

  /**
   * Execute with retry if retry manager available
   * @private
   */
  async executeWithRetry(operation, context) {
    if (this.retryManager) {
      return this.retryManager.executeWithRetry(operation, context);
    }
    return operation();
  }

  /**
   * Get database ID from config
   * @private
   */
  getDatabaseId() {
    return this.config ? 
      this.config.get('appwrite.databaseId') : 
      process.env.APPWRITE_DB_ID;
  }

  /**
   * Track admin event
   * @private
   */
  async trackAdminEvent(eventName, data, userId) {
    if (!this.postHog) return;
    
    try {
      await this.postHog.trackBusinessEvent(eventName, {
        ...data,
        is_admin_action: true
      }, userId);
    } catch (error) {
      this.log('Failed to track admin event:', error.message);
    }
  }

  /**
   * Create permission builder helper
   * @returns {Object} - Permission builder
   */
  static createPermissionBuilder() {
    return { Permission, Role };
  }
}

export default AdminOperations;