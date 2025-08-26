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
   * Upsert document with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} requestingUserId - User ID to set permissions for
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Object} data - Document data
   * @param {Array} additionalUsers - Additional users with permissions
   * @returns {Promise<Object>} - Upserted document
   */
  async upsertDocumentWithAdminPrivileges(
    jwtToken,
    requestingUserId,
    collectionId,
    documentId,
    data,
    additionalUsers = []
  ) {
    const context = {
      methodName: 'upsertDocumentWithAdminPrivileges',
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
      
      this.log(`[ADMIN ACTION] Upserting document ${documentId} in ${collectionId} for user ${requestingUserId}`);

      // This uses API key internally (configured in environment)
      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.upsertDocument(
        databaseId,
        collectionId,
        documentId,
        data,
        permissions
      );

      // Determine if it was create or update
      const isUpdate = result.$updatedAt !== result.$createdAt;
      const eventName = isUpdate ? 
        TRACKING_EVENTS.ADMIN_DOCUMENT_UPDATED : 
        TRACKING_EVENTS.ADMIN_DOCUMENT_CREATED;

      await this.trackAdminEvent(eventName, {
        collection_id: collectionId,
        document_id: documentId,
        requesting_user_id: requestingUserId,
        operation: 'upsert',
        was_update: isUpdate,
        additional_users_count: additionalUsers.length,
        data_fields_count: Object.keys(data || {}).length
      }, requestingUserId);

      return result;
    }, context);
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
   * Bulk upsert documents with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {Array} documents - Array of {documentId, data, userId, additionalUsers} objects
   * @returns {Promise<Object>} - Bulk upsert result
   */
  async bulkUpsertDocumentsWithAdminPrivileges(jwtToken, collectionId, documents) {
    const context = {
      methodName: 'bulkUpsertDocumentsWithAdminPrivileges',
      collectionId,
      additionalData: { documentsCount: documents.length }
    };

    return this.executeAdminOperation(async () => {
      // Note: We receive JWT for user context, but use API key internally for admin operations
      this.log(`[ADMIN ACTION] Bulk upserting ${documents.length} documents in ${collectionId}`);

      // This uses API key internally (configured in environment)
      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const results = {
        successful: [],
        failed: [],
        created: 0,
        updated: 0,
        totalProcessed: 0
      };

      for (const doc of documents) {
        try {
          // Build permissions for each document
          const permissions = this.buildPermissions(
            doc.userId || doc.requestingUserId, 
            doc.additionalUsers || []
          );
          
          const result = await databases.upsertDocument(
            databaseId,
            collectionId,
            doc.documentId,
            doc.data,
            permissions
          );
          
          // Check if it was create or update
          const isUpdate = result.$updatedAt !== result.$createdAt;
          if (isUpdate) {
            results.updated++;
          } else {
            results.created++;
          }
          
          results.successful.push({
            documentId: doc.documentId,
            result,
            operation: isUpdate ? 'updated' : 'created'
          });
        } catch (error) {
          results.failed.push({
            documentId: doc.documentId,
            error: error.message
          });
        }
        results.totalProcessed++;
      }

      results.successRate = (results.successful.length / results.totalProcessed) * 100;

      await this.trackAdminEvent('admin_bulk_upsert', {
        collection_id: collectionId,
        total_documents: documents.length,
        successful_upserts: results.successful.length,
        documents_created: results.created,
        documents_updated: results.updated,
        failed_upserts: results.failed.length,
        success_rate: results.successRate
      }, 'admin');

      return results;
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
   * Delete documents by query with admin privileges
   * Uses Appwrite's native bulk delete capability
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {Array} queries - Array of query strings (e.g., [Query.equal('status', 'archived')])
   * @returns {Promise<Object>} - Bulk deletion result
   */
  async deleteDocumentsByQueryWithAdminPrivileges(jwtToken, collectionId, queries = []) {
    const context = {
      methodName: 'deleteDocumentsByQueryWithAdminPrivileges',
      collectionId,
      additionalData: { 
        queriesCount: queries.length,
        hasQueries: queries.length > 0
      }
    };

    return this.executeAdminOperation(async () => {
      // Safety check: Prevent accidental deletion of all documents
      if (!queries || queries.length === 0) {
        const errorMsg = 'Queries are required for bulk delete. To delete all documents, use deleteAllDocumentsWithAdminPrivileges() method explicitly.';
        this.log(`[ADMIN ERROR] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      this.log(`[ADMIN ACTION] Deleting documents in ${collectionId} with ${queries.length} queries`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      try {
        // Use Appwrite's native bulk delete
        const result = await databases.deleteDocuments(
          databaseId,
          collectionId,
          queries
        );

        await this.trackAdminEvent('admin_bulk_delete_by_query', {
          collection_id: collectionId,
          queries_count: queries.length
        }, 'admin');

        return {
          success: true,
          message: `Documents matching queries deleted successfully`,
          result
        };

      } catch (error) {
        // If the method doesn't exist (older SDK), fall back to manual deletion
        if (error.message?.includes('deleteDocuments is not a function')) {
          this.log('[ADMIN WARNING] deleteDocuments not available, falling back to manual deletion');
          return this.deleteDocumentsByQueryFallback(jwtToken, collectionId, queries);
        }
        throw error;
      }
    }, context);
  }

  /**
   * Delete ALL documents in a collection with admin privileges
   * THIS IS A DANGEROUS OPERATION - USE WITH EXTREME CAUTION
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {boolean} confirmDeletion - Must be explicitly set to true to proceed
   * @returns {Promise<Object>} - Bulk deletion result
   */
  async deleteAllDocumentsWithAdminPrivileges(jwtToken, collectionId, confirmDeletion = false) {
    const context = {
      methodName: 'deleteAllDocumentsWithAdminPrivileges',
      collectionId,
      additionalData: { 
        confirmDeletion
      }
    };

    return this.executeAdminOperation(async () => {
      // Safety check: Require explicit confirmation
      if (confirmDeletion !== true) {
        const errorMsg = 'Must explicitly confirm deletion by passing confirmDeletion=true';
        this.log(`[ADMIN ERROR] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      this.log(`[ADMIN WARNING] DELETING ALL DOCUMENTS in collection ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      try {
        // Use Appwrite's native bulk delete with no queries
        const result = await databases.deleteDocuments(
          databaseId,
          collectionId,
          [] // Empty array deletes all documents
        );

        await this.trackAdminEvent('admin_delete_all_documents', {
          collection_id: collectionId,
          confirmed: true
        }, 'admin');

        return {
          success: true,
          message: `All documents in collection ${collectionId} deleted successfully`,
          result
        };

      } catch (error) {
        // If the method doesn't exist (older SDK), fall back to manual deletion
        if (error.message?.includes('deleteDocuments is not a function')) {
          this.log('[ADMIN WARNING] deleteDocuments not available, falling back to manual deletion');
          return this.deleteDocumentsByQueryFallback(jwtToken, collectionId, []);
        }
        throw error;
      }
    }, context);
  }

  /**
   * Fallback method for bulk delete if deleteDocuments is not available
   * @private
   */
  async deleteDocumentsByQueryFallback(jwtToken, collectionId, queries) {
    this.log('[ADMIN ACTION] Using fallback deletion method');
    
    const databases = this.clientManager.getAdminDatabases();
    const databaseId = this.getDatabaseId();
    
    // First, list all documents matching the queries
    const documents = await databases.listDocuments(
      databaseId,
      collectionId,
      queries
    );

    if (documents.documents.length === 0) {
      return {
        success: true,
        message: 'No documents found matching the queries',
        deletedCount: 0
      };
    }

    // Extract document IDs
    const documentIds = documents.documents.map(doc => doc.$id);
    
    // Use existing bulk delete method
    const deleteResult = await this.bulkDeleteDocuments(jwtToken, collectionId, documentIds);
    
    return {
      success: deleteResult.successful.length > 0,
      message: `Deleted ${deleteResult.successful.length} of ${documentIds.length} documents`,
      deletedCount: deleteResult.successful.length,
      failedCount: deleteResult.failed.length,
      details: deleteResult
    };
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

  /**
   * Get document with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} - Document
   */
  async getDocument(jwtToken, collectionId, documentId) {
    const context = {
      methodName: 'getDocument',
      collectionId,
      documentId
    };

    return this.executeAdminOperation(async () => {
      this.log(`[ADMIN ACTION] Getting document ${documentId} from ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.getDocument(
        databaseId,
        collectionId,
        documentId
      );

      await this.trackAdminEvent('admin_document_read', {
        collection_id: collectionId,
        document_id: documentId
      }, 'admin');

      return result;
    }, context);
  }

  /**
   * List documents with admin privileges
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {Array} queries - Query array
   * @returns {Promise<Object>} - Documents list
   */
  async listDocuments(jwtToken, collectionId, queries = []) {
    const context = {
      methodName: 'listDocuments',
      collectionId,
      additionalData: { queriesCount: queries.length }
    };

    return this.executeAdminOperation(async () => {
      this.log(`[ADMIN ACTION] Listing documents in ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.listDocuments(
        databaseId,
        collectionId,
        queries
      );

      await this.trackAdminEvent('admin_documents_listed', {
        collection_id: collectionId,
        queries_count: queries.length,
        documents_found: result.documents.length
      }, 'admin');

      return result;
    }, context);
  }

  /**
   * Update document with admin privileges (simplified version without permissions change)
   * @param {string} jwtToken - JWT token for user identification (admin operations will use API key internally)
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} - Updated document
   */
  async updateDocument(jwtToken, collectionId, documentId, data) {
    const context = {
      methodName: 'updateDocument',
      collectionId,
      documentId,
      additionalData: {
        hasData: !!data,
        dataKeys: Object.keys(data || {})
      }
    };

    return this.executeAdminOperation(async () => {
      this.log(`[ADMIN ACTION] Updating document ${documentId} in ${collectionId}`);

      const databases = this.clientManager.getAdminDatabases();
      const databaseId = this.getDatabaseId();
      
      const result = await databases.updateDocument(
        databaseId,
        collectionId,
        documentId,
        data
      );

      await this.trackAdminEvent('admin_document_updated_simple', {
        collection_id: collectionId,
        document_id: documentId,
        fields_updated: Object.keys(data || {}).length
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