/**
 * Manages daily quotas with timezone-aware resets and fraud detection
 */
export class QuotaManager {
  constructor(dependencies = {}) {
    this.log = dependencies.logger || console.log;
    this.adminOps = dependencies.adminOperations;
    this.postHog = dependencies.postHogService;

    // Log prefix for filtering
    this.LOG_PREFIX = '[QUOTA_MANAGER]';

    // Fraud detection thresholds
    this.fraudThresholds = {
      maxTimezoneChangesPerDay: 2,
      maxTimezoneOffsetChange: 360, // 6 hours max change in one update
      suspiciousPatternWindow: 3600000 // 1 hour window for pattern detection
    };
  }

  /**
   * Enhanced logging method with prefix and metadata
   * @private
   */
  _log(message, data = null, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      prefix: this.LOG_PREFIX,
      timestamp,
      level,
      message,
      ...(data && { data })
    };

    // Format log output
    const formattedLog = `${this.LOG_PREFIX} [${level}] [${timestamp}] ${message}`;

    if (data) {
      this.log(formattedLog, data);
    } else {
      this.log(formattedLog);
    }
  }

  /**
   * Log error with stack trace
   * @private
   */
  _logError(message, error, additionalData = null) {
    this._log(message, {
      error: error.message,
      stack: error.stack,
      ...additionalData
    }, 'ERROR');
  }

  /**
   * Log warning
   * @private
   */
  _logWarning(message, data = null) {
    this._log(message, data, 'WARNING');
  }

  /**
   * Log debug information
   * @private
   */
  _logDebug(message, data = null) {
    this._log(message, data, 'DEBUG');
  }

  /**
   * Get quota status for all or specific quota types without consuming
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @param {Array<string>} quotaTypes - Optional array of specific quota types to check. If not provided, returns all.
   * @returns {Promise<Object>} - Object containing status for each requested quota type
   */
  async getAllQuotaStatuses(jwtToken, userId, quotaTypes = null) {
    this._logDebug('Getting all quota statuses', { userId, quotaTypes });

    try {
      // Get user profile once
      const profile = await this.getFullProfile(jwtToken, userId);
      const timezoneTracking = profile.timezoneTracking || {};
      const allQuotas = profile.quotas || [];

      if (!profile) {
        this._logError('User profile not found', new Error('Profile not found'), { userId });
        throw new Error('User profile not found');
      }

      // Determine which quota types to check - use actual quota documents
      const quotasToProcess = quotaTypes ?
        allQuotas.filter(q => quotaTypes.includes(q.quotaType)) :
        allQuotas;

      this._logDebug('Processing quotas', {
        userId,
        totalQuotas: allQuotas.length,
        quotasToProcess: quotasToProcess.length
      });

      // Check for suspicious timezone activity
      const fraudCheck = await this.detectTimezoneManipulation(jwtToken, userId, profile);

      let safeTimezoneOffset = timezoneTracking.timezoneOffset || 0;

      if (fraudCheck.isSuspicious) {
        // Use safe timezone (previous trusted timezone)
        safeTimezoneOffset = timezoneTracking.previousOffset || 0;

        this._logWarning('Using safe timezone for quota status', {
          userId,
          suspiciousTimezone: timezoneTracking.timezoneOffset,
          safeTimezone: safeTimezoneOffset,
          fraudScore: fraudCheck.score,
          reasons: fraudCheck.reasons
        });
      }

      const results = {};
      const summary = {
        totalQuotas: 0,
        totalRemaining: 0,
        totalUsed: 0,
        timezoneOffset: safeTimezoneOffset,
        isSuspended: profile.quotaSuspended || false,
        suspensionReason: profile.quotaSuspensionReason,
        suspensionDate: profile.quotaSuspensionDate
      };

      //Check if user is suspended
      if (summary.isSuspended) {
        this._logWarning('User is suspended', {
          userId,
          reason: profile.quotaSuspensionReason,
          date: profile.quotaSuspensionDate
        });

        return {
          success: false,
          suspended: true,
          suspensionReason: profile.quotaSuspensionReason,
          suspensionDate: profile.quotaSuspensionDate,
          message: 'Quota access is temporarily restricted due to suspicious activity'
        };
      }

      // Process each quota document from the database
      for (const quotaDoc of quotasToProcess) {
        const quotaType = quotaDoc.quotaType;
        const quotaName = quotaType.toLowerCase().replace(/_/g, '');

        // Check if quota needs reset based on resetDate in document - using SAFE timezone
        const resetCheck = this.shouldResetQuota(safeTimezoneOffset, quotaDoc.resetDate);
        let currentRemaining = quotaDoc.remainingCount;

        if (resetCheck.shouldReset || currentRemaining === undefined || currentRemaining === null) {
          currentRemaining = quotaDoc.dailyLimit;

          // Reset date'i kontrol et
          const newResetDate = resetCheck.resetDate || this.getNextResetTime(safeTimezoneOffset).toISOString();

          this._logDebug('Resetting quota in database', {
            userId,
            quotaType,
            quotaId: quotaDoc.$id,
            newRemaining: currentRemaining,
            newResetDate,
            usedTimezone: safeTimezoneOffset
          });

          // Database'i güncelle
          await this.adminOps.updateDocument(
            jwtToken,
            process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
            quotaDoc.$id,
            {
              remainingCount: currentRemaining,
              resetDate: newResetDate,
              lastUsed: null
            }
          );

          // Güncellenen değeri kullan
          quotaDoc.resetDate = newResetDate;
        }

        const nextReset = this.getNextResetTime(safeTimezoneOffset);
        const used = quotaDoc.dailyLimit - currentRemaining;

        results[quotaName] = {
          documentId: quotaDoc.$id,
          quotaType: quotaType,
          remaining: currentRemaining,
          dailyLimit: quotaDoc.dailyLimit,
          used: used,
          percentageUsed: Math.round((used / quotaDoc.dailyLimit) * 100),
          percentageRemaining: Math.round((currentRemaining / quotaDoc.dailyLimit) * 100),
          nextResetAt: nextReset.toISOString(),
          nextResetIn: this.getTimeUntilReset(nextReset),
          lastUsed: quotaDoc.lastUsed || null,
          resetDate: quotaDoc.resetDate
        };

        // Update summary
        summary.totalQuotas += quotaDoc.dailyLimit;
        summary.totalRemaining += currentRemaining;
        summary.totalUsed += used;
      }

      // Calculate overall percentages
      if (summary.totalQuotas > 0) {
        summary.overallPercentageUsed = Math.round((summary.totalUsed / summary.totalQuotas) * 100);
        summary.overallPercentageRemaining = Math.round((summary.totalRemaining / summary.totalQuotas) * 100);
      }

      this._log('Successfully retrieved all quota statuses', {
        userId,
        quotaCount: Object.keys(results).length,
        totalRemaining: summary.totalRemaining,
        usedSafeTimezone: fraudCheck.isSuspicious
      });

      return {
        success: true,
        quotas: results,
        summary: summary,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this._logError('Get all quota statuses failed', error, { userId });
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
    this._logDebug('Getting quota summary', { userId });

    try {
      const profile = await this.getFullProfile(jwtToken, userId);
      const quotas = profile.quotas || [];
      const timezoneTracking = profile.timezoneTracking || {};

      if (!profile) {
        this._logError('User profile not found', new Error('Profile not found'), { userId });
        throw new Error('User profile not found');
      }

      const summary = {
        quotas: {},
        canPerformActions: {},
        nextResetIn: null
      };

      // Process each quota document
      for (const quotaDoc of quotas) {
        const quotaName = quotaDoc.quotaType.toLowerCase().replace(/_/g, '');

        // Check if quota needs reset
        const resetCheck = this.shouldResetQuota(timezoneTracking.timezoneOffset, quotaDoc.resetDate);
        let currentRemaining = quotaDoc.remainingCount;

        if (resetCheck.shouldReset || currentRemaining === undefined || currentRemaining === null) {
          currentRemaining = quotaDoc.dailyLimit;
        }

        summary.quotas[quotaName] = {
          available: currentRemaining,
          limit: quotaDoc.dailyLimit,
          quotaType: quotaDoc.quotaType
        };

        // Set action availability
        summary.canPerformActions[quotaName] = currentRemaining > 0;
      }

      // Get next reset time
      const nextReset = this.getNextResetTime(timezoneTracking.timezoneOffset || 0);
      summary.nextResetIn = this.getTimeUntilReset(nextReset);

      this._log('Successfully retrieved quota summary', { userId });

      return summary;

    } catch (error) {
      this._logError('Get quota summary failed', error, { userId });
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
    this._logDebug('Getting quota dashboard', { userId });

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
        // Generate user-friendly title based on quota type
        const getTitle = (quotaName) => {
          const titles = {
            'translate': 'Translations',
            'directmessage': 'Direct Messages',
            'direct_message': 'Direct Messages'
          };
          return titles[quotaName.toLowerCase()] || quotaName;
        };

        // Generate icon based on quota type
        const getIcon = (quotaName) => {
          const icons = {
            'translate': '🌐',
            'directmessage': '✉️',
            'direct_message': '✉️'
          };
          return icons[quotaName.toLowerCase()] || '📊';
        };

        const card = {
          type: type,
          quotaType: status.quotaType,
          title: getTitle(type),
          icon: getIcon(type),
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

      this._log('Successfully retrieved quota dashboard', {
        userId,
        cardCount: dashboard.cards.length,
        alertCount: dashboard.alerts.length
      });

      return dashboard;

    } catch (error) {
      this._logError('Get quota dashboard failed', error, { userId });
      throw error;
    }
  }


  /**
   * Check and consume quota for a user
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @param {string} quotaType - Type of quota to check (e.g., 'TRANSLATE', 'DIRECT_MESSAGE')
   * @param {number} amount - Amount to consume (default 1)
   * @returns {Promise<Object>} - Quota status and consumption result with all quotas status
   */
  async checkAndConsumeQuota(jwtToken, userId, quotaType, amount = 1) {
    this._log('Checking and consuming quota', { userId, quotaType, amount });

    try {
      // Get user profile with quotas
      const profile = await this.getFullProfile(jwtToken, userId);

      if (!profile) {
        this._logError('User profile not found', new Error('Profile not found'), { userId });
        throw new Error('User profile not found');
      }

      // Find the specific quota document
      const quotas = profile.quotas || [];
      const quotaDoc = quotas.find(q => q.quotaType === quotaType);

      if (!quotaDoc) {
        this._logError('Quota type not found', new Error('Quota not found'), { userId, quotaType });
        throw new Error(`Quota type ${quotaType} not found for user`);
      }

      // Check for timezone manipulation
      const fraudCheck = await this.detectTimezoneManipulation(jwtToken, userId, profile);

      const timezoneTracking = profile.timezoneTracking || {};
      let safeTimezoneOffset = timezoneTracking.timezoneOffset || 0;

      if (fraudCheck.isSuspicious) {
        // Use safe timezone (previous trusted timezone)
        safeTimezoneOffset = timezoneTracking.previousOffset || 0;

        this._logWarning('Using safe timezone for quota consumption', {
          userId,
          quotaType,
          suspiciousTimezone: timezoneTracking.timezoneOffset,
          safeTimezone: safeTimezoneOffset,
          fraudScore: fraudCheck.score,
          reasons: fraudCheck.reasons
        });
      }

      // Check if quota needs reset - using SAFE timezone
      const resetCheck = this.shouldResetQuota(safeTimezoneOffset, quotaDoc.resetDate);

      let currentRemaining = quotaDoc.remainingCount;
      let resetDate = quotaDoc.resetDate;

      if (resetCheck.shouldReset) {
        // Reset quota
        currentRemaining = quotaDoc.dailyLimit;
        resetDate = resetCheck.resetDate;

        // Update quota document with reset
        await this.adminOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
          quotaDoc.$id,
          {
            remainingCount: currentRemaining,
            resetDate: resetDate,
            lastUsed: null
          }
        );

        this._log('Reset quota', {
          userId,
          quotaType,
          newRemaining: currentRemaining,
          resetDate,
          usedTimezone: safeTimezoneOffset
        });
      }

      // Check if user has enough quota
      if (currentRemaining === undefined || currentRemaining === null) {
        // Initialize quota if not set
        currentRemaining = quotaDoc.dailyLimit;
        resetDate = new Date().toISOString();

        await this.adminOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
          quotaDoc.$id,
          {
            remainingCount: currentRemaining,
            resetDate: resetDate
          }
        );

        this._log('Initialized quota', { userId, quotaType, remaining: currentRemaining });
      }

      if (currentRemaining < amount) {
        const nextReset = this.getNextResetTime(safeTimezoneOffset);

        this._logWarning('Quota exceeded', {
          userId,
          quotaType,
          remaining: currentRemaining,
          requested: amount,
          nextResetAt: nextReset.toISOString()
        });

        // Get all quota statuses even on failure
        const allQuotaStatuses = await this.getAllQuotaStatuses(jwtToken, userId);

        return {
          success: false,
          quotaExceeded: true,
          remaining: currentRemaining,
          dailyLimit: quotaDoc.dailyLimit,
          nextResetAt: nextReset.toISOString(),
          nextResetIn: this.getTimeUntilReset(nextReset),
          message: `Daily ${quotaType} quota exceeded. Resets at ${nextReset.toLocaleString()}`,
          allQuotas: allQuotaStatuses
        };
      }

      // Consume quota
      const newRemaining = currentRemaining - amount;
      const now = new Date().toISOString();

      await this.adminOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
        quotaDoc.$id,
        {
          remainingCount: newRemaining,
          lastUsed: now
        }
      );

      const nextReset = this.getNextResetTime(safeTimezoneOffset);

      this._log('Quota consumed successfully', {
        userId,
        quotaType,
        consumed: amount,
        remaining: newRemaining,
        dailyLimit: quotaDoc.dailyLimit
      });

      // Track quota usage
      await this.trackQuotaUsage(userId, quotaType, amount, newRemaining);

      // Get all quota statuses after successful consumption
      const allQuotaStatuses = await this.getAllQuotaStatuses(jwtToken, userId);

      return {
        success: true,
        quotaConsumed: amount,
        remaining: newRemaining,
        dailyLimit: quotaDoc.dailyLimit,
        nextResetAt: nextReset.toISOString(),
        nextResetIn: this.getTimeUntilReset(nextReset),
        allQuotas: allQuotaStatuses
      };

    } catch (error) {
      this._logError('Quota check and consume failed', error, { userId, quotaType, amount });
      throw error;
    }
  }

  /**
   * Check if quota should be reset based on user's timezone
   * @private
   */
  shouldResetQuota(timezoneOffset, lastResetDate) {
    this._logDebug('Checking if quota should reset', { timezoneOffset, lastResetDate });

    timezoneOffset = timezoneOffset !== null && timezoneOffset !== undefined ? timezoneOffset : 0;

    const now = new Date();

    // Kullanıcının local zamanını hesapla
    const userLocalTime = new Date(now.getTime() + (timezoneOffset * 60 * 1000));

    // Kullanıcının local zamanında bugünün başlangıcını bul
    const userMidnightLocal = new Date(userLocalTime);
    userMidnightLocal.setUTCHours(0, 0, 0, 0);

    // Bu local gece yarısını UTC'ye çevir
    const userMidnightUTC = new Date(userMidnightLocal.getTime() - (timezoneOffset * 60 * 1000));

    if (!lastResetDate) {
      this._logDebug('First reset detected', {
        userMidnightUTC: userMidnightUTC.toISOString(),
        userLocalTime: userLocalTime.toISOString()
      });
      return {
        shouldReset: true,
        resetDate: userMidnightUTC.toISOString()
      };
    }

    const lastResetTime = new Date(lastResetDate).getTime();
    const userMidnightTime = userMidnightUTC.getTime();

    // Son reset bugünün gece yarısından ÖNCE mi?
    // Ama aynı zamanda, eğer lastResetTime gelecekte ise (timezone manipülasyonundan dolayı)
    // yine de reset yapma
    const nowTime = now.getTime();

    // Eğer lastResetTime gelecekteyse, bu timezone manipülasyonundan kaynaklanıyor
    // Bu durumda userMidnightUTC'yi baz al
    if (lastResetTime > nowTime) {
      this._logDebug('Last reset is in future - timezone manipulation detected', {
        lastResetTime: new Date(lastResetTime).toISOString(),
        nowTime: now.toISOString(),
        userMidnightUTC: userMidnightUTC.toISOString()
      });

      // Gece yarısı geçtiyse reset yap
      if (nowTime >= userMidnightTime) {
        return {
          shouldReset: true,
          resetDate: userMidnightUTC.toISOString()
        };
      }

      return { shouldReset: false };
    }

    // Normal durum: son reset geçmişte
    if (lastResetTime < userMidnightTime) {
      this._logDebug('Reset needed', {
        lastResetTime: new Date(lastResetTime).toISOString(),
        userMidnightUTC: userMidnightUTC.toISOString(),
        userLocalTime: userLocalTime.toISOString(),
        hoursSinceReset: (nowTime - lastResetTime) / 3600000
      });

      return {
        shouldReset: true,
        resetDate: userMidnightUTC.toISOString()
      };
    }

    this._logDebug('No reset needed', {
      lastResetTime: new Date(lastResetTime).toISOString(),
      userMidnightUTC: userMidnightUTC.toISOString(),
      userLocalTime: userLocalTime.toISOString(),
      hoursSinceReset: (nowTime - lastResetTime) / 3600000
    });

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
  async detectTimezoneManipulation(_jwtToken, _userId, profile) {
    this._logDebug('Detecting timezone manipulation', { userId: _userId });

    const result = {
      isSuspicious: false,
      reasons: [],
      score: 0
    };

    // Get timezone tracking data from profile
    const timezoneTracking = profile.timezoneTracking || {};
    const currentOffset = timezoneTracking.timezoneOffset;
    const previousOffset = timezoneTracking.previousOffset;
    const lastChangeDate = timezoneTracking.timezoneChangeDate;
    const dailyChangeCount = timezoneTracking.dailyChangeCount || 0;

    // Skip fraud detection for first-time timezone changes
    const isFirstTimezoneChange = (previousOffset === undefined || previousOffset === null);
    if (isFirstTimezoneChange) {
      this._logDebug('First timezone change detected, skipping fraud detection', { userId: _userId });
      return result;
    }

    // Check for too many changes in one day
    if (dailyChangeCount >= this.fraudThresholds.maxTimezoneChangesPerDay) {
      result.isSuspicious = true;
      result.reasons.push('Too many timezone changes today');
      result.score += 50;

      this._logWarning('Too many timezone changes detected', {
        userId: _userId,
        dailyChangeCount,
        threshold: this.fraudThresholds.maxTimezoneChangesPerDay
      });
    }

    // Check for unrealistic timezone jumps
    if (previousOffset !== undefined && previousOffset !== null) {
      const offsetChange = Math.abs(currentOffset - previousOffset);

      if (offsetChange > this.fraudThresholds.maxTimezoneOffsetChange) {
        result.isSuspicious = true;
        result.reasons.push(`Unrealistic timezone change: ${offsetChange} minutes`);
        result.score += 70;

        this._logWarning('Unrealistic timezone jump detected', {
          userId: _userId,
          offsetChange,
          previousOffset,
          currentOffset,
          threshold: this.fraudThresholds.maxTimezoneOffsetChange
        });
      }
    }

    // Check for rapid changes
    if (lastChangeDate) {
      const timeSinceLastChange = Date.now() - new Date(lastChangeDate).getTime();

      if (timeSinceLastChange < this.fraudThresholds.suspiciousPatternWindow) {
        result.isSuspicious = true;
        result.reasons.push('Rapid timezone changes detected');
        result.score += 30;

        this._logWarning('Rapid timezone change detected', {
          userId: _userId,
          timeSinceLastChange,
          threshold: this.fraudThresholds.suspiciousPatternWindow
        });
      }
    }

    // Check for pattern of changing timezone around quota reset times
    const quotas = profile.quotas || [];
    for (const quota of quotas) {
      if (quota.remainingCount === 0 && quota.lastUsed) {
        const timeSinceExhaustion = Date.now() - new Date(quota.lastUsed).getTime();
        if (timeSinceExhaustion < 3600000) {
          result.isSuspicious = true;
          result.reasons.push('Timezone change shortly after quota exhaustion');
          result.score += 60;

          this._logWarning('Timezone change after quota exhaustion', {
            userId: _userId,
            quotaType: quota.quotaType,
            timeSinceExhaustion
          });

          break;
        }
      }
    }

    if (result.isSuspicious) {
      this._logWarning('Suspicious timezone manipulation detected', {
        userId: _userId,
        score: result.score,
        reasons: result.reasons
      });
    } else {
      this._logDebug('No suspicious timezone activity detected', { userId: _userId });
    }

    return result;
  }

  /**
   * Handle suspicious activity
   * @private
   */
  async handleSuspiciousActivity(jwtToken, profile, fraudCheck) {
    const userId = profile.userId;

    this._log('Handling suspicious activity', {
      userId,
      score: fraudCheck.score,
      reasons: fraudCheck.reasons
    }, 'WARNING');

    // Track in analytics
    if (this.postHog) {
      await this.postHog.trackBusinessEvent('QUOTA_FRAUD_DETECTED', {
        user_id: userId,
        reasons: fraudCheck.reasons,
        score: fraudCheck.score
      });
    }

    // Create or update moderation record
    const moderationData = {
      userId: userId,
      quotaSuspended: true,
      quotaSuspensionReason: fraudCheck.reasons.join(', '),
      quotaSuspensionDate: new Date().toISOString(),
      quotaSuspensionScore: fraudCheck.score,
      suspensionType: 'TIMEZONE_MANIPULATION'
    };

    // Check if moderation record exists
    if (profile.moderation && profile.moderation.$id) {
      // Update existing moderation record
      await this.adminOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_MODERATION_ID,
        profile.moderation.$id,
        moderationData
      );

      this._log('Updated moderation record', { userId, moderationId: profile.moderation.$id });
    } else {
      // Create new moderation record
      const { ID } = await import('node-appwrite');
      await this.adminOps.createDocumentWithAdminPrivileges(
        jwtToken,
        userId,
        process.env.DB_COLLECTION_PROFILE_MODERATION_ID,
        ID.unique(),
        moderationData
      );

      this._log('Created new moderation record', { userId });
    }
  }

  /**
  * Update timezone for a user with fraud checks
  * @param {string} jwtToken - User JWT token
  * @param {Object} profile - User profile object with timezoneTracking
  * @param {number} newOffset - New timezone offset in minutes
  * @returns {Promise<Object>} - Update result
  */
  async updateUserTimezone(jwtToken, profile, newOffset) {
    this._log('Updating user timezone', {
      userId: profile.userId,
      newOffset
    });

    try {
      // Validate offset
      if (!this.isValidTimezoneOffset(newOffset)) {
        this._logError('Invalid timezone offset', new Error('Invalid offset'), {
          userId: profile.userId,
          newOffset
        });
        throw new Error('Invalid timezone offset');
      }

      if (!profile) {
        this._logError('User profile not found', new Error('Profile not found'));
        throw new Error('User profile not found');
      }

      const userId = profile.userId;
      const timezoneTracking = profile.timezoneTracking || {};

      // Get current timezone data from tracking document
      const currentOffset = timezoneTracking.timezoneOffset;
      const lastChangeDate = timezoneTracking.timezoneChangeDate;
      let dailyChangeCount = timezoneTracking.dailyChangeCount || 0;

      // Check if timezone actually changed
      if (currentOffset === newOffset) {
        this._logDebug('No timezone change needed', { userId, currentOffset, newOffset });

        return {
          success: true,
          newOffset,
          previousOffset: currentOffset,
          changesToday: dailyChangeCount,
          isSuspicious: false,
          suspicionReasons: [],
          noChangeNeeded: true
        };
      }

      // Check if it's a new day for reset counter
      if (lastChangeDate) {
        const lastChange = new Date(lastChangeDate);
        const now = new Date();

        if (lastChange.toDateString() !== now.toDateString()) {
          dailyChangeCount = 0;
          this._logDebug('Reset daily change counter', { userId });
        }
      }

      // Increment change counter only for actual changes
      dailyChangeCount++;

      // Prepare update data
      const updateData = {
        timezoneOffset: newOffset,
        timezoneChangeDate: new Date().toISOString(),
        dailyChangeCount: dailyChangeCount
      };

      // Only set previousOffset if there was a previous value
      if (currentOffset !== null && currentOffset !== undefined) {
        updateData.previousOffset = currentOffset;
      }

      // Check for suspicious activity BEFORE updating
      const updatedTimezoneTracking = { ...timezoneTracking, ...updateData };
      const fraudCheck = await this.detectTimezoneManipulation(jwtToken, userId, {
        ...profile,
        timezoneTracking: updatedTimezoneTracking
      });

      // If suspicious, REJECT the timezone change silently
      if (fraudCheck.isSuspicious) {
        this._logWarning('Suspicious timezone change - REJECTING silently', {
          userId,
          fraudScore: fraudCheck.score,
          reasons: fraudCheck.reasons,
          attemptedOffset: newOffset,
          rejectedOffset: newOffset,
          keptOffset: currentOffset,
          dailyChangeCount
        });

        // Update metadata but NOT timezoneOffset
        // This allows future fraud detection to work
        const rejectionUpdateData = {
          previousOffset: newOffset, // Store attempted offset
          timezoneChangeDate: new Date().toISOString(),
          dailyChangeCount: dailyChangeCount
          // timezoneOffset stays at currentOffset (not updated)
        };

        // Update timezone tracking with rejection metadata
        if (timezoneTracking.$id) {
          await this.adminOps.updateDocument(
            jwtToken,
            process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
            timezoneTracking.$id,
            rejectionUpdateData
          );
        }

        // Return success to UI but with old timezone
        return {
          success: true,
          newOffset: currentOffset, // Return old offset, not new one
          previousOffset: currentOffset,
          changesToday: dailyChangeCount,
          isSuspicious: true,
          suspicionReasons: fraudCheck.reasons,
          silentlyRejected: true
        };
      }

      // Normal flow - trustworthy timezone change
      // Update timezone tracking document using admin privileges
      if (timezoneTracking.$id) {
        await this.adminOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
          timezoneTracking.$id,
          updateData
        );

        this._log('Updated timezone tracking', { userId, trackingId: timezoneTracking.$id });
      } else {
        // If no timezone tracking exists, create one
        const { ID } = await import('node-appwrite');
        await this.adminOps.createDocumentWithAdminPrivileges(
          jwtToken,
          userId,
          process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
          ID.unique(),
          {
            userId: userId,
            ...updateData
          }
        );

        this._log('Created new timezone tracking', { userId });
      }

      this._log('Timezone updated successfully', {
        userId,
        previousOffset: currentOffset,
        newOffset,
        changesToday: dailyChangeCount,
        isSuspicious: false
      });

      return {
        success: true,
        newOffset,
        previousOffset: currentOffset,
        changesToday: dailyChangeCount,
        isSuspicious: false,
        suspicionReasons: []
      };

    } catch (error) {
      this._logError('Timezone update failed', error, { userId: profile?.userId });
      throw error;
    }
  }
  /**
   * Get quota status for a user without consuming
   * @param {string} jwtToken - User JWT token
   * @param {string} userId - User ID
   * @param {string} quotaType - Type of quota to check (e.g., 'TRANSLATE', 'DIRECT_MESSAGE')
   * @returns {Promise<Object>} - Current quota status
   */
  async getQuotaStatus(jwtToken, userId, quotaType) {
    this._logDebug('Getting quota status', { userId, quotaType });

    try {
      // Get user profile with quotas
      const profile = await this.getFullProfile(jwtToken, userId);

      if (!profile) {
        this._logError('User profile not found', new Error('Profile not found'), { userId });
        throw new Error('User profile not found');
      }

      // Find the specific quota document
      const quotas = profile.quotas || [];
      const quotaDoc = quotas.find(q => q.quotaType === quotaType);

      if (!quotaDoc) {
        this._logError('Quota type not found', new Error('Quota not found'), { userId, quotaType });
        throw new Error(`Quota type ${quotaType} not found for user`);
      }

      const timezoneTracking = profile.timezoneTracking || {};
      const timezoneOffset = timezoneTracking.timezoneOffset || 0;

      // Check if quota needs reset
      const resetCheck = this.shouldResetQuota(timezoneOffset, quotaDoc.resetDate);

      let currentRemaining = quotaDoc.remainingCount;

      if (resetCheck.shouldReset || currentRemaining === undefined || currentRemaining === null) {
        currentRemaining = quotaDoc.dailyLimit;
      }

      const nextReset = this.getNextResetTime(timezoneOffset);

      this._log('Successfully retrieved quota status', {
        userId,
        quotaType,
        remaining: currentRemaining,
        dailyLimit: quotaDoc.dailyLimit
      });

      return {
        quotaType: quotaType,
        documentId: quotaDoc.$id,
        remaining: currentRemaining,
        dailyLimit: quotaDoc.dailyLimit,
        used: quotaDoc.dailyLimit - currentRemaining,
        nextResetAt: nextReset.toISOString(),
        nextResetIn: this.getTimeUntilReset(nextReset),
        timezoneOffset: timezoneOffset,
        lastUsed: quotaDoc.lastUsed,
        resetDate: quotaDoc.resetDate
      };

    } catch (error) {
      this._logError('Get quota status failed', error, { userId, quotaType });
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
    return new Date(utc + (timezoneOffset * 60000));
  }

  /**
   * Convert user time back to server time
   * @private
   */
  convertToServerTime(userDate, timezoneOffset) {
    return new Date(userDate.getTime() - (timezoneOffset * 60000));
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

      this._logDebug('Tracked quota usage', { userId, quotaType, amount, remaining });
    } catch (error) {
      this._logError('Failed to track quota usage', error, { userId, quotaType });
    }
  }

  /**
   * Reset all quotas for a user (admin function)
   * @param {string} jwtToken - Admin JWT token
   * @param {string} userId - User ID to reset
   * @returns {Promise<Object>} - Reset result
   */
  async resetUserQuotas(jwtToken, userId) {
    this._log('Resetting user quotas', { userId });

    try {
      // Get user's quotas
      const profile = await this.getFullProfile(jwtToken, userId);
      const quotas = profile.quotas || [];

      const resetResults = [];
      const resetDate = new Date().toISOString();

      // Reset each quota document
      for (const quota of quotas) {
        const resetData = {
          remainingCount: quota.dailyLimit,
          resetDate: resetDate,
          lastUsed: null
        };

        await this.adminOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
          quota.$id,
          resetData
        );

        resetResults.push({
          quotaType: quota.quotaType,
          documentId: quota.$id,
          resetTo: quota.dailyLimit
        });

        this._logDebug('Reset quota', {
          userId,
          quotaType: quota.quotaType,
          quotaId: quota.$id
        });
      }

      this._log('Successfully reset all quotas', {
        userId,
        quotasReset: resetResults.length
      });

      return {
        success: true,
        quotasReset: resetResults,
        resetDate: resetDate
      };

    } catch (error) {
      this._logError('Failed to reset quotas', error, { userId });
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
    this._log('Clearing suspension', { userId });

    try {
      // Get user profile to find moderation record
      const profile = await this.getFullProfile(jwtToken, userId);

      if (profile.moderation && profile.moderation.$id) {
        // Clear suspension in moderation record
        await this.adminOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_MODERATION_ID,
          profile.moderation.$id,
          {
            quotaSuspended: false,
            quotaSuspensionReason: null,
            quotaSuspensionDate: null,
            quotaSuspensionScore: 0,
            suspensionType: null
          }
        );

        this._log('Cleared moderation record', {
          userId,
          moderationId: profile.moderation.$id
        });
      }

      // Reset timezone tracking daily count
      if (profile.timezoneTracking && profile.timezoneTracking.$id) {
        await this.adminOps.updateDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
          profile.timezoneTracking.$id,
          {
            dailyChangeCount: 0
          }
        );

        this._log('Reset timezone tracking', {
          userId,
          trackingId: profile.timezoneTracking.$id
        });
      }

      this._log('Successfully cleared suspension', { userId });

      return {
        success: true,
        message: 'Suspension cleared successfully'
      };

    } catch (error) {
      this._logError('Failed to clear suspension', error, { userId });
      throw error;
    }
  }

  /**
   * Get profile data using admin operations
   * @param {string} jwtToken - JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Profile data
   */
  async getProfileData(jwtToken, userId) {
    try {
      const profile = await this.adminOps.getDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        userId
      );
      return profile;
    } catch (error) {
      this._logError('Failed to get profile data', error, { userId });
      throw error;
    }
  }

  /**
   * Get profile moderation data using admin operations
   * @param {string} jwtToken - JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Moderation data
   */
  async getProfileModeration(jwtToken, userId) {
    try {
      const { Query } = await import('node-appwrite');
      const moderation = await this.adminOps.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_MODERATION_ID,
        [
          Query.equal('userId', userId)
        ]
      );
      return moderation.documents.length > 0 ? moderation.documents[0] : null;
    } catch (error) {
      this._logError('Failed to get profile moderation', error, { userId });
      throw error;
    }
  }

  /**
   * Get profile quotas using admin operations
   * @param {string} jwtToken - JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Quota documents
   */
  async getProfileQuotas(jwtToken, userId) {
    try {
      const { Query } = await import('node-appwrite');
      const quotas = await this.adminOps.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
        [
          Query.equal('userId', userId)
        ]
      );
      return quotas.documents;
    } catch (error) {
      this._logError('Failed to get profile quotas', error, { userId });
      throw error;
    }
  }

  /**
   * Get profile timezone tracking using admin operations
   * @param {string} jwtToken - JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Timezone tracking data
   */
  async getProfileTimezoneTracking(jwtToken, userId) {
    try {
      const { Query } = await import('node-appwrite');
      const timezone = await this.adminOps.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_TIMEZONE_TRACKING_ID,
        [
          Query.equal('userId', userId)
        ]
      );
      return timezone.documents.length > 0 ? timezone.documents[0] : null;
    } catch (error) {
      this._logError('Failed to get profile timezone tracking', error, { userId });
      throw error;
    }
  }

  /**
   * Create profile quota using admin operations
   * @param {string} jwtToken - JWT token
   * @param {string} userId - User ID
   * @param {string} quotaType - Type of quota
   * @param {number} dailyLimit - Daily limit
   * @param {number} remaining - Remaining quota
   * @param {string} profileId - Profile document ID
   * @returns {Promise<Object>} - Created quota document
   */
  async createProfileQuota(jwtToken, userId, quotaType, dailyLimit, remaining, profileId) {
    this._log('Creating profile quota', { userId, quotaType, dailyLimit });

    try {
      const { ID } = await import('node-appwrite');
      const quotaData = {
        userId,
        profileId,
        quotaType,
        dailyLimit,
        dailyRemaining: remaining,
        lastResetDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const quota = await this.adminOps.createDocumentWithAdminPrivileges(
        jwtToken,
        userId,
        process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
        ID.unique(),
        quotaData
      );

      this._log('Successfully created profile quota', {
        userId,
        quotaType,
        quotaId: quota.$id
      });

      return quota;
    } catch (error) {
      this._logError('Failed to create profile quota', error, { userId, quotaType });
      throw error;
    }
  }

  /**
   * Update profile quota using admin operations
   * @param {string} jwtToken - JWT token
   * @param {string} quotaId - Quota document ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated quota document
   */
  async updateProfileQuota(jwtToken, quotaId, updateData) {
    try {
      const quota = await this.adminOps.updateDocument(
        jwtToken,
        process.env.DB_COLLECTION_PROFILE_QUOTAS_ID,
        quotaId,
        updateData
      );
      return quota;
    } catch (error) {
      this._logError('Failed to update profile quota', error, { quotaId });
      throw error;
    }
  }

  /**
   * Get full profile with all related data
   * @param {string} jwtToken - JWT token
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Complete profile with all related data
   */
  async getFullProfile(jwtToken, userId) {
    this._logDebug('Getting full profile', { userId });

    try {
      const [profile, quotas, moderation, timezoneTracking] = await Promise.all([
        this.getProfileData(jwtToken, userId),
        this.getProfileQuotas(jwtToken, userId),
        this.getProfileModeration(jwtToken, userId),
        this.getProfileTimezoneTracking(jwtToken, userId)
      ]);

      this._logDebug('Successfully retrieved full profile', {
        userId,
        hasProfile: !!profile,
        quotasCount: quotas.length,
        hasModeration: !!moderation,
        hasTimezoneTracking: !!timezoneTracking
      });

      return Object.assign(profile, {
        quotas,
        moderation,
        timezoneTracking
      });
    } catch (error) {
      this._logError('Failed to get full profile', error, { userId });
      throw error;
    }
  }
}

export default QuotaManager;