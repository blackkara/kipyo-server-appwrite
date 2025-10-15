const fs = require('fs');
const path = require('path');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');

// File paths
const usersFilePath = path.join(__dirname, '..', 'connectycube_users.json');
const profilesFilePath = path.join(__dirname, '..', 'connectycube_profiles.json');
const outputFilePath = path.join(__dirname, 'merged.json');

// Statistics
const stats = {
  usersProcessed: 0,
  profilesProcessed: 0,
  mergedUsers: 0,
  usersWithoutProfiles: 0,
  orphanedProfiles: 0,
  errors: []
};

/**
 * Load all profiles into memory for quick lookup
 * @returns {Promise<Map>} Map of userId to profile data
 */
async function loadProfiles() {
  console.log('Loading profiles...');
  const profiles = new Map();
  
  try {
    if (!fs.existsSync(profilesFilePath)) {
      console.warn(`Profiles file not found: ${profilesFilePath}`);
      return profiles;
    }

    const profileStream = fs.createReadStream(profilesFilePath)
      .pipe(parser())
      .pipe(streamArray());

    for await (const { value } of profileStream) {
      if (value.userId) {
        profiles.set(value.userId, value);
        stats.profilesProcessed++;
      }
      
      if (stats.profilesProcessed % 1000 === 0) {
        console.log(`Loaded ${stats.profilesProcessed} profiles...`);
      }
    }
    
    console.log(`Total profiles loaded: ${stats.profilesProcessed}`);
    return profiles;
    
  } catch (error) {
    console.error('Error loading profiles:', error.message);
    stats.errors.push({
      type: 'profile_loading',
      error: error.message
    });
    return profiles;
  }
}

/**
 * Merge user data with profile data
 * @param {Object} user - User data from connectycube_users.json
 * @param {Object} profile - Profile data from connectycube_profiles.json
 * @returns {Object} Merged user object
 */
function mergeUserData(user, profile) {
  const merged = {
    // Base user data
    ...user,
    // Add profile data if exists
    profile: profile || null
  };
  
  return merged;
}

/**
 * Process users and merge with profiles
 * @param {Map} profiles - Map of profiles by userId
 * @returns {Promise<void>}
 */
async function processUsers(profiles) {
  console.log('Starting user processing...');
  
  try {
    // Check if users file exists
    if (!fs.existsSync(usersFilePath)) {
      throw new Error(`Users file not found: ${usersFilePath}`);
    }

    // Create write stream for output
    const writeStream = fs.createWriteStream(outputFilePath);
    writeStream.write('[\n');

    const userStream = fs.createReadStream(usersFilePath)
      .pipe(parser())
      .pipe(streamArray());

    let isFirstUser = true;

    for await (const { value } of userStream) {
      try {
        stats.usersProcessed++;
        
        // Get user ID from user.id field
        const userId = value.user?.id;
        
        if (!userId) {
          console.warn(`User without ID found at index ${stats.usersProcessed}`);
          stats.errors.push({
            type: 'missing_user_id',
            user: value,
            index: stats.usersProcessed
          });
          continue;
        }

        // Find matching profile
        const profile = profiles.get(userId);
        
        if (profile) {
          stats.mergedUsers++;
          // Remove profile from map to track orphaned profiles later
          profiles.delete(userId);
        } else {
          stats.usersWithoutProfiles++;
        }

        // Merge user and profile data
        const mergedUser = mergeUserData(value, profile);

        // Write to output file
        if (!isFirstUser) {
          writeStream.write(',\n');
        }
        writeStream.write(JSON.stringify(mergedUser, null, 2));
        isFirstUser = false;

        // Progress logging
        if (stats.usersProcessed % 1000 === 0) {
          console.log(`Processed ${stats.usersProcessed} users, merged: ${stats.mergedUsers}`);
        }

      } catch (error) {
        console.error(`Error processing user ${stats.usersProcessed}:`, error.message);
        stats.errors.push({
          type: 'user_processing',
          error: error.message,
          userIndex: stats.usersProcessed
        });
      }
    }

    writeStream.write('\n]');
    writeStream.end();

    // Count orphaned profiles (profiles without matching users)
    stats.orphanedProfiles = profiles.size;

    console.log('User processing completed');

  } catch (error) {
    console.error('Error processing users:', error.message);
    throw error;
  }
}

/**
 * Print merge statistics
 */
function printStats() {
  console.log('\n=== Merge Statistics ===');
  console.log(`Users processed: ${stats.usersProcessed}`);
  console.log(`Profiles loaded: ${stats.profilesProcessed}`);
  console.log(`Users with profiles: ${stats.mergedUsers}`);
  console.log(`Users without profiles: ${stats.usersWithoutProfiles}`);
  console.log(`Orphaned profiles: ${stats.orphanedProfiles}`);
  
  if (stats.usersProcessed > 0) {
    const mergeRate = ((stats.mergedUsers / stats.usersProcessed) * 100).toFixed(2);
    console.log(`Merge rate: ${mergeRate}%`);
  }
  
  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. Type: ${error.type}`);
      console.log(`   Error: ${error.error}`);
      if (error.userIndex) {
        console.log(`   User Index: ${error.userIndex}`);
      }
    });
  }

  console.log(`\nOutput file created: ${outputFilePath}`);
}

/**
 * Main merge function
 * @returns {Promise<void>}
 */
async function merge() {
  console.log('Starting merge process...');
  const startTime = Date.now();
  
  try {
    // Load all profiles into memory
    const profiles = await loadProfiles();
    
    // Process users and merge with profiles
    await processUsers(profiles);
    
  } catch (error) {
    console.error('Merge failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nMerge completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

// Export function for testing
module.exports = {
  merge,
  loadProfiles,
  mergeUserData,
  stats
};

// Run merge if this file is executed directly
if (require.main === module) {
  merge().catch(console.error);
}