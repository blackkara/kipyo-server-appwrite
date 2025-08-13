// src/services/appwrite/core/ClientManager.js

import { Client, Databases, Account } from 'node-appwrite';

/**
 * Manages Appwrite client creation and lifecycle
 */
export class ClientManager {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.cache = dependencies.clientCache;
    this.config = dependencies.configManager;
    this.connectionManager = dependencies.connectionManager;
    
    // Admin client singleton
    this.adminClient = null;
    this.adminDatabases = null;
  }

  /**
   * Create or get client from cache
   * @param {string} auth - JWT token or API key
   * @returns {Promise<Client>} - Appwrite client
   */
  async getClient(auth) {
    const context = { methodName: 'getClient' };

    try {
      if (!auth) {
        throw new Error('Authentication is required (JWT token or API key)');
      }

      // Check cache first
      if (this.cache) {
        const cached = this.cache.get(auth);
        if (cached) {
          this.log('Client retrieved from cache');
          return cached.client;
        }
      }

      // Create new client
      const client = await this.createClient(auth);
      
      // Cache the client
      if (this.cache) {
        await this.cache.add(auth, {
          client,
          databases: new Databases(client),
          account: new Account(client),
          createdAt: Date.now()
        });
      }

      return client;

    } catch (error) {
      this.log('Failed to get client:', error.message);
      throw error;
    }
  }

  /**
   * Create new Appwrite client
   * @private
   */
  createClient(auth) {
    const endpoint = this.config ? 
      this.config.get('appwrite.endpoint') : 
      process.env.APPWRITE_END_POINT;
      
    const projectId = this.config ? 
      this.config.get('appwrite.projectId') : 
      process.env.APPWRITE_PROJECT_ID;

    if (!endpoint || !projectId) {
      throw new Error('Appwrite configuration is missing');
    }

    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId);

    // Set authentication
    if (this.isJWTToken(auth)) {
      client.setJWT(auth);
    } else {
      client.setKey(auth);
    }

    // Update connection manager endpoint
    if (this.connectionManager) {
      this.connectionManager.setEndpoint(endpoint);
    }

    this.log('New Appwrite client created');
    return client;
  }

  /**
   * Get Databases instance for auth
   * @param {string} auth - JWT token or API key
   * @returns {Promise<Databases>} - Databases instance
   */
  async getDatabases(auth) {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(auth);
      if (cached && cached.databases) {
        return cached.databases;
      }
    }

    // Create new client and databases
    const client = await this.getClient(auth);
    return new Databases(client);
  }

  /**
   * Get Account instance for auth
   * @param {string} auth - JWT token or API key
   * @returns {Promise<Account>} - Account instance
   */
  async getAccount(auth) {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(auth);
      if (cached && cached.account) {
        return cached.account;
      }
    }

    // Create new client and account
    const client = await this.getClient(auth);
    return new Account(client);
  }

  /**
   * Get admin client instance
   * @returns {Client} - Admin client instance
   */
  getAdminClient() {
    const context = { methodName: 'getAdminClient' };

    try {
      const apiKey = this.config ? 
        this.config.get('appwrite.apiKey') : 
        process.env.APPWRITE_DEV_KEY;

      if (!apiKey) {
        throw new Error('APPWRITE_DEV_KEY is not configured');
      }

      // Admin client singleton pattern
      if (!this.adminClient) {
        const endpoint = this.config ? 
          this.config.get('appwrite.endpoint') : 
          process.env.APPWRITE_END_POINT;
          
        const projectId = this.config ? 
          this.config.get('appwrite.projectId') : 
          process.env.APPWRITE_PROJECT_ID;

        this.adminClient = new Client()
          .setEndpoint(endpoint)
          .setProject(projectId)
          .setKey(apiKey);
        
        this.log('Admin client created');
      }

      return this.adminClient;
    } catch (error) {
      this.log('Failed to get admin client:', error.message);
      throw error;
    }
  }

  /**
   * Get admin Databases instance
   * @returns {Databases} - Admin databases instance
   */
  getAdminDatabases() {
    const context = { methodName: 'getAdminDatabases' };

    try {
      const apiKey = this.config ? 
        this.config.get('appwrite.apiKey') : 
        process.env.APPWRITE_DEV_KEY;

      if (!apiKey) {
        throw new Error('APPWRITE_DEV_KEY is not configured');
      }

      // Check if adminDatabases already exists and return it
      if (this.adminDatabases) {
        return this.adminDatabases;
      }

      // If not, create admin client if needed
      if (!this.adminClient) {
        const endpoint = this.config ? 
          this.config.get('appwrite.endpoint') : 
          process.env.APPWRITE_END_POINT;
          
        const projectId = this.config ? 
          this.config.get('appwrite.projectId') : 
          process.env.APPWRITE_PROJECT_ID;

        this.adminClient = new Client()
          .setEndpoint(endpoint)
          .setProject(projectId)
          .setKey(apiKey);
        
        this.log('Admin client created');
      }
      
      // Now create adminDatabases
      this.adminDatabases = new Databases(this.adminClient);
      this.log('Admin databases instance created');

      return this.adminDatabases;
    } catch (error) {
      this.log('Failed to get admin databases:', error.message);
      throw error;
    }
  }

  /**
   * Check if auth is a JWT token
   * @param {string} auth - Authentication string
   * @returns {boolean} - Whether auth is JWT
   */
  isJWTToken(auth) {
    return auth && typeof auth === 'string' && auth.split('.').length === 3;
  }

  /**
   * Test client connection
   * @param {string} auth - Authentication to test
   * @returns {Promise<Object>} - Test result
   */
  async testClientConnection(auth) {
    try {
      const account = await this.getAccount(auth);
      const user = await account.get();
      
      return {
        success: true,
        userId: user.$id,
        email: user.email,
        message: 'Connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * Test admin connection
   * @returns {Promise<Object>} - Test result
   */
  async testAdminConnection() {
    try {
      const databases = this.getAdminDatabases();
      await databases.list();
      
      return {
        success: true,
        message: 'Admin connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * Clear client cache
   */
  clearCache() {
    if (this.cache) {
      const cleared = this.cache.clear();
      this.log(`Cleared ${cleared} cached clients`);
      return cleared;
    }
    return 0;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    if (this.cache) {
      return this.cache.getStats();
    }
    return null;
  }

  /**
   * Destroy manager and cleanup
   */
  async destroy() {
    // Clear admin client
    this.adminClient = null;
    this.adminDatabases = null;
    
    // Clear cache
    this.clearCache();
    
    this.log('Client manager destroyed');
  }
}

export default ClientManager;