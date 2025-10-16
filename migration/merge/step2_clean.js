const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

const sdk = require('node-appwrite');
const { ID, Permission, Role, Query } = sdk;

// Configuration
const { config } = require('./config');

// Initialize Appwrite client
const client = new sdk.Client();
client.setEndpoint(config.endpoint);
client.setProject(config.project);
client.setKey(config.apiKey);

const database = new sdk.Databases(client);
const users = new sdk.Users(client);

// Initialize DigitalOcean Spaces (S3 Compatible) if configured
let s3 = null;
if (config.photoMigration.digitalOcean.endpoint && config.photoMigration.digitalOcean.accessKeyId) {
  const spacesEndpoint = new AWS.Endpoint(config.photoMigration.digitalOcean.endpoint);
  s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    accessKeyId: config.photoMigration.digitalOcean.accessKeyId,
    secretAccessKey: config.photoMigration.digitalOcean.secretAccessKey,
    region: config.photoMigration.digitalOcean.region
  });
  console.log('✅ DigitalOcean Spaces configured for cleanup operations');
} else {
  console.warn('⚠️  DigitalOcean configuration incomplete - photo cleanup unavailable');
}

// Statistics
const stats = {
  digitalOceanPhotosDeleted: 0,
  profileMediaDeleted: 0,
  profileQuotasDeleted: 0,
  timezoneTrackingDeleted: 0,
  documentsDeleted: 0,
  usersDeleted: 0,
  errors: []
};

/**
 * Delete all photos from DigitalOcean Spaces bucket
 * @returns {Promise<void>}
 */
async function deleteAllDigitalOceanPhotos() {
  if (!s3) {
    console.log('⚠️  DigitalOcean not configured, skipping photo cleanup');
    return;
  }

  console.log('🗑️  Fetching all photos from DigitalOcean Spaces...');
  
  try {
    let allObjects = [];
    let continuationToken = null;
    
    // List all objects in the bucket
    do {
      const listParams = {
        Bucket: config.photoMigration.digitalOcean.bucketName,
        MaxKeys: 1000 // Maximum allowed by AWS S3
      };
      
      if (continuationToken) {
        listParams.ContinuationToken = continuationToken;
      }
      
      const response = await s3.listObjectsV2(listParams).promise();
      allObjects.push(...response.Contents);
      
      continuationToken = response.NextContinuationToken;
      console.log(`Fetched ${allObjects.length} objects so far...`);
      
    } while (continuationToken);

    console.log(`\n📊 Found ${allObjects.length} photos to delete from DigitalOcean\n`);

    if (allObjects.length === 0) {
      console.log('No photos found in DigitalOcean bucket');
      return;
    }

    // Delete objects in batches (max 1000 per batch as per AWS limit)
    const batchSize = 1000;
    for (let i = 0; i < allObjects.length; i += batchSize) {
      const batch = allObjects.slice(i, i + batchSize);
      
      // Prepare delete request
      const deleteParams = {
        Bucket: config.photoMigration.digitalOcean.bucketName,
        Delete: {
          Objects: batch.map(obj => ({ Key: obj.Key })),
          Quiet: false // Get detailed response
        }
      };
      
      try {
        const deleteResult = await s3.deleteObjects(deleteParams).promise();
        
        // Count successful deletions
        if (deleteResult.Deleted) {
          stats.digitalOceanPhotosDeleted += deleteResult.Deleted.length;
          console.log(`✓ Deleted ${deleteResult.Deleted.length} photos from batch`);
        }
        
        // Log any errors
        if (deleteResult.Errors && deleteResult.Errors.length > 0) {
          deleteResult.Errors.forEach(error => {
            console.error(`✗ Failed to delete ${error.Key}: ${error.Message}`);
            stats.errors.push({
              operation: 'delete_digitalocean_photo',
              photoKey: error.Key,
              error: error.Message
            });
          });
        }
        
      } catch (error) {
        console.error(`✗ Failed to delete batch: ${error.message}`);
        stats.errors.push({
          operation: 'delete_digitalocean_batch',
          batchSize: batch.length,
          error: error.message
        });
      }
      
      // Small delay between batches
      await sleep(100);
    }

    console.log(`✓ Successfully processed ${allObjects.length} photos, deleted: ${stats.digitalOceanPhotosDeleted}`);
    
  } catch (error) {
    console.error('✗ Error deleting DigitalOcean photos:', error.message);
    stats.errors.push({
      operation: 'delete_digitalocean_photos',
      error: error.message,
      details: error
    });
  }
}

