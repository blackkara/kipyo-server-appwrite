import { Client, Databases, Account, Query, Permission, Role } from 'node-appwrite';

class AppwriteService {
  // Create client with JWT token or API key
  createClient(auth) {
    if (!auth) {
      throw new Error('Authentication is required (JWT token or API key)');
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_END_POINT)
      .setProject(process.env.APPWRITE_PROJECT_ID);

    // Check if it's a JWT token or API key
    if (this.isJWTToken(auth)) {
      client.setJWT(auth);
    } else {
      // Assume it's an API key
      client.setKey(auth);
    }

    return client;
  }

  // Check if the provided auth is a JWT token
  isJWTToken(auth) {
    // JWT tokens have 3 parts separated by dots
    const parts = auth.split('.');
    return parts.length === 3;
  }

  // Get databases instance with authentication
  getDatabases(auth) {
    const client = this.createClient(auth);
    return new Databases(client);
  }

  // Get account instance with authentication
  getAccount(auth) {
    const client = this.createClient(auth);
    return new Account(client);
  }

  // Validate JWT token by getting user account info
  async validateJWT(jwtToken) {
    try {
      const account = this.getAccount(jwtToken);
      // Try to get current user - this will fail if JWT is invalid
      const user = await account.get();
      return user; // Return user info for potential use
    } catch (error) {
      throw new Error(`JWT validation failed: ${error.message}`);
    }
  }

  // Get user ID from JWT without making API call
  getUserIdFromJWT(jwtToken) {
    try {
      const parts = jwtToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }

      const payload = parts[1];
      const paddedPayload = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, '=');
      const decodedPayload = Buffer.from(paddedPayload, 'base64').toString('utf8');
      const payloadObj = JSON.parse(decodedPayload);

      const userId = payloadObj.userId || payloadObj.sub;
      if (!userId) {
        throw new Error('User ID not found in JWT token');
      }

