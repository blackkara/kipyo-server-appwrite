import { Client, Databases, Account, Query, Permission, Role } from 'node-appwrite';

class OptimizedAppwriteService {
  // Create client with JWT token or API key
  createClient(auth) {
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
  }

  isJWTToken(auth) {
    const parts = auth.split('.');
    return parts.length === 3;
  }

  getDatabases(auth) {
    const client = this.createClient(auth);
    return new Databases(client);
  }

  getAccount(auth) {
    const client = this.createClient(auth);
    return new Account(client);
  }

  async validateJWT(jwtToken) {
    try {
      const account = this.getAccount(jwtToken);
      const user = await account.get();
      return user;
    } catch (error) {
      throw new Error(`JWT validation failed: ${error.message}`);
    }
  }

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

    async validateAndExtractUser(headers, requestId, log) {
    try {
      const jwtToken = extractJWTFromHeaders(headers);
      if (!jwtToken) {
        throw new Error('JWT token not found in headers');
      }

    

      // TEK SEFERDE HEM VALİDE ET HEM USER INFO AL
      const userInfo = await this.validateJWT(jwtToken);

      if (!userInfo || !userInfo.$id) {
        throw new Error('Failed to extract user info from JWT');
      }

      log(`[${requestId}] JWT validation successful for user: ${userInfo.$id}`);

      return { jwtToken, userInfo };

    } catch (tokenError) {
      log(`[${requestId}] JWT validation failed: ${tokenError.message}`);
      throw new Error(tokenError.message);
    }
  }


  // ✅ READ: Normal client yeterli (zaten güvenli)
  async listDocuments(jwtToken, collectionId, queries = []) {
    //await this.validateJWT(jwtToken);
    const databases = this.getDatabases(jwtToken);
    return await databases.listDocuments(
      process.env.APPWRITE_DB_ID,
      collectionId,
      queries
    );
  }


