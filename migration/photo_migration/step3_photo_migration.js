const fs = require('fs');
const path = require('path');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const axios = require('axios');
const AWS = require('aws-sdk');

const sdk = require('node-appwrite');
const { ID, Permission, Role, Query } = sdk;

// Configuration
const { config } = require('../config');

// File paths
const mergedFilePath = path.join(__dirname, '..', 'merged.json');

// Initialize Appwrite client
const client = new sdk.Client();
client.setEndpoint(config.endpoint);
client.setProject(config.project);
client.setKey(config.apiKey);

const database = new sdk.Databases(client);

// Photo Migration Configuration from config file
const photoConfig = config.photoMigration;

// Initialize Digital Ocean Spaces (S3 Compatible)
let s3 = null;
if (photoConfig.digitalOcean.endpoint && photoConfig.digitalOcean.accessKeyId) {
  const spacesEndpoint = new AWS.Endpoint(photoConfig.digitalOcean.endpoint);
  s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    accessKeyId: photoConfig.digitalOcean.accessKeyId,
    secretAccessKey: photoConfig.digitalOcean.secretAccessKey,
    region: photoConfig.digitalOcean.region
  });
  console.log('✅ DigitalOcean Spaces configured successfully');
} else {
  console.warn('⚠️  DigitalOcean configuration incomplete - upload functionality will be mocked');
}

// Statistics
const stats = {
  usersProcessed: 0,
  usersWithPhotos: 0,
  totalPhotos: 0,
  photosDownloaded: 0,
  photosUploaded: 0,
  profileMediaCreated: 0,
  photosFailed: 0,
  errors: []
};

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download image from ConnectyCube blob API
 * @param {string} photoId - ConnectyCube blob UID
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadPhoto(photoId) {
  const imageUrl = `${photoConfig.oldSystemBaseUrl}/${photoId}/download`;
  
  try {
    console.log(`📥 Downloading ConnectyCube blob: ${photoId}`);
    
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: photoConfig.downloadTimeout,
      headers: {
        'User-Agent': 'PhotoMigration/1.0'
      },
      maxRedirects: 5 // ConnectyCube may redirect to actual file
    });

    if (response.status === 200) {
      stats.photosDownloaded++;
      console.log(`✅ Downloaded blob ${photoId} (${response.data.length} bytes)`);
      return Buffer.from(response.data);
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`ConnectyCube blob not found: ${photoId}`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Access denied for blob: ${photoId}`);
    }
    throw new Error(`Download failed for blob ${photoId}: ${error.message}`);
  }
}

/**
 * Detect content type from image buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Object} {contentType, extension}
 */
function detectImageFormat(buffer) {
  // Check magic bytes to detect format
  const firstBytes = buffer.slice(0, 12);
  
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xD8 && firstBytes[2] === 0xFF) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (firstBytes.toString('ascii', 0, 6) === 'GIF87a' || firstBytes.toString('ascii', 0, 6) === 'GIF89a') {
    return { contentType: 'image/gif', extension: 'gif' };
  }
  if (firstBytes.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  
  // Default to JPEG if unknown
  return { contentType: 'image/jpeg', extension: 'jpg' };
}

/**
 * Get content type based on file extension (fallback)
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
 * Check if photo already exists in DigitalOcean Spaces
 * @param {string} photoId - Photo ID
 * @returns {Promise<boolean>} True if exists
 */
async function photoExists(photoId) {
  if (!s3) return false;
  
  // Check for multiple possible extensions
  const possibleExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  
  for (const ext of possibleExtensions) {
    try {
      const key = `${photoId}.${ext}`;
      await s3.headObject({
        Bucket: photoConfig.digitalOcean.bucketName,
        Key: key
      }).promise();
      console.log(`📁 Found existing photo: ${key}`);
      return true;
    } catch (error) {
      if (error.code !== 'NotFound') {
        throw error;
      }
      // Continue checking other extensions
    }
  }
  
  return false;
}

/**
 * Upload image to DigitalOcean Spaces
 * @param {string} photoId - Photo ID
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<string>} Uploaded image URL
 */
async function uploadToDigitalOcean(photoId, imageBuffer) {
  console.log(`📤 Uploading: ${photoId} (${imageBuffer.length} bytes)`);
  
  // Auto-detect image format from buffer
  const { contentType, extension } = detectImageFormat(imageBuffer);
  console.log(`🔍 Detected format: ${extension} (${contentType})`);
  
  if (!s3) {
    // Mock upload for testing
    await sleep(500);
    const uploadedUrl = `${photoConfig.digitalOcean.baseUrl}/${photoId}.${extension}`;
    stats.photosUploaded++;
    console.log(`🧪 Mock upload: ${uploadedUrl}`);
    return uploadedUrl;
  }
  
  const key = `${photoId}.${extension}`;
  
  const uploadParams = {
    Bucket: photoConfig.digitalOcean.bucketName,
    Key: key,
    Body: imageBuffer,
    ContentType: contentType,
    ACL: 'public-read',
    Metadata: {
      'migration-timestamp': new Date().toISOString(),
      'original-blob-uid': photoId,
      'detected-format': extension
    }
  };
  
  try {
    const result = await s3.upload(uploadParams).promise();
    stats.photosUploaded++;
    
    // Fix: AWS result.Location format is inconsistent, construct proper URL
    const properUrl = `${photoConfig.digitalOcean.baseUrl}/${key}`;
    console.log(`✅ Uploaded to: ${properUrl}`);
    return properUrl;
  } catch (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Find profile document by userId
 * @param {string} userId - User ID from Appwrite
 * @returns {Promise<string|null>} Profile document ID or null if not found
 */
async function findProfileId(userId) {
  try {
    const profiles = await database.listDocuments(
      config.databaseId,
      config.profileCollectionId,
      [
        Query.equal('userId', userId),
        Query.limit(1)
      ]
    );

    if (profiles.documents.length > 0) {
      return profiles.documents[0].$id;
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to find profile for user ${userId}:`, error.message);
    return null;
  }
}

