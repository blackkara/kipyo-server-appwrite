// services/appwrite/quota/QuotaManager.js

/**
 * Manages daily quotas with timezone-aware resets and fraud detection
 */
export class QuotaManager {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.documentOps = dependencies.documentOperations;
    this.postHog = dependencies.postHogService;

    // Quota configuration
    this.quotaTypes = {
      TRANSLATE: {
        name: 'translate',
        dailyLimit: 100,
        field: 'dailyTranslateRemaining'
      },
      DIRECT_MESSAGE: {
        name: 'directMessage',
        dailyLimit: 3,
        field: 'dailyDirectMessageRemaining'
      }
    };

    // Fraud detection thresholds
    this.fraudThresholds = {
      maxTimezoneChangesPerDay: 2,
      maxTimezoneOffsetChange: 360, // 6 hours max change in one update
      suspiciousPatternWindow: 3600000 // 1 hour window for pattern detection
    };
  }

  /**
 * Get quota status for all or specific quota types without consuming
 * @param {string} jwtToken - User JWT token
 * @param {string} userId - User ID
 * @param {Array<string>} quotaTypes - Optional array of specific quota types to check. If not provided, returns all.
 * @returns {Promise<Object>} - Object containing status for each requested quota type
 */
  async getAllQuotaStatuses(jwtToken, userId, quotaTypes = null) {
    try {
      // Get user profile once
      const profile = await this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Determine which quota types to check
      const typesToCheck = quotaTypes || Object.keys(this.quotaTypes);
      const results = {};
      const summary = {
        totalQuotas: 0,
        totalRemaining: 0,
        totalUsed: 0,
        timezoneOffset: profile.timezoneOffset || 0,
        isSuspended: profile.quotaSuspended || false
      };

      // Check if user is suspended
      if (summary.isSuspended) {
        return {
          success: false,
          suspended: true,
          suspensionReason: profile.quotaSuspensionReason,
          suspensionDate: profile.quotaSuspensionDate,
          message: 'Quota access is temporarily restricted due to suspicious activity'
        };
      }

      // Process each quota type
      for (const type of typesToCheck) {
        const quotaConfig = this.quotaTypes[type.toUpperCase()] || this.quotaTypes[type];

        if (!quotaConfig) {
          results[type] = {
            error: `Invalid quota type: ${type}`
          };
          continue;
        }

        // Check if quota needs reset
        const resetCheck = this.shouldResetQuota(profile, quotaConfig);
        let currentQuota = profile[quotaConfig.field];

        if (resetCheck.shouldReset || currentQuota === undefined || currentQuota === null) {
          currentQuota = quotaConfig.dailyLimit;
        }

        const nextReset = this.getNextResetTime(profile.timezoneOffset || 0);
        const used = quotaConfig.dailyLimit - currentQuota;

        results[quotaConfig.name] = {
          remaining: currentQuota,
          dailyLimit: quotaConfig.dailyLimit,
          used: used,
          percentageUsed: Math.round((used / quotaConfig.dailyLimit) * 100),
          percentageRemaining: Math.round((currentQuota / quotaConfig.dailyLimit) * 100),
          nextResetAt: nextReset.toISOString(),
          nextResetIn: this.getTimeUntilReset(nextReset),
          lastUsed: profile[`${quotaConfig.field}LastUsed`] || null
        };

        // Update summary
        summary.totalQuotas += quotaConfig.dailyLimit;
        summary.totalRemaining += currentQuota;
        summary.totalUsed += used;
      }

      // Calculate overall percentages
      if (summary.totalQuotas > 0) {
        summary.overallPercentageUsed = Math.round((summary.totalUsed / summary.totalQuotas) * 100);
        summary.overallPercentageRemaining = Math.round((summary.totalRemaining / summary.totalQuotas) * 100);
      }

      return {
        success: true,
        quotas: results,
        summary: summary,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.log(`Get all quota statuses failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a quick summary of quota usage across all types
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Quick summary of quota usage
   */
  async getQuotaSummary(jwtToken, userId) {
    try {
      const profile = await this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );

      if (!profile) {
        throw new Error('User profile not found');
      }

      const summary = {
        translate: {
          available: profile.dailyTranslateRemaining !== undefined ? profile.dailyTranslateRemaining : this.quotaTypes.TRANSLATE.dailyLimit,
          limit: this.quotaTypes.TRANSLATE.dailyLimit
        },
        directMessage: {
          available: profile.dailyDirectMessageRemaining !== undefined ? profile.dailyDirectMessageRemaining : this.quotaTypes.DIRECT_MESSAGE.dailyLimit,
          limit: this.quotaTypes.DIRECT_MESSAGE.dailyLimit
        },
        canTranslate: false,
        canSendMessage: false,
        nextResetIn: null
      };

      // Check availability
      summary.canTranslate = summary.translate.available > 0;
      summary.canSendMessage = summary.directMessage.available > 0;

      // Get next reset time
      const nextReset = this.getNextResetTime(profile.timezoneOffset || 0);
      summary.nextResetIn = this.getTimeUntilReset(nextReset);

      return summary;

    } catch (error) {
      this.log(`Get quota summary failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check multiple quota types at once without consuming
   * Useful for UI elements that need to show multiple quota states
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Formatted response for UI consumption
   */
  async getQuotaDashboard(jwtToken, userId) {
    try {
      const allStatuses = await this.getAllQuotaStatuses(jwtToken, userId);

      if (!allStatuses.success) {
        return allStatuses;
      }

      // Format for UI dashboard
      const dashboard = {
        cards: [],
        alerts: [],
        nextReset: null
      };

      // Create cards for each quota type
      for (const [type, status] of Object.entries(allStatuses.quotas)) {
        const card = {
          type: type,
          title: type === 'translate' ? 'Translations' : 'Direct Messages',
          icon: type === 'translate' ? '🌐' : '✉️',
          remaining: status.remaining,
          total: status.dailyLimit,
          used: status.used,
          progressBar: {
            percentage: status.percentageRemaining,
            color: status.percentageRemaining > 50 ? 'green' :
              status.percentageRemaining > 20 ? 'yellow' : 'red'
          },
          status: status.remaining === 0 ? 'exhausted' :
            status.remaining < (status.dailyLimit * 0.2) ? 'low' : 'available'
        };

        dashboard.cards.push(card);

        // Add alerts for low quotas
        if (status.remaining === 0) {
          dashboard.alerts.push({
            type: 'error',
            message: `${card.title} quota exhausted. Resets in ${status.nextResetIn}`
          });
        } else if (status.remaining < (status.dailyLimit * 0.2)) {
          dashboard.alerts.push({
            type: 'warning',
            message: `Low ${card.title} quota: ${status.remaining} remaining`
          });
        }

        // Set next reset time (same for all quotas)
        if (!dashboard.nextReset) {
          dashboard.nextReset = {
            time: status.nextResetAt,
            relative: status.nextResetIn
          };
        }
      }

      // Add summary info
      dashboard.summary = {
        totalAvailable: allStatuses.summary.totalRemaining,
        totalUsed: allStatuses.summary.totalUsed,
        overallUsage: allStatuses.summary.overallPercentageUsed + '%',
        timezoneOffset: allStatuses.summary.timezoneOffset
      };

      return dashboard;

    } catch (error) {
      this.log(`Get quota dashboard failed: ${error.message}`);
      throw error;
    }
  }


  /**
   * Check and consume quota for a user
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @param {string} quotaType - Type of quota to check
   * @param {number} amount - Amount to consume (default 1)
   * @returns {Promise<Object>} - Quota status and consumption result with all quotas status
   */
  async checkAndConsumeQuota(jwtToken, userId, quotaType, amount = 1) {
    try {
      const quotaConfig = this.quotaTypes[quotaType];
      if (!quotaConfig) {
        throw new Error(`Invalid quota type: ${quotaType}`);
      }

      // Get user profile
      const profile = await this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Check for timezone manipulation
      const fraudCheck = await this.detectTimezoneManipulation(jwtToken, userId, profile);
      if (fraudCheck.isSuspicious) {
        await this.handleSuspiciousActivity(jwtToken, userId, fraudCheck);
        throw new Error('Suspicious timezone activity detected. Quota access temporarily restricted.');
      }

      // Check if quota needs reset
      const resetCheck = this.shouldResetQuota(profile, quotaConfig);

      let currentQuota = profile[quotaConfig.field];
      let lastResetDate = profile[`${quotaConfig.field}ResetDate`];

      if (resetCheck.shouldReset) {
        // Reset quota
        currentQuota = quotaConfig.dailyLimit;
        lastResetDate = resetCheck.resetDate;

        // Update profile with reset
        await this.documentOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId,
          {
            [quotaConfig.field]: currentQuota,
            [`${quotaConfig.field}ResetDate`]: lastResetDate
          }
        );

        this.log(`Reset ${quotaConfig.name} quota for user ${userId}`);
      }

      // Check if user has enough quota
      if (currentQuota === undefined || currentQuota === null) {
        // First time user - initialize quota
        currentQuota = quotaConfig.dailyLimit;
        lastResetDate = new Date().toISOString();

        await this.documentOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId,
          {
            [quotaConfig.field]: currentQuota,
            [`${quotaConfig.field}ResetDate`]: lastResetDate
          }
        );
      }

      if (currentQuota < amount) {
        const nextReset = this.getNextResetTime(profile.timezoneOffset || 0);

        // Get all quota statuses even on failure
        const allQuotaStatuses = await this.getAllQuotaStatuses(jwtToken, userId);

        return {
          success: false,
          quotaExceeded: true,
          remaining: currentQuota,
          dailyLimit: quotaConfig.dailyLimit,
          nextResetAt: nextReset.toISOString(),
          nextResetIn: this.getTimeUntilReset(nextReset),
          message: `Daily ${quotaConfig.name} quota exceeded. Resets at ${nextReset.toLocaleString()}`,
          allQuotas: allQuotaStatuses
        };
      }

      // Consume quota
      const newQuota = currentQuota - amount;

      await this.documentOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        {
          [quotaConfig.field]: newQuota,
          [`${quotaConfig.field}LastUsed`]: new Date().toISOString()
        }
      );

      const nextReset = this.getNextResetTime(profile.timezoneOffset || 0);

      // Track quota usage
      await this.trackQuotaUsage(userId, quotaType, amount, newQuota);

      // Get all quota statuses after successful consumption
      const allQuotaStatuses = await this.getAllQuotaStatuses(jwtToken, userId);

      return {
        success: true,
        quotaConsumed: amount,
        remaining: newQuota,
        dailyLimit: quotaConfig.dailyLimit,
        nextResetAt: nextReset.toISOString(),
        nextResetIn: this.getTimeUntilReset(nextReset),
        allQuotas: allQuotaStatuses
      };

    } catch (error) {
      this.log(`Quota check failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if quota should be reset based on user's timezone
   * @private
   */
  /**
   * Check if quota should be reset based on user's timezone
   * @private
   */
  shouldResetQuota(profile, quotaConfig) {
    const timezoneOffset = profile.timezoneOffset || 0; // dakika cinsinden
    const lastResetDate = profile[`${quotaConfig.field}ResetDate`];

    // Şu anki UTC zamanı
    const nowUTC = new Date();

    // Kullanıcının şu anki yerel zamanı
    const userLocalTime = new Date(nowUTC.getTime() + (timezoneOffset * 60 * 1000));

    // Kullanıcının bugünü (YYYY-MM-DD formatında)
    const userToday = userLocalTime.toISOString().split('T')[0];

    if (!lastResetDate) {
      // İlk reset - kullanıcının bugün gece yarısını UTC'ye çevir
      const userMidnightLocal = new Date(userToday + 'T00:00:00.000Z');
      const userMidnightUTC = new Date(userMidnightLocal.getTime() - (timezoneOffset * 60 * 1000));

      return {
        shouldReset: true,
        resetDate: userMidnightUTC.toISOString()
      };
    }

    // Son reset tarihini kullanıcı timezone'una çevir
    const lastResetUTC = new Date(lastResetDate);
    const lastResetLocal = new Date(lastResetUTC.getTime() + (timezoneOffset * 60 * 1000));

    // Son reset'in günü (YYYY-MM-DD formatında)
    const lastResetDay = lastResetLocal.toISOString().split('T')[0];

    // Farklı günlerdeyse reset yap
    if (userToday !== lastResetDay) {
      const userMidnightLocal = new Date(userToday + 'T00:00:00.000Z');
      const userMidnightUTC = new Date(userMidnightLocal.getTime() - (timezoneOffset * 60 * 1000));

      return {
        shouldReset: true,
        resetDate: userMidnightUTC.toISOString()
      };
    }

    return {
      shouldReset: false
    };
  }

  /**
   * Get next reset time for user's timezone
   * @private
   */
  getNextResetTime(timezoneOffset) {
    const userNow = this.getUserCurrentTime(timezoneOffset);

    // Set to next midnight in user's timezone
    const nextReset = new Date(userNow);
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    nextReset.setUTCHours(0, 0, 0, 0);

    // Convert back to server time
    return this.convertToServerTime(nextReset, timezoneOffset);
  }

  /**
   * Get time until reset in human-readable format
   * @private
   */
  getTimeUntilReset(resetTime) {
    const now = new Date();
    const diff = resetTime - now;

    if (diff <= 0) return 'now';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Detect timezone manipulation for fraud prevention
   * @private
   */
  async detectTimezoneManipulation(jwtToken, userId, profile) {
    const result = {
      isSuspicious: false,
      reasons: [],
      score: 0
    };

    const currentOffset = profile.timezoneOffset || 0;
    const lastChangeDate = profile.timezoneChangeDate;
    const totalChangesToday = profile.timezoneTotalChanges || 0;
    const lastOffset = profile.lastTimezoneOffset;

    // Check for too many changes in one day
    if (totalChangesToday >= this.fraudThresholds.maxTimezoneChangesPerDay) {
      result.isSuspicious = true;
      result.reasons.push('Too many timezone changes today');
      result.score += 50;
    }

    // Check for unrealistic timezone jumps
    if (lastOffset !== undefined && lastOffset !== null) {
      const offsetChange = Math.abs(currentOffset - lastOffset);

      if (offsetChange > this.fraudThresholds.maxTimezoneOffsetChange) {
        result.isSuspicious = true;
        result.reasons.push(`Unrealistic timezone change: ${offsetChange} minutes`);
        result.score += 70;
      }
    }

    // Check for rapid changes (changing timezone within short window)
    if (lastChangeDate) {
      const timeSinceLastChange = Date.now() - new Date(lastChangeDate).getTime();

      if (timeSinceLastChange < this.fraudThresholds.suspiciousPatternWindow) {
        result.isSuspicious = true;
        result.reasons.push('Rapid timezone changes detected');
        result.score += 30;
      }
    }

    // Check for pattern of changing timezone around quota reset times
    const quotaHistory = await this.getQuotaUsageHistory(jwtToken, userId);
    if (this.detectResetTimeManipulation(quotaHistory, profile)) {
      result.isSuspicious = true;
      result.reasons.push('Pattern of timezone changes around quota resets');
      result.score += 80;
    }

    return result;
  }

  /**
   * Handle suspicious activity
   * @private
   */
  async handleSuspiciousActivity(jwtToken, userId, fraudCheck) {
    // Log suspicious activity
    this.log(`Suspicious timezone activity for user ${userId}:`, fraudCheck);

    // Track in analytics
    if (this.postHog) {
      await this.postHog.trackBusinessEvent('QUOTA_FRAUD_DETECTED', {
        user_id: userId,
        reasons: fraudCheck.reasons,
        score: fraudCheck.score
      });
    }

    // Update user profile with suspension
    await this.documentOps.updateDocument(
      jwtToken,
      process.env.DB_COLLECTION_PROFILES_ID,
      userId,
      {
        quotaSuspended: true,
        quotaSuspensionReason: fraudCheck.reasons.join(', '),
        quotaSuspensionDate: new Date().toISOString(),
        quotaSuspensionScore: fraudCheck.score
      }
    );
  }

  /**
   * Update timezone for a user with fraud checks
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @param {number} newOffset - New timezone offset in minutes
   * @returns {Promise<Object>} - Update result
   */
  async updateUserTimezone(jwtToken, userId, newOffset) {
    try {
      // Validate offset
      if (!this.isValidTimezoneOffset(newOffset)) {
        throw new Error('Invalid timezone offset');
      }

      // Get current profile
      const profile = await this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );

      if (!profile) {
        throw new Error('User profile not found');
      }

      const currentOffset = profile.timezoneOffset || 0;
      const lastChangeDate = profile.timezoneChangeDate;
      let totalChangesToday = profile.timezoneTotalChanges || 0;

      // Check if it's a new day for reset counter
      if (lastChangeDate) {
        const lastChange = new Date(lastChangeDate);
        const now = new Date();

        if (lastChange.toDateString() !== now.toDateString()) {
          totalChangesToday = 0;
        }
      }

      // Increment change counter
      totalChangesToday++;

      // Update profile
      const updateData = {
        timezoneOffset: newOffset,
        lastTimezoneOffset: currentOffset,
        timezoneChangeDate: new Date().toISOString(),
        timezoneTotalChanges: totalChangesToday
      };

      await this.documentOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        updateData
      );

      // Check for suspicious activity
      const updatedProfile = { ...profile, ...updateData };
      const fraudCheck = await this.detectTimezoneManipulation(jwtToken, userId, updatedProfile);

      return {
        success: true,
        newOffset,
        previousOffset: currentOffset,
        changesToday: totalChangesToday,
        isSuspicious: fraudCheck.isSuspicious,
        suspicionReasons: fraudCheck.reasons
      };

    } catch (error) {
      this.log(`Timezone update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get quota status for a user without consuming
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @param {string} quotaType - Type of quota to check
   * @returns {Promise<Object>} - Current quota status
   */
  async getQuotaStatus(jwtToken, userId, quotaType) {
    try {
      const quotaConfig = this.quotaTypes[quotaType];
      if (!quotaConfig) {
        throw new Error(`Invalid quota type: ${quotaType}`);
      }

      const profile = await this.documentOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Check if quota needs reset
      const resetCheck = this.shouldResetQuota(profile, quotaConfig);

      let currentQuota = profile[quotaConfig.field];

      if (resetCheck.shouldReset || currentQuota === undefined || currentQuota === null) {
        currentQuota = quotaConfig.dailyLimit;
      }

      const nextReset = this.getNextResetTime(profile.timezoneOffset || 0);

      return {
        quotaType: quotaConfig.name,
        remaining: currentQuota,
        dailyLimit: quotaConfig.dailyLimit,
        used: quotaConfig.dailyLimit - currentQuota,
        nextResetAt: nextReset.toISOString(),
        nextResetIn: this.getTimeUntilReset(nextReset),
        timezoneOffset: profile.timezoneOffset || 0
      };

    } catch (error) {
      this.log(`Get quota status failed: ${error.message}`);
      throw error;
    }
  }

  // Helper methods

  /**
   * Get user's current time based on their timezone offset
   * @private
   */
  getUserCurrentTime(timezoneOffset) {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc - (timezoneOffset * 60000));
  }

  /**
   * Convert a date to user's timezone
   * @private
   */
  getUserTime(date, timezoneOffset) {
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    return new Date(utc - (timezoneOffset * 60000));
  }

  /**
   * Convert user time back to server time
   * @private
   */
  convertToServerTime(userDate, timezoneOffset) {
    return new Date(userDate.getTime() + (timezoneOffset * 60000));
  }

  /**
   * Validate timezone offset
   * @private
   */
  isValidTimezoneOffset(offset) {
    // Valid timezone offsets range from -720 to +840 minutes (-12 to +14 hours)
    return typeof offset === 'number' && offset >= -720 && offset <= 840;
  }

  /**
   * Get quota usage history (placeholder for future implementation)
   * @private
   */
  async getQuotaUsageHistory(jwtToken, userId) {
    // This would fetch historical quota usage data
    // For now, return empty array
    return [];
  }

  /**
   * Detect pattern of timezone changes around reset times
   * @private
   */
  detectResetTimeManipulation(history, profile) {
    // Analyze historical data for patterns
    // For now, return false
    return false;
  }

  /**
   * Track quota usage for analytics
   * @private
   */
  async trackQuotaUsage(userId, quotaType, amount, remaining) {
    if (!this.postHog) return;

    try {
      await this.postHog.trackBusinessEvent('QUOTA_CONSUMED', {
        user_id: userId,
        quota_type: quotaType,
        amount_consumed: amount,
        remaining_quota: remaining
      });
    } catch (error) {
      this.log('Failed to track quota usage:', error.message);
    }
  }

  /**
   * Reset all quotas for a user (admin function)
   * @param {string} jwtToken - Admin JWT token
   * @param {string} userId - User ID to reset
   * @returns {Promise<Object>} - Reset result
   */
  async resetUserQuotas(jwtToken, userId) {
    try {
      const resetData = {};

      for (const [key, config] of Object.entries(this.quotaTypes)) {
        resetData[config.field] = config.dailyLimit;
        resetData[`${config.field}ResetDate`] = new Date().toISOString();
      }

      await this.documentOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        resetData
      );

      this.log(`Reset all quotas for user ${userId}`);

      return {
        success: true,
        quotasReset: Object.keys(this.quotaTypes),
        resetData
      };

    } catch (error) {
      this.log(`Failed to reset quotas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear suspension for a user (admin function)
   * @param {string} jwtToken - Admin JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Clear result
   */
  async clearSuspension(jwtToken, userId) {
    try {
      await this.documentOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId,
        {
          quotaSuspended: false,
          quotaSuspensionReason: null,
          quotaSuspensionDate: null,
          quotaSuspensionScore: 0,
          timezoneTotalChanges: 0
        }
      );

      this.log(`Cleared suspension for user ${userId}`);

      return {
        success: true,
        message: 'Suspension cleared successfully'
      };

    } catch (error) {
      this.log(`Failed to clear suspension: ${error.message}`);
      throw error;
    }
  }
}

export default QuotaManager;