/**
 * Explore Service Configuration
 * 
 * This file contains configuration constants for the ExploreService
 * to manage query limits, performance thresholds, and filtering strategies.
 */

export const ExploreConfig = {
  // Query optimization settings
  QUERY_LIMIT: 80, // Safe threshold below Appwrite's 100 limit
  FETCH_MULTIPLIER: 3, // Fetch 3x more cards when using memory filtering
  EXCLUSION_QUERY_LIMIT: 5000, // Max exclusions to fetch per query (matches, dislikes, etc.)
  
  // Country blocking settings
  COUNTRY_QUERY_LIMIT: 10, // Max blocked countries to handle via query (>10 uses memory filtering)
  
  // Exclusion settings
  DEFAULT_DISLIKES_TIMEFRAME_DAYS: 90, // Default timeframe for dislike exclusions (3 months)
  
  // Geohash settings
  GEOHASH_MIN_LENGTH: 1, // Minimum geohash length for validation
  GEOHASH_MAX_LENGTH: 12, // Maximum geohash length for validation
  
  // Location scope settings
  LOCATION_SCOPE: {
    WORLDWIDE: 'worldwide',
    COUNTRY: 'country', 
    CITY: 'city'
  },
  
  // Geohash precision for location filtering
  GEOHASH_PRECISION: {
    COUNTRY: 3, // First 3 characters (~630km radius) for country-level filtering
    CITY: 5     // First 5 characters (~19km radius) for city-level filtering
  },
  
  // Performance monitoring
  LOG_PERFORMANCE_METRICS: true, // Enable detailed performance logging
  WARN_ON_HIGH_EXCLUSIONS: true, // Log warnings for users with many exclusions
  HIGH_EXCLUSIONS_THRESHOLD: 100, // Threshold to consider "high" exclusions
  
  // Memory filtering optimization
  ENABLE_MEMORY_FILTERING: true, // Enable/disable memory filtering strategy
  MEMORY_FILTER_BATCH_SIZE: 1000, // Max documents to process in memory at once
  
  // Error handling
  ENABLE_GEOHASH_VALIDATION: true, // Enable strict geohash character validation
  LOG_GEOHASH_ERRORS: true, // Log geohash decode errors
  
  // Pagination settings
  DEFAULT_LIMIT: 100, // Default number of cards to return per request
  DEFAULT_OFFSET: 0, // Default starting position for pagination
  MAX_LIMIT: 50, // Maximum cards allowed per request (to prevent abuse)
  
  // Default inclusion settings for exclusion queries
  DEFAULT_EXCLUSIONS: {
    includeMatches: true,
    includeRecentDislikes: true,
    includeRecentLikes: true,
    includeBlocks: true,
    includeDialogs: true
  }
};

export default ExploreConfig;