/**
 * Create profile_media record in Appwrite
 * @param {string} userId - User ID from Appwrite
 * @param {string} photoUrl - Photo URL from DigitalOcean
 * @param {number} displayOrder - Display order (1-based)
 * @returns {Promise<Object>} Created profile_media document
 */
async function createProfileMediaRecord(userId, photoUrl, displayOrder) {
  try {
    // Find profile reference
    const profileId = await findProfileId(userId);
    if (!profileId) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    const mediaData = {
      userId: userId,
      mediaType: 'PHOTO',
      url: photoUrl,
      displayOrder: displayOrder,
      isActive: true,
      // thumbnailUrl: null - Thumbnail automation için boş bırakıyoruz
      profile: profileId // Profile referansı eklendi
    };

    const profileMedia = await database.createDocument(
      config.databaseId,
      photoConfig.profileMediaCollectionId,
      ID.unique(),
      mediaData,
      [
        Permission.read(Role.any()),
        Permission.write(Role.user(userId)),
      ]
    );

    stats.profileMediaCreated++;
    console.log(`📋 Created profile_media: ${profileMedia.$id} for user ${userId} (profile: ${profileId})`);
    
    return profileMedia;
  } catch (error) {
    throw new Error(`Failed to create profile_media: ${error.message}`);
  }
}

/**
 * Process a single photo with retry logic
 * @param {string} photoId - Photo ID
 * @param {string} userId - User ID
 * @param {number} displayOrder - Display order
 * @returns {Promise<boolean>} Success status
 */
async function processPhoto(photoId, userId, displayOrder) {
  for (let attempt = 1; attempt <= photoConfig.retryCount; attempt++) {
    try {
      // Check if photo already exists (skip if it does)
      const exists = await photoExists(photoId);
      if (exists) {
        console.log(`⏭️  Photo ${photoId} already exists, skipping...`);
        stats.photosUploaded++; // Count as uploaded since it exists
        
        // Still create profile_media record if it doesn't exist
        const existingUrl = `${photoConfig.digitalOcean.baseUrl}/${photoId}.${photoConfig.imageFormat}`;
        await createProfileMediaRecord(userId, existingUrl, displayOrder);
        
        console.log(`✅ Used existing photo: ${photoId} → ${existingUrl}`);
        return true;
      }
      
      // Download from old system
      const imageBuffer = await downloadPhoto(photoId);
      
      // Upload to DigitalOcean
      const uploadedUrl = await uploadToDigitalOcean(photoId, imageBuffer);
      
      // Create profile_media record
      await createProfileMediaRecord(userId, uploadedUrl, displayOrder);
      
      console.log(`✅ Successfully migrated photo: ${photoId} → ${uploadedUrl}`);
      return true;

    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed for photo ${photoId}: ${error.message}`);
      
      if (attempt === photoConfig.retryCount) {
        stats.errors.push({
          photoId,
          userId,
          error: error.message,
          displayOrder
        });
        stats.photosFailed++;
        return false;
      }
      
      // Wait before retry
      await sleep(photoConfig.retryDelay * attempt);
    }
  }
}

/**
 * Process photos for a single user
 * @param {Object} user - User data from merged.json
 * @param {string} appwriteUserId - User ID from Appwrite
 * @returns {Promise<void>}
 */
async function processUserPhotos(user, appwriteUserId) {
  const photos = user.profile?.photos;
  
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    console.log(`👤 User ${user.profile?.username || user.user.login} has no photos`);
    return;
  }

  stats.usersWithPhotos++;
  stats.totalPhotos += photos.length;
  
  console.log(`📸 Processing ${photos.length} photos for user ${user.profile?.username || user.user.login}...`);

  // Process photos in batches
  for (let i = 0; i < photos.length; i += photoConfig.batchSize) {
    const batch = photos.slice(i, i + photoConfig.batchSize);
    
    // Process batch concurrently
    const promises = batch.map((photoId, batchIndex) => {
      const displayOrder = i + batchIndex + 1; // 1-based display order
      return processPhoto(photoId, appwriteUserId, displayOrder);
    });
    
    await Promise.allSettled(promises);
    
    // Small delay between batches to avoid overwhelming the servers
    if (i + photoConfig.batchSize < photos.length) {
      await sleep(1000);
    }
  }
}

/**
 * Find Appwrite user ID by email
 * @param {string} email - User email
 * @returns {Promise<string|null>} Appwrite user ID or null if not found
 */
async function findAppwriteUserId(email) {
  try {
    // Query profiles collection to find user by email
    const profiles = await database.listDocuments(
      config.databaseId,
      config.profileCollectionId,
      [
        Query.equal('email', email),
        Query.limit(1)
      ]
    );

    if (profiles.documents.length > 0) {
      return profiles.documents[0].userId;
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to find user ${email}:`, error.message);
    return null;
  }
}

