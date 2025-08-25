// utils/ProfileUtils.js
import { PROFILE_CONFIG, RESET_CONFIG } from './Constants.js';

/**
 * Pure profile utility tool for daily reset validation
 * This class takes only primitive parameters and validates daily reset logic
 * It doesn't know about profile/user data structures
 */
class ProfileUtils {

  /**
   * Main validation function for daily reset
   * @param {number|string} timezoneOffset - Current timezone offset
   * @param {string|Date} lastResetDate - Last reset date (ISO string or Date)
   * @param {number} currentMessageCount - Current remaining message count
   * @param {string} requestId - Request ID for logging
   * @param {Function} log - Logging function
   * @returns {Object} Reset validation results
   */
  validateDailyReset(timezoneOffset, lastResetDate, currentMessageCount, requestId, log) {
    try {
      log(`[${requestId}] Daily reset validation started`);

      const now = new Date();

      const result = {
        shouldReset: false,
        isResetNeeded: false,
        isValidResetTime: false,
        todayInUserTimezone: null,
        lastResetDateInUserTimezone: null,
        currentMessageCount: currentMessageCount,
        newMessageCount: null,
        expectedResetDate: null,
        expectedResetDateISO: null,
        hoursUntilReset: null,
        timeUntilReset: null
      };

      // Get today's date in user's timezone
      result.todayInUserTimezone = this._getTodayInTimezone(now, timezoneOffset);

      // Get last reset date in user's timezone
      result.lastResetDateInUserTimezone = this._getLastResetDateInTimezone(lastResetDate, timezoneOffset);

      // Check if reset is needed (new day)
      result.isResetNeeded = this._isResetNeeded(result.lastResetDateInUserTimezone, result.todayInUserTimezone);

      // Check if reset timing is valid (not too frequent)
      result.isValidResetTime = this._isValidResetTime(lastResetDate, now);

      // Calculate next reset time information
      result.expectedResetDate = this.getNextResetTime(timezoneOffset);
      result.expectedResetDateISO = result.expectedResetDate.toISOString();
      result.hoursUntilReset = this.getHoursUntilNextReset(timezoneOffset);
      result.timeUntilReset = this.getTimeUntilNextReset(timezoneOffset);

      // Final decision
      result.shouldReset = result.isResetNeeded && result.isValidResetTime;

      // Set new message count if reset should happen
      if (result.shouldReset) {
        result.newMessageCount = RESET_CONFIG.DAILY_MESSAGE_LIMIT;
        log(`[${requestId}] Daily reset should be performed - messages: ${currentMessageCount} → ${result.newMessageCount}`);
        log(`[${requestId}] Next reset expected at: ${result.expectedResetDateISO}`);
      } else if (result.isResetNeeded && !result.isValidResetTime) {
        result.newMessageCount = currentMessageCount; // Keep current
        log(`[${requestId}] Daily reset needed but too frequent - keeping current: ${currentMessageCount}`);
        log(`[${requestId}] Next reset expected at: ${result.expectedResetDateISO}`);
      } else {
        result.newMessageCount = currentMessageCount; // Keep current
        log(`[${requestId}] Daily reset not needed - keeping current: ${currentMessageCount}`);
        log(`[${requestId}] Next reset expected at: ${result.expectedResetDateISO} (${result.timeUntilReset.text} remaining)`);
      }

      log(`[${requestId}] Daily reset validation completed`);
      return result;

    } catch (error) {
      log(`[${requestId}] ERROR: ${error.message}`);
      throw error;
    }
  }

  // ===========================================
  // DAILY RESET VALIDATION HELPERS
  // ===========================================

  /**
   * Is reset needed? (new day check)
   */
  _isResetNeeded(lastResetDateInUserTZ, todayInUserTZ) {
    return !lastResetDateInUserTZ || lastResetDateInUserTZ !== todayInUserTZ;
  }

  /**
   * Is reset timing valid? (not too frequent)
   */
  _isValidResetTime(lastResetDate, now) {
    if (!lastResetDate) return true;

    const lastReset = new Date(lastResetDate);
    if (isNaN(lastReset.getTime())) {
      return true;
    }

    const hoursSince = (now - lastReset) / (1000 * 60 * 60);
    return hoursSince >= RESET_CONFIG.RESET_COOLDOWN_HOURS;
  }

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================

