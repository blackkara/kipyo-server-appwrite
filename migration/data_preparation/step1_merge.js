const fs = require('fs');
const path = require('path');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const ngeohash = require('ngeohash');

// Import city database module
const { 
  cityDatabase, 
  capitalCities, 
  countryCodeFixes,
  getCityCoordinates,
  getCapitalCoordinates,
  fixCountryCode
} = require('./cityDatabase');


// File paths
const usersFilePath = path.join(__dirname, '..', 'connectycube_users.json');
const profilesFilePath = path.join(__dirname, '..', 'connectycube_profiles.json');
const outputFilePath = path.join(__dirname, '..', 'merged.json');

// Enhanced statistics
const stats = {
  usersProcessed: 0,
  profilesProcessed: 0,
  mergedUsers: 0,
  usersWithoutProfiles: 0,
  orphanedProfiles: 0,
  geohashesGenerated: 0,
  geohashErrors: 0,
  cityMatches: 0,        // Precise city-based geohashes
  capitalFallbacks: 0,   // Capital city fallback geohashes
  missedCities: [],      // Cities not in our database
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
 * Generate geohash for a profile based on city and country (enhanced)
 * Priority: 1) City coordinates, 2) Capital city coordinates, 3) Empty string
 * @param {Object} profile - Profile data
 * @returns {string} 7-character geohash or empty string
 */
function generateGeohash(profile) {
  if (!profile) {
    return '';
  }

  try {
    let country = profile.country;
    let city = profile.city;

    // Fix country code if needed
    if (country) {
      const lowerCountry = country.toLowerCase();
      if (countryCodeFixes[lowerCountry]) {
        country = countryCodeFixes[lowerCountry];
        profile.country = country; // Update the profile with fixed country code
      }
    }

    // Priority 1: Try city-specific coordinates (MOST VALUABLE!)
    if (city && country && cityDatabase[country]) {
      // First try exact match
      let cityCoords = cityDatabase[country][city];
      
      // If no exact match, try case-insensitive search
      if (!cityCoords) {
        const cityKey = Object.keys(cityDatabase[country])
          .find(key => key.toLowerCase() === city.toLowerCase());
        if (cityKey) {
          cityCoords = cityDatabase[country][cityKey];
        }
      }
      
      if (cityCoords) {
        const geohash = ngeohash.encode(cityCoords.lat, cityCoords.lon, 7);
        stats.geohashesGenerated++;
        stats.cityMatches = (stats.cityMatches || 0) + 1; // Track city matches
        return geohash;
      }
      
      // Track missed cities for future database expansion
      stats.missedCities = stats.missedCities || [];
      if (!stats.missedCities.some(m => m.city === city && m.country === country)) {
        stats.missedCities.push({ city, country, count: 1 });
      } else {
        const existing = stats.missedCities.find(m => m.city === city && m.country === country);
        existing.count++;
      }
    }

    // Priority 2: Fallback to capital city coordinates
    if (country && capitalCities[country]) {
      const capital = capitalCities[country];
      const geohash = ngeohash.encode(capital.lat, capital.lon, 7);
      stats.geohashesGenerated++;
      stats.capitalFallbacks = (stats.capitalFallbacks || 0) + 1; // Track capital fallbacks
      return geohash;
    } else {
      stats.geohashErrors++;
      return '';
    }
  } catch (error) {
    stats.geohashErrors++;
    stats.errors.push({
      type: 'geohash_generation',
      error: error.message,
      country: profile.country,
      city: profile.city
    });
    return '';
  }
}

/**
 * Merge user data with profile data
 * @param {Object} user - User data from connectycube_users.json
 * @param {Object} profile - Profile data from connectycube_profiles.json
 * @returns {Object} Merged user object
 */
function mergeUserData(user, profile) {
  // If profile exists, add geohash
  if (profile) {
    profile.geohash = generateGeohash(profile);
  }

  const merged = {
    // Base user data
    ...user,
    // Add profile data if exists (now with geohash)
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

  console.log('\n=== Enhanced Geohash Statistics ===');
  console.log(`Total geohashes generated: ${stats.geohashesGenerated}`);
  console.log(`City-based (precise): ${stats.cityMatches || 0}`);
  console.log(`Capital-based (fallback): ${stats.capitalFallbacks || 0}`);
  console.log(`Geohash errors: ${stats.geohashErrors}`);
  
  if (stats.mergedUsers > 0) {
    const geohashRate = ((stats.geohashesGenerated / stats.mergedUsers) * 100).toFixed(2);
    const cityPrecisionRate = (((stats.cityMatches || 0) / stats.mergedUsers) * 100).toFixed(2);
    console.log(`Geohash success rate: ${geohashRate}%`);
    console.log(`City precision rate: ${cityPrecisionRate}%`);
  }
  
  // Show top missed cities for future database expansion
  if (stats.missedCities && stats.missedCities.length > 0) {
    console.log('\n=== Top Missed Cities (for database expansion) ===');
    const sortedMissed = stats.missedCities
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    sortedMissed.forEach((missed, index) => {
      console.log(`${index + 1}. ${missed.city}, ${missed.country} (${missed.count} users)`);
    });
  }
  
  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. Type: ${error.type}`);
      console.log(`   Error: ${error.error}`);
      if (error.userIndex) {
        console.log(`   User Index: ${error.userIndex}`);
      }
      if (error.country) {
        console.log(`   Country: ${error.country}, City: ${error.city || 'N/A'}`);
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