/**
 * Delete all profile_media documents (must be done before profiles due to relationships)
 * @returns {Promise<void>}
 */
async function deleteAllProfileMedia() {
  console.log('🗑️  Fetching all profile_media documents...');
  
  let allProfileMedia = [];
  let offset = 0;
  const limit = 100;

  try {
    // Fetch all profile_media documents
    while (true) {
      const response = await database.listDocuments(
        config.databaseId,
        config.photoMigration.profileMediaCollectionId,
        [
          Query.limit(limit),
          Query.offset(offset)
        ]
      );

      allProfileMedia.push(...response.documents);

      if (response.documents.length < limit) {
        break;
      }

      offset += limit;
      console.log(`Fetched ${allProfileMedia.length} profile_media documents so far...`);
    }

    console.log(`\n📊 Found ${allProfileMedia.length} profile_media documents to delete\n`);

    if (allProfileMedia.length === 0) {
      console.log('No profile_media documents found to delete');
      return;
    }

    // Delete profile_media in batches
    const batchSize = 10;
    for (let i = 0; i < allProfileMedia.length; i += batchSize) {
      const batch = allProfileMedia.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (media) => {
          try {
            await database.deleteDocument(
              config.databaseId,
              config.photoMigration.profileMediaCollectionId,
              media.$id
            );
            stats.profileMediaDeleted++;
            console.log(`✓ Deleted profile_media: ${media.$id} (${media.url || 'no url'})`);
          } catch (error) {
            stats.errors.push({
              operation: 'delete_profile_media',
              mediaId: media.$id,
              error: error.message
            });
            console.error(`✗ Failed to delete profile_media ${media.$id}: ${error.message}`);
          }
        })
      );

      // Small delay between batches to avoid rate limiting
      await sleep(100);
    }

    console.log(`✓ Successfully processed ${allProfileMedia.length} profile_media documents, deleted: ${stats.profileMediaDeleted}`);
    
  } catch (error) {
    console.error('✗ Error deleting profile_media documents:', error.message);
    stats.errors.push({
      operation: 'delete_profile_media_fetch',
      error: error.message,
      details: error
    });
  }
}

/**
 * Delete all documents from profiles collection using loop method (relationship attributes workaround)
 * @returns {Promise<void>}
 */
async function deleteAllProfiles() {
  console.log('🗑️  Fetching all profiles...');
  
  let allProfiles = [];
  let offset = 0;
  const limit = 100;

  try {
    // Fetch all profiles
    while (true) {
      const response = await database.listDocuments(
        config.databaseId,
        config.profileCollectionId,
        [
          Query.limit(limit),
          Query.offset(offset)
        ]
      );

      allProfiles.push(...response.documents);

      if (response.documents.length < limit) {
        break;
      }

      offset += limit;
      console.log(`Fetched ${allProfiles.length} profiles so far...`);
    }

    console.log(`\n📊 Found ${allProfiles.length} profiles to delete\n`);

    if (allProfiles.length === 0) {
      console.log('No profile documents found to delete');
      return;
    }

    // Delete profiles in batches
    const batchSize = 10;
    for (let i = 0; i < allProfiles.length; i += batchSize) {
      const batch = allProfiles.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (profile) => {
          try {
            await database.deleteDocument(
              config.databaseId,
              config.profileCollectionId,
              profile.$id
            );
            stats.documentsDeleted++;
            console.log(`✓ Deleted profile: ${profile.username || profile.$id} (${profile.email || 'no email'})`);
          } catch (error) {
            stats.errors.push({
              operation: 'delete_profile',
              profileId: profile.$id,
              error: error.message
            });
            console.error(`✗ Failed to delete profile ${profile.$id}: ${error.message}`);
          }
        })
      );

      // Small delay between batches to avoid rate limiting
      await sleep(100);
    }

    console.log(`✓ Successfully processed ${allProfiles.length} profiles, deleted: ${stats.documentsDeleted}`);
    
  } catch (error) {
    console.error('✗ Error deleting profile documents:', error.message);
    stats.errors.push({
      operation: 'delete_profiles_fetch',
      error: error.message,
      details: error
    });
  }
}