  // ✅ CREATE: Admin privileges gerekli (collection-level permission yok)
  async createDocumentWithAdminPrivileges(requestingUserId, collectionId, documentId, data, additionalUsers = []) {

    const permissions = [
      Permission.read(Role.user(requestingUserId)),
      Permission.update(Role.user(requestingUserId)),
      Permission.delete(Role.user(requestingUserId)),
      Permission.write(Role.user(requestingUserId)),
    ];

    additionalUsers.forEach(userPermission => {
      const { userId, permissions: userPermissions } = userPermission;
      const defaultPermissions = ['read'];
      const perms = userPermissions || defaultPermissions;

      perms.forEach(perm => {
        switch (perm) {
          case 'write':
            permissions.push(Permission.write(Role.user(userId)));
            break;
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

    // Admin ile oluştur (çünkü collection-level create permission yok)
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);
    return await adminDatabases.createDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId,
      data,
      permissions
    );
  }

  // ✅ UPDATE: Normal client yeterli (document-level permission kontrol eder)
  async updateDocument(jwtToken, collectionId, documentId, data) {
    await this.validateJWT(jwtToken); // JWT doğrulama

    // Normal client kullan - Appwrite permission sistemi kontrol edecek
    const userDatabases = this.getDatabases(jwtToken);

    try {
      return await userDatabases.updateDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId,
        data
      );
    } catch (error) {
      // Appwrite'ın kendi permission hatası
      throw new Error(`Update failed: ${error.message}`);
    }
  }

  // ✅ DELETE: Normal client yeterli (document-level permission kontrol eder)
  async deleteDocument(jwtToken, collectionId, documentId) {
    await this.validateJWT(jwtToken); // JWT doğrulama

    // Normal client kullan - Appwrite permission sistemi kontrol edecek
    const userDatabases = this.getDatabases(jwtToken);

    try {
      return await userDatabases.deleteDocument(
        process.env.APPWRITE_DB_ID,
        collectionId,
        documentId
      );
    } catch (error) {
      // Appwrite'ın kendi permission hatası
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  // ✅ BULK DELETE: Normal client + user filtresi (güvenlik için)
  async deleteUserDocuments(jwtToken, collectionId, additionalQueries = []) {
    const userInfo = await this.validateJWT(jwtToken);
    const userId = userInfo.$id;

    // Kullanıcının kendi dökümanlarını filtrele (ekstra güvenlik)
    const queries = [
      Query.equal('userId', userId), // Sadece kendi dökümanları
      ...additionalQueries
    ];

    const userDatabases = this.getDatabases(jwtToken);

    try {
      // Önce listele
      const result = await userDatabases.listDocuments(
        process.env.APPWRITE_DB_ID,
        collectionId,
        queries
      );

      // Her birini tek tek sil (better error handling)
      const deletedIds = [];
      for (const doc of result.documents) {
        try {
          await userDatabases.deleteDocument(
            process.env.APPWRITE_DB_ID,
            collectionId,
            doc.$id
          );
          deletedIds.push(doc.$id);
        } catch (deleteError) {
          console.warn(`Failed to delete document ${doc.$id}:`, deleteError.message);
        }
      }

      return {
        deletedCount: deletedIds.length,
        totalFound: result.documents.length,
        deletedIds
      };
    } catch (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  }

  async getDocument(jwtToken, collectionId, documentId) {
    await this.validateJWT(jwtToken);
    const databases = this.getDatabases(jwtToken);
    return await databases.getDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId
    );
  }

  // 🎯 Convenience methods - Yaygın kullanım senaryoları

  // userA → userB'ye mesaj (userB sadece okuyabilir)
  async createMessageDocument(jwtToken, collectionId, documentId, data, receiverUserId) {
    return await this.createDocumentWithAdminPrivileges(
      jwtToken,
      collectionId,
      documentId,
      { ...data, receiverUserId }, // Metadata ekle
      [{ userId: receiverUserId, permissions: ['read'] }]
    );
  }

  // userA ↔ userB paylaşımlı döküman (ikisi de okuyup yazabilir)
  async createSharedDocument(jwtToken, collectionId, documentId, data, collaboratorUserId) {
    return await this.createDocumentWithAdminPrivileges(
      jwtToken,
      collectionId,
      documentId,
      { ...data, collaboratorUserId }, // Metadata ekle
      [{ userId: collaboratorUserId, permissions: ['read', 'update', 'delete'] }]
    );
  }

  // Mesaj güncelleme (sadece gönderen güncelleyebilir)
  async updateMessageDocument(jwtToken, collectionId, documentId, data) {
    return await this.updateDocument(jwtToken, collectionId, documentId, data);
  }

  // Paylaşımlı döküman güncelleme (her iki taraf da güncelleyebilir)  
  async updateSharedDocument(jwtToken, collectionId, documentId, data) {
    return await this.updateDocument(jwtToken, collectionId, documentId, data);
  }

  // Mesaj silme (gönderen veya alıcı silebilir - permission varsa)
  async deleteMessageDocument(jwtToken, collectionId, documentId) {
    return await this.deleteDocument(jwtToken, collectionId, documentId);
  }

  // Paylaşımlı döküman silme (her iki taraf da silebilir)
  async deleteSharedDocument(jwtToken, collectionId, documentId) {
    return await this.deleteDocument(jwtToken, collectionId, documentId);
  }

  // 📊 Advanced operations

  // Kullanıcının tüm mesajlarını sil (gönderdiği + aldığı)
  async deleteAllUserMessages(jwtToken, messagesCollectionId) {
    const userInfo = await this.validateJWT(jwtToken);
    const userId = userInfo.$id;

    // Gönderdiği mesajları sil
    const sentResults = await this.deleteUserDocuments(jwtToken, messagesCollectionId, [
      Query.equal('senderId', userId)
    ]);

    // Aldığı mesajları sil (permission varsa silebilir)
    const userDatabases = this.getDatabases(jwtToken);
    const receivedMessages = await userDatabases.listDocuments(
      process.env.APPWRITE_DB_ID,
      messagesCollectionId,
      [Query.equal('receiverUserId', userId)]
    );

    let receivedDeleted = 0;
    for (const msg of receivedMessages.documents) {
      try {
        await this.deleteDocument(jwtToken, messagesCollectionId, msg.$id);
        receivedDeleted++;
      } catch (error) {
        console.warn(`Cannot delete received message ${msg.$id}: ${error.message}`);
      }
    }

    return {
      sentDeleted: sentResults.deletedCount,
      receivedDeleted,
      total: sentResults.deletedCount + receivedDeleted
    };
  }

  async deleteDocumentWithAdminPrivileges(collectionId, documentId) {
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);
    return await adminDatabases.deleteDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId
    );
  }

  async updateDocumentWithAdminPrivileges(requestingUserId, collectionId, documentId, data, additionalUsers = []) {

    const permissions = [
      Permission.read(Role.user(requestingUserId)),
      Permission.update(Role.user(requestingUserId)),
      Permission.delete(Role.user(requestingUserId)),
      Permission.write(Role.user(requestingUserId)),
    ];

    additionalUsers.forEach(userPermission => {
      const { userId, permissions: userPermissions } = userPermission;
      const defaultPermissions = ['read'];
      const perms = userPermissions || defaultPermissions;

      perms.forEach(perm => {
        switch (perm) {
          case 'write':
            permissions.push(Permission.write(Role.user(userId)));
            break;
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

    // Admin ile oluştur (çünkü collection-level create permission yok)
    const adminDatabases = this.getDatabases(process.env.APPWRITE_DEV_KEY);
    return await adminDatabases.updateDocument(
      process.env.APPWRITE_DB_ID,
      collectionId,
      documentId,
      data,
      permissions
    );
  }

  // Helper methods
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

export default OptimizedAppwriteService;

// Helper function to extract JWT token from request headers
export function extractJWTFromHeaders(headers) {
  const authHeader = headers.authorization || headers.Authorization;

  if (!authHeader) {
    throw new Error('Authorization header is missing');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid authorization header format. Expected: Bearer <token>');
  }

  return authHeader.substring(7);
}