/**
 * Print migration statistics
 */
function printStats() {
  console.log('\n📊 === Photo Migration Statistics ===');
  console.log(`👥 Users processed: ${stats.usersProcessed}`);
  console.log(`📸 Users with photos: ${stats.usersWithPhotos}`);
  console.log(`🖼️  Total photos found: ${stats.totalPhotos}`);
  console.log(`📥 Photos downloaded: ${stats.photosDownloaded}`);
  console.log(`📤 Photos uploaded: ${stats.photosUploaded}`);
  console.log(`📋 Profile media records created: ${stats.profileMediaCreated}`);
  console.log(`❌ Photos failed: ${stats.photosFailed}`);
  
  if (stats.totalPhotos > 0) {
    const successRate = ((stats.profileMediaCreated / stats.totalPhotos) * 100).toFixed(2);
    console.log(`✅ Success rate: ${successRate}%`);
  }

  if (stats.errors.length > 0) {
    console.log('\n❌ === Errors ===');
    stats.errors.slice(0, 10).forEach((error, index) => {
      console.log(`${index + 1}. Photo: ${error.photoId} (User: ${error.userId})`);
      console.log(`   Error: ${error.error}`);
    });
    
    if (stats.errors.length > 10) {
      console.log(`... and ${stats.errors.length - 10} more errors`);
    }
  }
}

/**
 * Main photo migration function
 * @returns {Promise<void>}
 */
async function migratePhotos() {
  console.log('📸 Starting photo migration...');
  const startTime = Date.now();
  
  try {
    // Check if merged file exists
    if (!fs.existsSync(mergedFilePath)) {
      throw new Error(`Merged file not found: ${mergedFilePath}`);
    }

    // Validate configuration
    if (!photoConfig.digitalOcean.endpoint) {
      console.warn('⚠️  DigitalOcean configuration not complete - using mock upload');
    }
    
    console.log(`📊 Migration limits: maxPhotos=${photoConfig.maxPhotos}, batchSize=${photoConfig.batchSize}`);

    const jsonStream = fs.createReadStream(mergedFilePath)
      .pipe(parser())
      .pipe(streamArray());

    for await (const { value: user } of jsonStream) {
      stats.usersProcessed++;
      
      // Find corresponding Appwrite user
      const email = user.user.email;
      if (!email) {
        console.warn(`⚠️  User ${user.user.id} has no email, skipping...`);
        continue;
      }

      const appwriteUserId = await findAppwriteUserId(email);
      if (!appwriteUserId) {
        console.warn(`⚠️  User ${email} not found in Appwrite, skipping...`);
        continue;
      }

      // Process user's photos
      await processUserPhotos(user, appwriteUserId);

      // Respect maxPhotos limit (check processed photos, not just total found)
      if (stats.profileMediaCreated >= photoConfig.maxPhotos) {
        console.log(`🛑 Reached maximum photo limit (${photoConfig.maxPhotos} processed)`);
        break;
      }

      // Progress update
      if (stats.usersProcessed % 10 === 0) {
        console.log(`🔄 Progress: ${stats.usersProcessed} users, ${stats.totalPhotos} photos found`);
      }
    }

  } catch (error) {
    console.error('❌ Photo migration failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\n📸 Photo migration completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

// Export functions
module.exports = {
  migratePhotos,
  photoConfig,
  stats
};

// Run migration if this file is executed directly
if (require.main === module) {
  migratePhotos().catch(console.error);
}