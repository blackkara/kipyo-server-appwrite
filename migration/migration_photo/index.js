const sdk = require('node-appwrite');
const AWS = require('aws-sdk');
const axios = require('axios');
const fs = require('fs');
const { config } = require('./config');


// Initialize Appwrite
const client = new sdk.Client();
client.setEndpoint(config.appwrite.endpoint);
client.setProject(config.appwrite.project);
client.setKey(config.appwrite.apiKey);
const database = new sdk.Databases(client);

// Initialize Digital Ocean Spaces (S3 Compatible)
const spacesEndpoint = new AWS.Endpoint(config.digitalOcean.endpoint);
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: config.digitalOcean.accessKeyId,
  secretAccessKey: config.digitalOcean.secretAccessKey,
  region: config.digitalOcean.region
});

// Migration statistics
const stats = {
  totalUsers: 0,
  totalPhotos: 0,
  processedPhotos: 0,
  successfulPhotos: 0,
  failedPhotos: 0,
  skippedPhotos: 0,
  errors: []
};

/**
 * Log message to console and file
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, error, warning)
 */
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  console.log(logMessage);

  // Append to log file
  fs.appendFileSync(config.logFile, logMessage + '\n');
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download image from old provider
 * @param {string} photoId - Photo ID
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(photoId) {
  const imageUrl = `${config.oldProvider.baseUrl}/${photoId}.${config.oldProvider.format}`;

  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: config.downloadTimeout,
      headers: {
        'User-Agent': 'PhotoMigration/1.0'
      }
    });

    if (response.status === 200) {
      return Buffer.from(response.data);
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Image not found: ${imageUrl}`);
    }
    throw new Error(`Download failed: ${error.message}`);
  }
}

/**
 * Check if photo already exists in Digital Ocean
 * @param {string} photoId - Photo ID
 * @returns {Promise<boolean>} True if exists
 */
async function photoExists(photoId) {
  try {
    const key = `${photoId}.${config.oldProvider.format}`;
    await s3.headObject({
      Bucket: config.digitalOcean.bucketName,
      Key: key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Upload image to Digital Ocean Spaces
 * @param {string} photoId - Photo ID
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<string>} Uploaded image URL
 */
async function uploadToDigitalOcean(photoId, imageBuffer) {
  const key = `${photoId}.${config.oldProvider.format}`;

  // Determine content type
  const contentType = getContentType(config.oldProvider.format);

  const uploadParams = {
    Bucket: config.digitalOcean.bucketName,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
    ACL: 'public-read', // Fotoğraflar herkese açık
    Metadata: {
      'migration-timestamp': new Date().toISOString(),
      'original-id': photoId
    }
  };

  try {
    const result = await s3.upload(uploadParams).promise();
    return result.Location;
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Get content type based on file extension
 * @param {string} format - File format
 * @returns {string} Content type
 */
function getContentType(format) {
  const contentTypes = {
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif'
  };

  return contentTypes[format.toLowerCase()] || 'image/jpeg';
}

/**
 * Process a single photo with retry logic
 * @param {string} photoId - Photo ID
 * @param {string} username - Username for logging
 * @returns {Promise<boolean>} Success status
 */
async function processPhoto(photoId, username) {
  for (let attempt = 1; attempt <= config.retryCount; attempt++) {
    try {
      // Check if photo already exists
      const exists = await photoExists(photoId);
      if (exists) {
        log(`Photo ${photoId} already exists, skipping...`, 'info');
        stats.skippedPhotos++;
        return true;
      }

      // Download from old provider
      log(`Downloading photo ${photoId} for user ${username}...`, 'info');
      const imageBuffer = await downloadImage(photoId);

      // Upload to Digital Ocean
      log(`Uploading photo ${photoId} to Digital Ocean...`, 'info');
      const uploadedUrl = await uploadToDigitalOcean(photoId, imageBuffer);

      log(`✓ Successfully migrated photo ${photoId}: ${uploadedUrl}`, 'info');
      stats.successfulPhotos++;
      return true;

    } catch (error) {
      log(`Attempt ${attempt} failed for photo ${photoId}: ${error.message}`, 'error');

      if (attempt === config.retryCount) {
        stats.errors.push({
          photoId,
          username,
          error: error.message
        });
        stats.failedPhotos++;
        return false;
      }

      // Wait before retry
      await sleep(config.retryDelay * attempt);
    }
  }
}

/**
 * Process photos in batches
 * @param {Array} photoBatch - Batch of photos to process
 * @param {string} username - Username for logging
 * @returns {Promise<void>}
 */
async function processBatch(photoBatch, username) {
  const promises = photoBatch.map(photoId => processPhoto(photoId, username));
  await Promise.allSettled(promises);
}

/**
 * Get all users from Appwrite
 * @returns {Promise<Array>} Array of users
 */
async function getAllUsers() {
  const users = [];
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const response = await database.listDocuments(
        config.appwrite.databaseId,
        config.appwrite.profileCollectionId,
        [
          sdk.Query.limit(limit),
          sdk.Query.offset(offset)
        ]
      );

      users.push(...response.documents);

      if (response.documents.length < limit) {
        break; // No more documents
      }

      offset += limit;
    }

    return users;
  } catch (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
}

/**
 * Print migration statistics
 */
function printStats() {
  console.log('\n=== Photo Migration Statistics ===');
  console.log(`Total users processed: ${stats.totalUsers}`);
  console.log(`Total photos found: ${stats.totalPhotos}`);
  console.log(`Photos processed: ${stats.processedPhotos}`);
  console.log(`Successful migrations: ${stats.successfulPhotos}`);
  console.log(`Failed migrations: ${stats.failedPhotos}`);
  console.log(`Skipped (already exists): ${stats.skippedPhotos}`);
  console.log(`Success rate: ${((stats.successfulPhotos / stats.processedPhotos) * 100).toFixed(2)}%`);

  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. Photo: ${error.photoId} (User: ${error.username})`);
      console.log(`   Error: ${error.error}`);
    });
  }
}

