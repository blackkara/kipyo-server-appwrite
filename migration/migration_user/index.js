const fs = require('fs');
const path = require('path');
const jsonFilePath = path.join(__dirname, 'users_custom.json');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const crypto = require('crypto');

const sdk = require('node-appwrite');
const { ID, Permission, Role } = sdk;

// Configuration
const {config} = require('./config');

// Initialize Appwrite client
const client = new sdk.Client();
client.setEndpoint(config.endpoint);
client.setProject(config.project);
client.setKey(config.apiKey);

const database = new sdk.Databases(client);
const users = new sdk.Users(client);

// Gender mapping
const GENDER_MAP = {
  1: 'man',
  2: 'woman',
  default: 'nonBinary'
};

// Migration statistics
const stats = {
  processed: 0,
  successful: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * Convert gender code to string value
 * @param {number} gender - Gender code (1=male, 2=female, other=other)
 * @returns {string} Gender string
 */
function genderCodeToValue(gender) {
  return GENDER_MAP[gender] || GENDER_MAP.default;
}

/**
 * Validate user data
 * @param {Object} userData - User data to validate
 * @returns {Object} Validation result
 */
function validateUserData(userData) {
  const errors = [];
  
  if (!userData.username || userData.username.trim() === '') {
    errors.push('Username is required');
  }
  
  if (!userData.email || !isValidEmail(userData.email)) {
    errors.push('Valid email is required');
  }
  
  if (!userData.birthDate) {
    errors.push('Birth date is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Simple email validation
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Transform user data from JSON to required format
 * @param {Object} rawUser - Raw user data from JSON
 * @returns {Object} Transformed user data
 */
function transformUserData(rawUser) {
  return {
    username: rawUser.username?.trim(),
    email: rawUser.email?.trim().toLowerCase(),
    birthDate: new Date(rawUser.birthDate).toISOString(),
    createDate: new Date(rawUser.createDate).toISOString(),
    gender: genderCodeToValue(rawUser.gender),
    countryCode: rawUser.country?.toLowerCase(),
    city: rawUser.city?.trim(),
    about: rawUser.about?.trim() || '',
    photos: Array.isArray(rawUser.photos) ? rawUser.photos : []
  };
}

/**
 * Create user in Appwrite with retry logic
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user or null if failed
 */
async function createUserWithRetry(userData) {
  const userId = ID.unique();
  const password = crypto.randomBytes(32).toString('hex');
  
  for (let attempt = 1; attempt <= config.retryCount; attempt++) {
    try {
      const appwriteUser = await users.create(
        userId, 
        userData.email, 
        null, 
        password, 
        userData.username
      );
      
      return { ...appwriteUser, userId };
    } catch (error) {
      if (error.name === 'AppwriteException' && error.type === 'user_already_exists') {
        console.log(`User ${userData.email} already exists, skipping...`);
        stats.skipped++;
        return null;
      }
      
      if (attempt === config.retryCount) {
        throw error;
      }
      
      console.log(`Attempt ${attempt} failed for user ${userData.email}, retrying...`);
      await sleep(config.retryDelay * attempt);
    }
  }
}

/**
 * Create profile document with retry logic
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created profile
 */
async function createProfileWithRetry(userData) {
  for (let attempt = 1; attempt <= config.retryCount; attempt++) {
    try {
      return await database.createDocument(
        config.databaseId,
        config.profileCollectionId,
        userData.userId,
        userData,
        [
          Permission.read(Role.any()),
          Permission.write(Role.user(userData.userId)),
        ]
      );
    } catch (error) {
      if (attempt === config.retryCount) {
        throw error;
      }
      
      console.log(`Profile creation attempt ${attempt} failed for user ${userData.email}, retrying...`);
      await sleep(config.retryDelay * attempt);
    }
  }
}

/**
 * Process a single user
 * @param {Object} rawUser - Raw user data from JSON
 * @returns {Promise<boolean>} Success status
 */
async function processUser(rawUser) {
  try {
    // Transform data
    const userData = transformUserData(rawUser);
    
    // Validate data
    const validation = validateUserData(userData);
    if (!validation.isValid) {
      console.error(`Validation failed for user ${userData.email}:`, validation.errors);
      stats.errors.push({
        user: userData.email,
        error: 'Validation failed',
        details: validation.errors
      });
      return false;
    }
    
    // Create user
    const appwriteUser = await createUserWithRetry(userData);
    if (!appwriteUser) {
      return false; // User already exists
    }
    
    // Add userId to userData
    userData.userId = appwriteUser.userId;
    
    // Create profile
    await createProfileWithRetry(userData);
    
    console.log(`✓ Successfully processed user: ${userData.username} (${userData.email})`);
    return true;
    
  } catch (error) {
    console.error(`✗ Error processing user ${rawUser.email}:`, error.message);
    stats.errors.push({
      user: rawUser.email,
      error: error.message,
      details: error
    });
    return false;
  }
}

/**
 * Process users in batches
 * @param {Array} userBatch - Batch of users to process
 * @returns {Promise<void>}
 */
async function processBatch(userBatch) {
  const promises = userBatch.map(user => processUser(user));
  const results = await Promise.allSettled(promises);
  
  results.forEach((result, index) => {
    stats.processed++;
    if (result.status === 'fulfilled' && result.value) {
      stats.successful++;
    } else {
      stats.failed++;
    }
  });
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Print migration statistics
 */
function printStats() {
  console.log('\n=== Migration Statistics ===');
  console.log(`Total processed: ${stats.processed}`);
  console.log(`Successful: ${stats.successful}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Success rate: ${((stats.successful / stats.processed) * 100).toFixed(2)}%`);
  
  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. User: ${error.user}`);
      console.log(`   Error: ${error.error}`);
    });
  }
}

/**
 * Main migration function
 * @returns {Promise<void>}
 */
async function migrate() {
  console.log('Starting migration...');
  const startTime = Date.now();
  
  try {
    // Check if file exists
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error(`JSON file not found: ${jsonFilePath}`);
    }
    
    const jsonStream = fs.createReadStream(jsonFilePath)
      .pipe(parser())
      .pipe(streamArray());
    
    let userBatch = [];
    
    for await (const { value } of jsonStream) {
      userBatch.push(value);
      
      // Process batch when it reaches the batch size
      if (userBatch.length >= config.batchSize) {
        await processBatch(userBatch);
        userBatch = [];
      }
      
      // Check if we've reached the limit
      if (stats.processed >= config.maxUsers) {
        console.log(`Reached maximum user limit (${config.maxUsers})`);
        break;
      }
    }
    
    // Process remaining users
    if (userBatch.length > 0) {
      await processBatch(userBatch);
    }
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nMigration completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

// Export functions for testing
module.exports = {
  migrate,
  genderCodeToValue,
  validateUserData,
  transformUserData,
  config
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrate().catch(console.error);
}