  /**
   * Parse timezone offset string to minutes
   */
  _parseOffset(offsetString) {
    if (typeof offsetString === 'number') return offsetString;
    if (!offsetString) return 0;

    if (typeof offsetString === 'string') {
      const parsed = parseInt(offsetString.replace(/[^-+\d]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }

  /**
   * Get today's date in specific timezone
   */
  _getTodayInTimezone(utcDate, timezoneOffset) {
    const offset = this._parseOffset(timezoneOffset);
    const localDate = new Date(utcDate.getTime() + (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Get last reset date in user's timezone
   */
  _getLastResetDateInTimezone(lastResetDate, timezoneOffset) {
    if (!lastResetDate) return null;

    const resetTime = new Date(lastResetDate);
    if (isNaN(resetTime.getTime())) {
      return null;
    }

    const offset = this._parseOffset(timezoneOffset);
    return this._getTodayInTimezone(resetTime, offset);
  }

  /**
   * Get current date in specific timezone
   */
  getCurrentDateInTimezone(timezoneOffset) {
    const now = new Date();
    return this._getTodayInTimezone(now, timezoneOffset);
  }

  /**
   * Get next reset time in UTC (tomorrow 00:00 in user's timezone)
   */
  getNextResetTime(timezoneOffset) {
    const now = new Date();
    const offset = this._parseOffset(timezoneOffset);
    const localNow = new Date(now.getTime() + (offset * 60 * 1000));

    // Calculate tomorrow's 00:00
    const tomorrow = new Date(localNow);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    // Convert back to UTC
    return new Date(tomorrow.getTime() - (offset * 60 * 1000));
  }

  /**
   * Get hours until next reset
   */
  getHoursUntilNextReset(timezoneOffset) {
    const now = new Date();
    const nextReset = this.getNextResetTime(timezoneOffset);
    return Math.ceil((nextReset - now) / (1000 * 60 * 60));
  }

  /**
   * Calculate hours between two dates
   */
  calculateHoursBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 0;
    }

    return Math.abs(end - start) / (1000 * 60 * 60);
  }

  /**
   * Check if a date is today in specific timezone
   */
  isToday(date, timezoneOffset) {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return false;
    }

    const inputDateInTZ = this._getTodayInTimezone(inputDate, timezoneOffset);
    const todayInTZ = this.getCurrentDateInTimezone(timezoneOffset);

    return inputDateInTZ === todayInTZ;
  }

  /**
   * Format date in user's timezone
   */
  formatDateInTimezone(date, timezoneOffset) {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return null;
    }

    const offset = this._parseOffset(timezoneOffset);
    const localDate = new Date(inputDate.getTime() + (offset * 60 * 1000));

    return {
      date: localDate.toISOString().split('T')[0], // YYYY-MM-DD
      time: localDate.toISOString().split('T')[1].split('.')[0], // HH:MM:SS
      datetime: localDate.toISOString() // Full ISO string
    };
  }

  /**
   * Validate message count
   */
  validateMessageCount(messageCount) {
    if (typeof messageCount !== 'number') {
      return { isValid: false, error: 'Message count must be a number' };
    }

    if (messageCount < 0) {
      return { isValid: false, error: 'Message count cannot be negative' };
    }

    if (messageCount > RESET_CONFIG.DAILY_MESSAGE_LIMIT) {
      return { isValid: false, error: `Message count cannot exceed ${RESET_CONFIG.DAILY_MESSAGE_LIMIT}` };
    }

    return { isValid: true, error: null };
  }

  /**
   * Calculate remaining time until next reset in human readable format
   */
  getTimeUntilNextReset(timezoneOffset) {
    const hours = this.getHoursUntilNextReset(timezoneOffset);

    if (hours <= 1) {
      return { hours: 0, minutes: Math.ceil(hours * 60), text: `${Math.ceil(hours * 60)} minutes` };
    }

    const wholeHours = Math.floor(hours);
    const minutes = Math.ceil((hours - wholeHours) * 60);

    return {
      hours: wholeHours,
      minutes: minutes,
      text: minutes > 0 ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`
    };
  }

  /**
   * Calculate profile completion percentage based on filled fields
   * @param {Object} profileData - Profile data object
   * @returns {number} Completion percentage (0-100)
   */
  calculateProfileCompletion(profileData) {
    try {
      let completedRequired = 0;
      let completedImportant = 0;
      let completedOptional = 0;

      // Check required fields
      PROFILE_CONFIG.REQUIRED_FIELDS.forEach(field => {
        if (this._isFieldCompleted(profileData, field, 'required')) {
          completedRequired++;
        }
      });

      // Check important fields
      PROFILE_CONFIG.IMPORTANT_FIELDS.forEach(field => {
        if (this._isFieldCompleted(profileData, field, 'important')) {
          completedImportant++;
        }
      });

      // Check optional fields
      PROFILE_CONFIG.OPTIONAL_FIELDS.forEach(field => {
        if (this._isFieldCompleted(profileData, field, 'optional')) {
          completedOptional++;
        }
      });

      // Calculate weighted percentage
      const requiredPercentage = (completedRequired / PROFILE_CONFIG.REQUIRED_FIELDS.length) * PROFILE_CONFIG.COMPLETION_WEIGHTS.REQUIRED;
      const importantPercentage = (completedImportant / PROFILE_CONFIG.IMPORTANT_FIELDS.length) * PROFILE_CONFIG.COMPLETION_WEIGHTS.IMPORTANT;
      const optionalPercentage = (completedOptional / PROFILE_CONFIG.OPTIONAL_FIELDS.length) * PROFILE_CONFIG.COMPLETION_WEIGHTS.OPTIONAL;

      const totalPercentage = requiredPercentage + importantPercentage + optionalPercentage;

      return Math.round(Math.min(100, totalPercentage)); // Max 100%

    } catch (error) {
      return 0; // Return 0 if calculation fails
    }
  }

  /**
   * Get detailed profile completion breakdown
   * @param {Object} profileData - Profile data object
   * @returns {Object} Detailed completion breakdown
   */
  getProfileCompletionDetails(profileData) {
    try {
      const details = {
        overall: 0,
        required: { completed: 0, total: PROFILE_CONFIG.REQUIRED_FIELDS.length, percentage: 0, fields: {} },
        important: { completed: 0, total: PROFILE_CONFIG.IMPORTANT_FIELDS.length, percentage: 0, fields: {} },
        optional: { completed: 0, total: PROFILE_CONFIG.OPTIONAL_FIELDS.length, percentage: 0, fields: {} },
        missingFields: []
      };

      // Check required fields
      PROFILE_CONFIG.REQUIRED_FIELDS.forEach(field => {
        const isCompleted = this._isFieldCompleted(profileData, field, 'required');
        details.required.fields[field] = isCompleted;
        if (isCompleted) {
          details.required.completed++;
        } else {
          details.missingFields.push({ field, category: 'required' });
        }
      });

      // Check important fields
      PROFILE_CONFIG.IMPORTANT_FIELDS.forEach(field => {
        const isCompleted = this._isFieldCompleted(profileData, field, 'important');
        details.important.fields[field] = isCompleted;
        if (isCompleted) {
          details.important.completed++;
        } else {
          details.missingFields.push({ field, category: 'important' });
        }
      });

      // Check optional fields
      PROFILE_CONFIG.OPTIONAL_FIELDS.forEach(field => {
        const isCompleted = this._isFieldCompleted(profileData, field, 'optional');
        details.optional.fields[field] = isCompleted;
        if (isCompleted) {
          details.optional.completed++;
        } else {
          details.missingFields.push({ field, category: 'optional' });
        }
      });

      // Calculate percentages
      details.required.percentage = Math.round((details.required.completed / details.required.total) * 100);
      details.important.percentage = Math.round((details.important.completed / details.important.total) * 100);
      details.optional.percentage = Math.round((details.optional.completed / details.optional.total) * 100);
      details.overall = this.calculateProfileCompletion(profileData);

      return details;

    } catch (error) {
      return {
        overall: 0,
        required: { completed: 0, total: 0, percentage: 0, fields: {} },
        important: { completed: 0, total: 0, percentage: 0, fields: {} },
        optional: { completed: 0, total: 0, percentage: 0, fields: {} },
        missingFields: []
      };
    }
  }

  /**
   * Check if a specific field is completed based on its category
   * @param {Object} profileData - Profile data object
   * @param {string} field - Field name to check
   * @param {string} category - Field category ('required', 'important', 'optional')
   * @returns {boolean} True if field is completed
   */
  _isFieldCompleted(profileData, field, category) {
    try {
      if (!profileData || typeof profileData !== 'object') {
        return false;
      }

      // Special handling for new data structure
      let value;
      
      // Handle medias field (was photos)
      if (field === 'medias' || field === 'photos') {
        value = this._getNestedProperty(profileData, 'medias');
      }
      // Handle passions and habits in preferences
      else if (field === 'passions') {
        value = this._getNestedProperty(profileData, 'preferences.passions');
      }
      else if (field === 'habits') {
        value = this._getNestedProperty(profileData, 'preferences.habits');
      }
      // Handle other fields normally
      else {
        value = this._getNestedProperty(profileData, field);
      }

      // Check if value exists and is not empty
      if (value === null || value === undefined) {
        return false;
      }

      // Handle different data types
      switch (typeof value) {
        case 'string':
          // String is completed if it's not empty and not just whitespace
          return value.trim().length > 0;

        case 'number':
          // Number is completed if it's a valid number
          return !isNaN(value) && isFinite(value);

        case 'boolean':
          // Boolean is always completed (true or false are both valid)
          return true;

        case 'object':
          if (Array.isArray(value)) {
            // Array is completed if it has at least one element
            // For medias array, also check if medias are active
            if (field === 'medias' || field === 'photos') {
              return value.length > 0 && value.some(media => 
                media && (media.isActive !== false) && media.url
              );
            }
            return value.length > 0;
          } else {
            // Object is completed if it has at least one property
            return Object.keys(value).length > 0;
          }

        default:
          // Other types are considered completed if they exist
          return true;
      }

    } catch (error) {
      // If any error occurs, consider field as not completed
      return false;
    }
  }

  /**
   * Get nested property value from an object using dot notation
   * @param {Object} obj - Source object
   * @param {string} path - Property path (e.g., 'user.profile.name' or 'preferences.passions')
   * @returns {*} Property value or null if not found
   */
  _getNestedProperty(obj, path) {
    try {
      if (!obj || typeof obj !== 'object') {
        return null;
      }

      if (!path || typeof path !== 'string') {
        return null;
      }

      // Split path by dots and reduce to get nested value
      return path.split('.').reduce((current, key) => {
        return (current && typeof current === 'object' && key in current)
          ? current[key]
          : null;
      }, obj);

    } catch (error) {
      return null;
    }
  }
}

export default new ProfileUtils();