/**
 * Delete all quota records
 * @returns {Promise<number>} Number of deleted quotas
 */
async function deleteAllQuotas() {
  console.log('🧹 Deleting all quota records...');
  let deletedCount = 0;
  
  try {
    while (true) {
      const quotas = await database.listDocuments(
        config.databaseId,
        config.quotaCollectionId,
        [Query.limit(100)]
      );

      if (quotas.documents.length === 0) break;

      for (const quota of quotas.documents) {
        await database.deleteDocument(
          config.databaseId,
          config.quotaCollectionId,
          quota.$id
        );
        deletedCount++;
      }
    }
    
    console.log(`✓ Successfully deleted ${deletedCount} quota records`);
    return deletedCount;
  } catch (error) {
    console.error('✗ Error deleting quotas:', error.message);
    throw error;
  }
}

/**
 * Delete all timezone tracking records
 * @returns {Promise<number>} Number of deleted timezone tracking records
 */
async function deleteAllTimezoneTracking() {
  console.log('🧹 Deleting all timezone tracking records...');
  let deletedCount = 0;
  
  try {
    while (true) {
      const timezones = await database.listDocuments(
        config.databaseId,
        config.timezoneTrackingCollectionId,
        [Query.limit(100)]
      );

      if (timezones.documents.length === 0) break;

      for (const timezone of timezones.documents) {
        await database.deleteDocument(
          config.databaseId,
          config.timezoneTrackingCollectionId,
          timezone.$id
        );
        deletedCount++;
      }
    }
    
    console.log(`✓ Successfully deleted ${deletedCount} timezone tracking records`);
    return deletedCount;
  } catch (error) {
    console.error('✗ Error deleting timezone tracking records:', error.message);
    throw error;
  }
}

/**
 * Delete all users in batches (users don't support bulk delete)
 * @returns {Promise<void>}
 */
async function deleteAllUsers() {
  console.log('Starting deletion of all users...');
  
  try {
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      // List users in batches
      const usersList = await users.list([
        Query.limit(100) // Maximum limit per request
      ]);
      
      if (usersList.users.length === 0) {
        hasMore = false;
        break;
      }
      
      console.log(`Processing batch of ${usersList.users.length} users...`);
      
      // Delete users one by one (no bulk delete available for users)
      for (const user of usersList.users) {
        try {
          await users.delete(user.$id);
          totalDeleted++;
          
          if (totalDeleted % 10 === 0) {
            console.log(`Deleted ${totalDeleted} users so far...`);
          }
          
        } catch (error) {
          console.error(`Failed to delete user ${user.$id}:`, error.message);
          stats.errors.push({
            operation: 'delete_user',
            userId: user.$id,
            error: error.message
          });
        }
      }
      
      // Small delay to avoid rate limiting
      await sleep(100);
    }
    
    stats.usersDeleted = totalDeleted;
    console.log(`✓ Successfully deleted ${totalDeleted} users`);
    
  } catch (error) {
    console.error('✗ Error during user deletion process:', error.message);
    stats.errors.push({
      operation: 'delete_users_process',
      error: error.message,
      details: error
    });
  }
}

/**
 * Delete users by email pattern (for testing with specific users)
 * @param {string} emailPattern - Email pattern to match (e.g., 'test@')
 * @returns {Promise<void>}
 */