      return userId;
    } catch (error) {
      throw new Error(`Failed to decode JWT token: ${error.message}`);
    }
  }

  // Create document with admin privileges and flexible permissions
  async createDocumentWithAdminPrivileges(jwtToken, collectionId, documentId, data, additionalUsers = []) {
    // Step 1: Validate the JWT token and get user info
    const userInfo = await this.validateJWT(jwtToken);

    // Step 2: Extract user ID (we can use either JWT decode or the validated user info)
    const requestingUserId = userInfo.$id; // Use validated user ID from API response

    // Step 3: Create permissions for the requesting user (full permissions)
    const permissions = [
      Permission.read(Role.user(requestingUserId)),
      Permission.update(Role.user(requestingUserId)),
      Permission.delete(Role.user(requestingUserId)),
    ];

    // Step 4: Add permissions for additional users with custom permission levels
    additionalUsers.forEach(userPermission => {
      const { userId, permissions: userPermissions } = userPermission;

      // Default permissions if not specified
      const defaultPermissions = ['read'];
      const perms = userPermissions || defaultPermissions;

      perms.forEach(perm => {
        switch (perm) {
          case 'read':
            permissions.push(Permission.read(Role.user(userId)));
            break;
          case 'update':
            permissions.push(Permission.update(Role.user(userId)));
            break;
          case 'delete':
            permissions.push(Permission.delete(Role.user(userId)));
            break;
          default:
            console.warn(`Unknown permission: ${perm}`);
        }
      });
    });

    // Step 5: Use admin client to create the document
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);

    return await adminDatabases.createDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId,
      data,
      permissions
    );
  }


  async updateDocumentWithAdminPrivileges(jwtToken, collectionId, documentId, data) {
    // Step 1: Validate the JWT token and get user info
    const userInfo = await this.validateJWT(jwtToken);

    // Step 2: Extract user ID (we can use either JWT decode or the validated user info)
    const requestingUserId = userInfo.$id; // Use validated user ID from API response

    // Step 3: Create permissions for the requesting user (full permissions)
    // const permissions = [
    //   Permission.read(Role.user(requestingUserId)),
    //   Permission.update(Role.user(requestingUserId)),
    //   Permission.delete(Role.user(requestingUserId)),
    // ];

    // // Step 4: Add permissions for additional users with custom permission levels
    // additionalUsers.forEach(userPermission => {
    //   const { userId, permissions: userPermissions } = userPermission;

    //   // Default permissions if not specified
    //   const defaultPermissions = ['read'];
    //   const perms = userPermissions || defaultPermissions;

    //   perms.forEach(perm => {
    //     switch (perm) {
    //       case 'read':
    //         permissions.push(Permission.read(Role.user(userId)));
    //         break;
    //       case 'update':
    //         permissions.push(Permission.update(Role.user(userId)));
    //         break;
    //       case 'delete':
    //         permissions.push(Permission.delete(Role.user(userId)));
    //         break;
    //       default:
    //         console.warn(`Unknown permission: ${perm}`);
    //     }
    //   });
    // });

    // Step 5: Use admin client to update the document
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);

    return await adminDatabases.updateDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId,
      data
    );
  }


  // Convenience method for updating message-like documents (sender has full access, receiver has read-only)
  async updateMessageDocument(jwtToken, collectionId, documentId, data, receiverUserId) {
    return await this.updateDocumentWithAdminPrivileges(
      jwtToken,
      collectionId,
      documentId,
      data,
      [
        {
          userId: receiverUserId,
          permissions: ['read'] // Receiver can only read
        }
      ]
    );
  }

  // Convenience method for updating shared documents (both users can read and update)
  async updateSharedDocument(jwtToken, collectionId, documentId, data, collaboratorUserId) {
    return await this.updateDocumentWithAdminPrivileges(
      jwtToken,
      collectionId,
      documentId,
      data,
      [
        {
          userId: collaboratorUserId,
          permissions: ['read', 'update'] // Collaborator can read and update
        }
      ]
    );
  }

  // Convenience method for message-like documents (sender has full access, receiver has read-only)
  async createMessageDocument(jwtToken, collectionId, documentId, data, receiverUserId) {
    return await this.createDocumentWithAdminPrivileges(
      jwtToken,
      collectionId,
      documentId,
      data,
      [
        {
          userId: receiverUserId,
          permissions: ['read'] // Receiver can only read
        }
      ]
    );
  }

  // Convenience method for shared documents (both users can read and update)
  async createSharedDocument(jwtToken, collectionId, documentId, data, collaboratorUserId) {
    return await this.createDocumentWithAdminPrivileges(
      jwtToken,
      collectionId,
      documentId,
      data,
      [
        {
          userId: collaboratorUserId,
          permissions: ['read', 'update'] // Collaborator can read and update
        }
      ]
    );
  }

  // Alternative approach: Validate JWT, then perform admin operation
  async validateJWTAndExecuteAsAdmin(jwtToken, adminOperation) {
    // Validate JWT first and get user info
    const userInfo = await this.validateJWT(jwtToken);

    // Extract user info for use in admin operation
    const requestingUserId = userInfo.$id;

    // Execute admin operation with dev key
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);

    return await adminOperation(adminDatabases, requestingUserId, userInfo);
  }

  // Enhanced version that returns both decoded JWT and validated user info
  async validateJWTEnhanced(jwtToken) {
    // First validate with API call
    const userInfo = await this.validateJWT(jwtToken);

    // Also decode JWT for additional info if needed
    const decodedUserId = this.getUserIdFromJWT(jwtToken);

    // Cross-check user IDs for extra security
    if (userInfo.$id !== decodedUserId) {
      throw new Error('JWT user ID mismatch - possible token tampering');
    }

    return {
      userInfo,
      decodedUserId,
      isValid: true
    };
  }

  // Regular user operations (using their JWT)
  async listDocuments(auth, collectionId, queries = []) {
    const databases = this.getDatabases(auth);
    return await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      collectionId,
      queries
    );
  }

  async getDocument(auth, collectionId, documentId) {
    const databases = this.getDatabases(auth);
    return await databases.getDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId
    );
  }

  // Admin operations (using dev key)
  async createDocument(auth, collectionId, documentId, data, permissions = []) {
    const databases = this.getDatabases(auth);
    return await databases.createDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId,
      data,
      permissions
    );
  }

  async updateDocument(auth, collectionId, documentId, data, permissions = []) {
    const databases = this.getDatabases(auth);
    return await databases.updateDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId,
      data,
      permissions
    );
  }

  async deleteDocument(auth, collectionId, documentId) {
    const databases = this.getDatabases(auth);
    return await databases.deleteDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId
    );
  }

  async deleteDocumentWithAdminPrivileges(collectionId, documentId) {
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);
    return await adminDatabases.deleteDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId
    );
  }

  // Bulk delete documents with JWT validation and admin privileges
  // Bulk delete documents (using auth token - can be JWT or API key)
  async deleteDocuments(auth, collectionId, queries = []) {
    const databases = this.getDatabases(auth);
    return await databases.deleteDocuments(
      process.env.APPWRITE_DB_ID,
      collectionId,
      queries
    );
  }

  // Convenience method for deleting user's own documents
  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    // Get user ID from JWT
    const userInfo = await this.validateJWT(jwtToken);
    const userId = userInfo.$id;

    // Add user filter to queries
    const queries = [
      Query.equal('userId', userId), // Assuming documents have a userId field
      ...additionalQueries
    ];

    return await this.deleteDocuments(jwtToken, collectionId, queries);
  }

  // Convenience method for deleting documents by status (e.g., archived, deleted)
  async deleteDocumentsByStatus(jwtToken, collectionId, status, additionalQueries = []) {
    const queries = [
      Query.equal('status', status),
      ...additionalQueries
    ];

    return await this.deleteDocuments(jwtToken, collectionId, queries);
  }

  // Convenience method for deleting old documents (older than specified date)
  async deleteOldDocuments(jwtToken, collectionId, olderThanDate, additionalQueries = []) {
    const queries = [
      Query.lessThan('$createdAt', olderThanDate.toISOString()),
      ...additionalQueries
    ];

    return await this.deleteDocuments(jwtToken, collectionId, queries);
  }

  async deleteDocumentsWithAdminPrivileges(jwtToken, collectionId, queries = []) {
    // Step 1: Validate the JWT token and get user info
    const userInfo = await this.validateJWT(jwtToken);

      // Step 2: Extract user ID (we can use either JWT decode or the validated user info)
    const requestingUserId = userInfo.$id; // Use validated user ID from API response

    const databases = this.getDatabases(process.env.APPWRITE_DEV_KEY);

    return await databases.deleteDocuments(
      process.env.APPWRITE_DB_ID,
      collectionId,
      queries
    );
  }

  // Helper methods for common queries
  static createQuery() {
    return Query;
  }

  static createPermission() {
    return Permission;
  }

  static createRole() {
    return Role;
  }
}

export default AppwriteService;

// Helper function to extract JWT token from request headers
export function extractJWTFromHeaders(headers) {
  const authHeader = headers.authorization || headers.Authorization;

  if (!authHeader) {
    throw new Error('Authorization header is missing');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format. Expected: Bearer <token>');
  }

  return authHeader.substring(7); // Remove 'Bearer ' prefix
}
