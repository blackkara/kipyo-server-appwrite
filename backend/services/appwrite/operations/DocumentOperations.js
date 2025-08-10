// src/services/appwrite/operations/DocumentOperations.js

import { Query } from 'node-appwrite';
import { TRACKING_EVENTS } from '../utils/Constants.js';

/**
 * Handles document CRUD operations
 */
export class DocumentOperations {
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
   * List documents with queries
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {Array} queries - Query array
   * @returns {Promise<Object>} - List result
   */
  async listDocuments(jwtToken, collectionId, queries = []) {
    const context = {
      methodName: 'listDocuments',
      collectionId,
      additionalData: { queriesCount: queries.length }
    };

    return this.executeOperation(async () => {
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();
      
      const result = await databases.listDocuments(
        databaseId,
        collectionId,
        queries
      );

      // Track business event
      await this.trackBusinessEvent(TRACKING_EVENTS.DOCUMENTS_LISTED, {
        collection_id: collectionId,
        documents_count: result.documents.length,
        total_count: result.total,
        queries_applied: queries.length
      }, jwtToken);

      return result;
    }, context, jwtToken);
  }

  /**
   * Get single document
   * @param {string} jwtToken - JWT token
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

    return this.executeOperation(async () => {
      const userInfo = await this.validateUser(jwtToken);
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();
      
      const result = await databases.getDocument(
        databaseId,
        collectionId,
        documentId
      );

      await this.trackBusinessEvent(TRACKING_EVENTS.DOCUMENT_RETRIEVED, {
        collection_id: collectionId,
        document_id: documentId
      }, userInfo.userId);

      return result;
    }, context, jwtToken);
  }

  /**
   * Create document
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Object} data - Document data
   * @param {Array} permissions - Document permissions
   * @returns {Promise<Object>} - Created document
   */
  async createDocument(jwtToken, collectionId, documentId, data, permissions = []) {
    const context = {
      methodName: 'createDocument',
      collectionId,
      documentId,
      additionalData: { 
        hasData: !!data,
        dataKeys: Object.keys(data || {}),
        permissionsCount: permissions.length
      }
    };

    return this.executeOperation(async () => {
      const userInfo = await this.validateUser(jwtToken);
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();
      
      const result = await databases.createDocument(
        databaseId,
        collectionId,
        documentId,
        data,
        permissions
      );

      await this.trackBusinessEvent(TRACKING_EVENTS.DOCUMENT_CREATED, {
        collection_id: collectionId,
        document_id: documentId,
        fields_count: Object.keys(data || {}).length,
        permissions_count: permissions.length
      }, userInfo.userId);

      return result;
    }, context, jwtToken);
  }

  /**
   * Update document
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @param {Object} data - Update data
   * @param {Array} permissions - Updated permissions
   * @returns {Promise<Object>} - Updated document
   */
  async updateDocument(jwtToken, collectionId, documentId, data, permissions = null) {
    const context = {
      methodName: 'updateDocument',
      collectionId,
      documentId,
      additionalData: { 
        hasData: !!data,
        dataKeys: Object.keys(data || {}),
        hasPermissions: !!permissions
      }
    };

    return this.executeOperation(async () => {
      const userInfo = await this.validateUser(jwtToken);
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();
      
      const params = [databaseId, collectionId, documentId, data];
      if (permissions !== null) {
        params.push(permissions);
      }
      
      const result = await databases.updateDocument(...params);

      await this.trackBusinessEvent(TRACKING_EVENTS.DOCUMENT_UPDATED, {
        collection_id: collectionId,
        document_id: documentId,
        fields_updated: Object.keys(data || {}).length
      }, userInfo.userId);

      return result;
    }, context, jwtToken);
  }