async function deleteUsersByPattern(emailPattern) {
  console.log(`Starting deletion of users with email pattern: ${emailPattern}`);
  
  try {
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      // List users with email search
      const usersList = await users.list([
        Query.limit(100),
        Query.search('email', emailPattern)
      ]);
      
      if (usersList.users.length === 0) {
        hasMore = false;
        break;
      }
      
      console.log(`Processing batch of ${usersList.users.length} matching users...`);
      
      // Delete matching users
      for (const user of usersList.users) {
        try {
          await users.delete(user.$id);
          totalDeleted++;
          console.log(`Deleted user: ${user.email}`);
          
        } catch (error) {
          console.error(`Failed to delete user ${user.email}:`, error.message);
          stats.errors.push({
            operation: 'delete_user_by_pattern',
            userId: user.$id,
            email: user.email,
            error: error.message
          });
        }
      }
      
      // Small delay to avoid rate limiting
      await sleep(100);
    }
    
    stats.usersDeleted = totalDeleted;
    console.log(`✓ Successfully deleted ${totalDeleted} users matching pattern: ${emailPattern}`);
    
  } catch (error) {
    console.error('✗ Error during pattern-based user deletion:', error.message);
    stats.errors.push({
      operation: 'delete_users_by_pattern',
      pattern: emailPattern,
      error: error.message,
      details: error
    });
  }
}

/**
 * Delete profiles by query (for testing or selective deletion)
 * @param {Array} queries - Array of Query objects
 * @returns {Promise<void>}
 */
