// utils/TimezoneValidationTool.js
import { TIMEZONE_CONFIG } from './Constants.js';

/**
 * Pure timezone validation tool
 * This class takes only primitive parameters and validates timezone change requests
 * It doesn't know about user data structures or make business logic decisions
 */
class TimezoneValidationTool {

  /**
   * Main validation function for timezone changes
   * @param {number|string} currentTimezone - Current timezone offset
   * @param {number|string} requestedTimezone - Requested timezone offset
   * @param {string|Date} lastTimezoneChangeDate - Last timezone change date (ISO string or Date)
   * @param {number} dailyTimezoneChanges - Number of timezone changes today
   * @param {string} requestId - Request ID for logging
   * @param {Function} log - Logging function
   * @returns {Object} Timezone validation results
   */
  validateTimezoneChange(currentTimezone, requestedTimezone, lastTimezoneChangeDate, dailyTimezoneChanges = 0, requestId, log) {
    try {
      log(`[${requestId}] Timezone validation started`);

      const now = new Date();

      const result = {
        requestedTimezone: requestedTimezone,
        acceptedTimezone: null,
        isRequestedTimezoneValid: false,
        isRequestedTimezoneSuspiciousJump: false,
        isRequestedTimezoneChangeTooFrequently: false,
        isDailyTimezoneChangeLimitExceeded: false,
        shouldChangeTimezone: false
      };

      // Return current timezone if no change requested
      if (requestedTimezone === null || requestedTimezone === undefined || 
          currentTimezone === requestedTimezone) {
        result.acceptedTimezone = currentTimezone;
        log(`[${requestId}] No timezone change requested`);
        return result;
      }

      // Perform all validations
      result.isRequestedTimezoneValid = this._isValidTimezone(requestedTimezone);
      result.isRequestedTimezoneSuspiciousJump = this._isSuspiciousJump(currentTimezone, requestedTimezone);
      result.isRequestedTimezoneChangeTooFrequently = this._isChangingTooFrequently(lastTimezoneChangeDate, now);
      result.isDailyTimezoneChangeLimitExceeded = this._isDailyChangeLimitExceeded(
        lastTimezoneChangeDate, 
        dailyTimezoneChanges, 
        now, 
        currentTimezone
      );

      // Determine accepted timezone
      if (result.isRequestedTimezoneValid && 
          !result.isRequestedTimezoneSuspiciousJump && 
          !result.isRequestedTimezoneChangeTooFrequently &&
          !result.isDailyTimezoneChangeLimitExceeded) {
        result.acceptedTimezone = requestedTimezone;
        result.shouldChangeTimezone = true;
        log(`[${requestId}] Timezone change accepted: ${currentTimezone} → ${requestedTimezone}`);
      } else {
        result.acceptedTimezone = currentTimezone;
        const reasons = [];
        if (!result.isRequestedTimezoneValid) reasons.push('invalid timezone');
        if (result.isRequestedTimezoneSuspiciousJump) reasons.push('suspicious jump');
        if (result.isRequestedTimezoneChangeTooFrequently) reasons.push('too frequent change');
        if (result.isDailyTimezoneChangeLimitExceeded) reasons.push('daily limit exceeded');
        log(`[${requestId}] Timezone change rejected: ${reasons.join(', ')}`);
      }

      log(`[${requestId}] Timezone validation completed`);
      return result;

    } catch (error) {
      log(`[${requestId}] ERROR: ${error.message}`);
      throw error;
    }
  }

  // ===========================================
  // TIMEZONE VALIDATION HELPERS
  // ===========================================

  /**
   * Is timezone change too frequent? (within cooldown period)
   */
  _isChangingTooFrequently(lastTimezoneChangeDate, now) {
    if (!lastTimezoneChangeDate) return false;

    const lastChange = new Date(lastTimezoneChangeDate);
    if (isNaN(lastChange.getTime())) {
      return false;
    }
    
    const hoursSince = (now - lastChange) / (1000 * 60 * 60);
    return hoursSince < TIMEZONE_CONFIG.TIMEZONE_CHANGE_COOLDOWN_HOURS;
  }

  /**
   * Is timezone jump suspicious? (too big difference)
   */
  _isSuspiciousJump(currentTimezone, requestedTimezone) {
    if (!currentTimezone) return false;
    
    const currentOffset = this._parseOffset(currentTimezone);
    const requestedOffset = this._parseOffset(requestedTimezone);
    const hourDiff = Math.abs(requestedOffset - currentOffset) / 60;

    return hourDiff >= TIMEZONE_CONFIG.SUSPICIOUS_JUMP_THRESHOLD_HOURS;
  }

  /**
   * Has daily timezone change limit been exceeded?
   */
  _isDailyChangeLimitExceeded(lastTimezoneChangeDate, dailyTimezoneChanges, now, currentTimezone) {
    // If no previous changes, definitely not exceeded
    if (!lastTimezoneChangeDate || dailyTimezoneChanges === 0) {
      return false;
    }

    // Check if last change was today
    const lastChangeDate = new Date(lastTimezoneChangeDate);
    if (isNaN(lastChangeDate.getTime())) {
      return false;
    }

    const lastChangeDateInUserTZ = this._getTodayInTimezone(lastChangeDate, currentTimezone);
    const todayInUserTZ = this._getTodayInTimezone(now, currentTimezone);

    // If last change was not today, reset the count
    if (lastChangeDateInUserTZ !== todayInUserTZ) {
      return false;
    }

    // Check if daily limit exceeded
    return dailyTimezoneChanges >= TIMEZONE_CONFIG.MAX_DAILY_TIMEZONE_CHANGES;
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
   * Is timezone offset valid?
   */
  _isValidTimezone(offsetString) {
    const offset = this._parseOffset(offsetString);
    return offset >= TIMEZONE_CONFIG.MIN_TIMEZONE_OFFSET && 
           offset <= TIMEZONE_CONFIG.MAX_TIMEZONE_OFFSET;
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
   * Get next reset time in UTC (tomorrow 00:00 in user's timezone)
   */
  _getNextResetTime(timezoneOffset) {
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
  _getHoursUntilNextReset(timezoneOffset) {
    const now = new Date();
    const nextReset = this._getNextResetTime(timezoneOffset);
    return Math.ceil((nextReset - now) / (1000 * 60 * 60));
  }

  /**
   * Format timezone offset for display
   */
  formatTimezone(offsetString) {
    const offset = this._parseOffset(offsetString);
    if (offset === 0) return 'UTC';

    const sign = offset > 0 ? '+' : '-';
    const hours = Math.abs(offset) / 60;
    
    if (hours % 1 !== 0) {
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours % 1) * 60);
      return `UTC${sign}${wholeHours}:${minutes.toString().padStart(2, '0')}`;
    }
    
    return `UTC${sign}${hours}`;
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
   * Get current date in specific timezone
   */
  getCurrentDateInTimezone(timezoneOffset) {
    const now = new Date();
    return this._getTodayInTimezone(now, timezoneOffset);
  }

  /**
   * Validate timezone offset format
   */
  isValidTimezoneFormat(timezone) {
    return this._isValidTimezone(timezone);
  }

  /**
   * Parse and normalize timezone offset
   */
  normalizeTimezoneOffset(timezone) {
    return this._parseOffset(timezone);
  }
}

export default new TimezoneValidationTool();