  /**
   * Delete document
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteDocument(jwtToken, collectionId, documentId) {
    const context = {
      methodName: 'deleteDocument',
      collectionId,
      documentId
    };

    return this.executeOperation(async () => {
      const userInfo = await this.validateUser(jwtToken);
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();
      
      const result = await databases.deleteDocument(
        databaseId,
        collectionId,
        documentId
      );

      await this.trackBusinessEvent(TRACKING_EVENTS.DOCUMENT_DELETED, {
        collection_id: collectionId,
        document_id: documentId
      }, userInfo.userId);

      return result;
    }, context, jwtToken);
  }

  /**
   * Delete all user documents in collection
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {Array} additionalQueries - Additional queries
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    const context = {
      methodName: 'deleteUserDocuments',
      collectionId,
      additionalData: { additionalQueriesCount: additionalQueries.length }
    };

    return this.executeOperation(async () => {
      const userInfo = await this.validateUser(jwtToken);
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();

      // Build queries
      const queries = [
        Query.equal('userId', userInfo.userId),
        ...additionalQueries
      ];

      // List documents to delete
      const result = await databases.listDocuments(
        databaseId,
        collectionId,
        queries
      );

      const deletedIds = [];
      const failedIds = [];

      // Delete each document
      for (const doc of result.documents) {
        try {
          await this.executeSingleDeletion(
            databases,
            databaseId,
            collectionId,
            doc.$id
          );
          deletedIds.push(doc.$id);
        } catch (err) {
          failedIds.push({ id: doc.$id, error: err.message });
          console.warn(`Failed to delete document ${doc.$id}: ${err.message}`);
        }
      }

      const deletionResult = {
        deletedCount: deletedIds.length,
        failedCount: failedIds.length,
        totalFound: result.documents.length,
        deletedIds,
        failedIds,
        successRate: result.documents.length > 0 ? 
          (deletedIds.length / result.documents.length) * 100 : 100
      };

      await this.trackBusinessEvent(TRACKING_EVENTS.USER_DOCUMENTS_BULK_DELETED, {
        collection_id: collectionId,
        documents_found: result.documents.length,
        documents_deleted: deletedIds.length,
        documents_failed: failedIds.length,
        deletion_success_rate: deletionResult.successRate
      }, userInfo.userId);

      return deletionResult;
    }, context, jwtToken);
  }

  /**
   * Search documents
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {string} attribute - Attribute to search
   * @param {string} query - Search query
   * @param {Array} additionalQueries - Additional queries
   * @returns {Promise<Object>} - Search results
   */
  async searchDocuments(jwtToken, collectionId, attribute, query, additionalQueries = []) {
    const context = {
      methodName: 'searchDocuments',
      collectionId,
      additionalData: { 
        attribute,
        queryLength: query.length
      }
    };

    return this.executeOperation(async () => {
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();

      const queries = [
        Query.search(attribute, query),
        ...additionalQueries
      ];

      const result = await databases.listDocuments(
        databaseId,
        collectionId,
        queries
      );

      return result;
    }, context, jwtToken);
  }

  /**
   * Get user documents
   * @param {string} jwtToken - JWT token
   * @param {string} collectionId - Collection ID
   * @param {number} limit - Result limit
   * @param {number} offset - Result offset
   * @returns {Promise<Object>} - User documents
   */
  async getUserDocuments(jwtToken, collectionId, limit = 25, offset = 0) {
    const context = {
      methodName: 'getUserDocuments',
      collectionId,
      additionalData: { limit, offset }
    };

    return this.executeOperation(async () => {
      const userInfo = await this.validateUser(jwtToken);
      const databases = await this.clientManager.getDatabases(jwtToken);
      const databaseId = this.getDatabaseId();

      const queries = [
        Query.equal('userId', userInfo.userId),
        Query.limit(limit),
        Query.offset(offset),
        Query.orderDesc('$createdAt')
      ];

      const result = await databases.listDocuments(
        databaseId,
        collectionId,
        queries
      );

      return result;
    }, context, jwtToken);
  }

  // Helper methods

  /**
   * Execute operation with retry and performance tracking
   * @private
   */
  async executeOperation(operation, context, jwtToken) {
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
   * Execute single document deletion with retry
   * @private
   */
  async executeSingleDeletion(databases, databaseId, collectionId, documentId) {
    const operation = () => databases.deleteDocument(
      databaseId,
      collectionId,
      documentId
    );

    if (this.retryManager) {
      return this.retryManager.executeWithRetry(
        operation,
        { methodName: 'deleteDocument_single', documentId }
      );
    }

    return operation();
  }

  /**
   * Validate user from JWT
   * @private
   */
  async validateUser(jwtToken) {
    if (this.jwtValidator) {
      return this.jwtValidator.validateJWT(jwtToken);
    }
    
    // Fallback - just extract user ID from token
    const account = await this.clientManager.getAccount(jwtToken);
    const user = await account.get();
    return { userId: user.$id, ...user };
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
   * Track business event
   * @private
   */
  async trackBusinessEvent(eventName, data, userId) {
    if (!this.postHog) return;
    
    try {
      await this.postHog.trackBusinessEvent(eventName, data, userId);
    } catch (error) {
      this.log('Failed to track business event:', error.message);
    }
  }

  /**
   * Create query builder helper
   * @returns {Object} - Query builder
   */
  static createQueryBuilder() {
    return Query;
  }
}

export default DocumentOperations;