async function deleteProfilesByQuery(queries = []) {
  console.log('Starting deletion of profile documents by query...');
  
  try {
    // First, get count of documents matching the query
    const listResult = await database.listDocuments(
      config.databaseId,
      config.profileCollectionId,
      [...queries, Query.limit(1)]
    );
    
    console.log(`Found ${listResult.total} profile documents matching query`);
    
    if (listResult.total === 0) {
      console.log('No profile documents found matching the query');
      return;
    }

    // Bulk delete documents matching the query
    const deleteResult = await database.deleteDocuments(
      config.databaseId,
      config.profileCollectionId,
      queries
    );
    
    stats.documentsDeleted = deleteResult.total || listResult.total;
    console.log(`✓ Successfully deleted ${stats.documentsDeleted} profile documents`);
    
  } catch (error) {
    console.error('✗ Error deleting profile documents by query:', error.message);
    stats.errors.push({
      operation: 'delete_profiles_by_query',
      queries: queries,
      error: error.message,
      details: error
    });
  }
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
 * Print cleanup statistics
 */
function printStats() {
  console.log('\n=== Cleanup Statistics ===');
  console.log(`DigitalOcean photos deleted: ${stats.digitalOceanPhotosDeleted}`);
  console.log(`Profile_media documents deleted: ${stats.profileMediaDeleted}`);
  console.log(`Profile_quotas documents deleted: ${stats.profileQuotasDeleted}`);
  console.log(`Timezone_tracking documents deleted: ${stats.timezoneTrackingDeleted}`);
  console.log(`Profile documents deleted: ${stats.documentsDeleted}`);
  console.log(`Users deleted: ${stats.usersDeleted}`);
  
  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. Operation: ${error.operation}`);
      console.log(`   Error: ${error.error}`);
      if (error.userId) console.log(`   User ID: ${error.userId}`);
      if (error.email) console.log(`   Email: ${error.email}`);
      if (error.mediaId) console.log(`   Media ID: ${error.mediaId}`);
      if (error.photoKey) console.log(`   Photo Key: ${error.photoKey}`);
    });
  }
}

/**
 * Full cleanup - delete all DigitalOcean photos, profile_media, profiles and users (in correct order)
 * @returns {Promise<void>}
 */
async function fullCleanup() {
  console.log('Starting full cleanup (DigitalOcean + profile_media + profile_quotas + timezone_tracking + profiles + users)...');
  const startTime = Date.now();
  
  try {
    // STEP 1: Delete all photos from DigitalOcean Spaces first
    await deleteAllDigitalOceanPhotos();
    
    // STEP 2: Delete all profile_media documents (child relationships)
    await deleteAllProfileMedia();
    
    // STEP 3: Delete all profile_quotas documents (child relationships)
    stats.profileQuotasDeleted = await deleteAllQuotas();
    
    // STEP 4: Delete all timezone tracking documents (child relationships)
    stats.timezoneTrackingDeleted = await deleteAllTimezoneTracking();
    
    // STEP 5: Delete all profile documents (parent relationships)
    await deleteAllProfiles();
    
    // STEP 6: Finally delete all users
    await deleteAllUsers();
    
  } catch (error) {
    console.error('Full cleanup failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nFull cleanup completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

/**
 * DigitalOcean only cleanup - delete all photos from DigitalOcean Spaces
 * @returns {Promise<void>}
 */
async function digitalOceanOnlyCleanup() {
  console.log('Starting DigitalOcean photos only cleanup...');
  const startTime = Date.now();
  
  try {
    await deleteAllDigitalOceanPhotos();
    
  } catch (error) {
    console.error('DigitalOcean cleanup failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nDigitalOcean cleanup completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

/**
 * Profile Media only cleanup - delete all profile_media documents
 * @returns {Promise<void>}
 */
async function profileMediaOnlyCleanup() {
  console.log('Starting profile_media only cleanup...');
  const startTime = Date.now();
  
  try {
    await deleteAllProfileMedia();
    
  } catch (error) {
    console.error('Profile_media cleanup failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nProfile_media cleanup completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

/**
 * Profiles only cleanup - delete all profile documents
 * @returns {Promise<void>}
 */
async function profilesOnlyCleanup() {
  console.log('Starting profiles only cleanup...');
  const startTime = Date.now();
  
  try {
    await deleteAllProfiles();
    
  } catch (error) {
    console.error('Profiles cleanup failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nProfiles cleanup completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

/**
 * Users only cleanup - delete all users
 * @returns {Promise<void>}
 */
async function usersOnlyCleanup() {
  console.log('Starting users only cleanup...');
  const startTime = Date.now();
  
  try {
    await deleteAllUsers();
    
  } catch (error) {
    console.error('Users cleanup failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nUsers cleanup completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}


// Export functions
module.exports = {
  fullCleanup,
  digitalOceanOnlyCleanup,
  profileMediaOnlyCleanup,
  profilesOnlyCleanup,
  usersOnlyCleanup,
  deleteAllDigitalOceanPhotos,
  deleteAllProfileMedia,
  deleteAllProfiles,
  deleteAllUsers,
  deleteUsersByPattern,
  deleteProfilesByQuery,
  stats
};

// Run cleanup based on command line arguments
if (require.main === module) {
  const operation = process.argv[2] || 'full';
  
  switch (operation) {
    case 'full':
      fullCleanup().catch(console.error);
      break;
    case 'photos':
      digitalOceanOnlyCleanup().catch(console.error);
      break;
    case 'media':
      profileMediaOnlyCleanup().catch(console.error);
      break;
    case 'profiles':
      profilesOnlyCleanup().catch(console.error);
      break;
    case 'users':
      usersOnlyCleanup().catch(console.error);
      break;
    case 'pattern':
      const pattern = process.argv[3];
      if (!pattern) {
        console.error('Please provide email pattern: node step2_clean.js pattern "test@"');
        process.exit(1);
      }
      deleteUsersByPattern(pattern).then(() => printStats()).catch(console.error);
      break;
    default:
      console.log('Usage:');
      console.log('  node step2_clean.js full     # Delete all DigitalOcean photos, profile_media, profile_quotas, profiles and users (safe order)');
      console.log('  node step2_clean.js photos   # Delete only DigitalOcean photos');
      console.log('  node step2_clean.js media    # Delete only profile_media documents');
      console.log('  node step2_clean.js profiles # Delete only profile documents');
      console.log('  node step2_clean.js users    # Delete only users');
      console.log('  node step2_clean.js pattern "email@domain" # Delete users by email pattern');
      break;
  }
}