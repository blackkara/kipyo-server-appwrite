const fs = require('fs');
const path = require('path');

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

// Statistics
const stats = {
  documentsDeleted: 0,
  usersDeleted: 0,
  errors: []
};

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
  console.log(`Profile documents deleted: ${stats.documentsDeleted}`);
  console.log(`Users deleted: ${stats.usersDeleted}`);
  
  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. Operation: ${error.operation}`);
      console.log(`   Error: ${error.error}`);
      if (error.userId) console.log(`   User ID: ${error.userId}`);
      if (error.email) console.log(`   Email: ${error.email}`);
    });
  }
}

/**
 * Full cleanup - delete all profiles and users
 * @returns {Promise<void>}
 */
async function fullCleanup() {
  console.log('Starting full cleanup (profiles + users)...');
  const startTime = Date.now();
  
  try {
    // First delete all profile documents
    await deleteAllProfiles();
    
    // Then delete all users
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
  profilesOnlyCleanup,
  usersOnlyCleanup,
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
    case 'profiles':
      profilesOnlyCleanup().catch(console.error);
      break;
    case 'users':
      usersOnlyCleanup().catch(console.error);
      break;
    case 'pattern':
      const pattern = process.argv[3];
      if (!pattern) {
        console.error('Please provide email pattern: node step2_migrate.js pattern "test@"');
        process.exit(1);
      }
      deleteUsersByPattern(pattern).then(() => printStats()).catch(console.error);
      break;
    default:
      console.log('Usage:');
      console.log('  node step2_migrate.js full     # Delete all profiles and users');
      console.log('  node step2_migrate.js profiles # Delete only profile documents');
      console.log('  node step2_migrate.js users    # Delete only users');
      console.log('  node step2_migrate.js pattern "email@domain" # Delete users by email pattern');
      break;
  }
}