/**
 * Main migration function
 */
async function migratePhotos() {
  const startTime = Date.now();
  log('Starting photo migration...', 'info');

  try {
    // Get all users from Appwrite
    log('Fetching users from Appwrite...', 'info');
    const users = await getAllUsers();
    stats.totalUsers = users.length;

    log(`Found ${users.length} users`, 'info');

    // Process each user's photos
    for (const user of users) {
      if (!user.photos || !Array.isArray(user.photos) || user.photos.length === 0) {
        log(`User ${user.username} has no photos, skipping...`, 'info');
        continue;
      }

      log(`Processing ${user.photos.length} photos for user ${user.username}...`, 'info');
      stats.totalPhotos += user.photos.length;

      // Process photos in batches
      const photoBatches = [];
      for (let i = 0; i < user.photos.length; i += config.batchSize) {
        photoBatches.push(user.photos.slice(i, i + config.batchSize));
      }

      for (const batch of photoBatches) {
        await processBatch(batch, user.username);
        stats.processedPhotos += batch.length;

        // Check if we've reached the limit
        if (stats.processedPhotos >= config.maxPhotos) {
          log(`Reached maximum photo limit (${config.maxPhotos})`, 'info');
          break;
        }
      }

      if (stats.processedPhotos >= config.maxPhotos) {
        break;
      }
    }

  } catch (error) {
    log(`Migration failed: ${error.message}`, 'error');
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    log(`Photo migration completed in ${duration.toFixed(2)} seconds`, 'info');
    printStats();
  }
}

// Export for testing
module.exports = {
  migratePhotos,
  config,
  stats
};

// Run migration if this file is executed directly
if (require.main === module) {
  migratePhotos().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}