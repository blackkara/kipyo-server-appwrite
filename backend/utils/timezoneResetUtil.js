// utils/timezoneResetUtil.js
import { ERROR_CODES, AppError } from './errorConstants.js';

class TimezoneResetUtil {

  /**
   * ANA FONKSİYON: Timezone ve reset kontrolü
   */
  async processTimezoneAndReset(profile, requestedTimezone, requestId, log) {
    try {
      log(`[${requestId}] İşlem başladı - User: ${profile.$id}`);

      const now = new Date();

      const result = {
        updateData: {},
        requestedTimezone: null,
        isRequestedTimezoneValid: false,
        isSuspiciousJump: false,
        isTimezoneChangeTooFrequently: false,
        isDailyMessagesResetTooFrequently: false,
        hoursToWaitForTimezoneChange: null
      };

      // 1. TIMEZONE KONTROLÜ
      if (this._shouldChangeTimezone(profile, requestedTimezone)) {
        this._handleTimezoneChange(profile, requestedTimezone, now, result, log, requestId);
      }

      // 2. GÜNLÜK RESET KONTROLÜ  
      this._handleDailyReset(profile, now, result, log, requestId);

      // 3. RESPONSE DATA HAZIRLA
      Object.assign(result, this._prepareResponse(profile, result.updateData));
      // result.responseData = this._prepareResponse(profile, result.updateData);

      log(`[${requestId}] İşlem tamamlandı`);
      return result;

    } catch (error) {
      log(`[${requestId}] HATA: ${error.message}`);
      if (error instanceof AppError) throw error;
      throw new AppError(ERROR_CODES.PROCESSING_ERROR, 'İşlem hatası', error);
    }
  }

  // ===========================================
  // TIMEZONE İŞLEMLERİ
  // ===========================================

  /**
   * Timezone değişmesi gerekiyor mu?
   */
  _shouldChangeTimezone(profile, requestedTimezone) {
    return profile.timezoneOffset !== requestedTimezone;
  }

  /**
   * Timezone değişikliği yap
   */
  _handleTimezoneChange(profile, requestedTimezone, now, result, log, requestId) {
    result.requestedTimezone = requestedTimezone;
    result.isRequestedTimezoneValid = this._isValidTimezone(requestedTimezone);
    result.isSuspiciousJump = this._isSuspiciousJump(profile, requestedTimezone);
    result.isTimezoneChangeTooFrequently = this._isChangingTooFrequently(profile, now);
    if (result.isTimezoneChangeTooFrequently) {
      result.hoursToWaitForTimezoneChange = this._getHoursToWait(profile, now);
    }

    if (!result.isRequestedTimezoneValid && !result.isSuspiciousJump && !result.isTimezoneChangeTooFrequently) {
      result.updateData.timezoneOffset = requestedTimezone;
      result.updateData.timezoneChangeDate = now.toISOString();
      result.updateData.timezoneTotalChanges = (profile.timezoneTotalChanges || 0) + 1;
      result.timezoneInfo.changed = true;
      log(`[${requestId}] Timezone değişti: ${profile.timezoneOffset} → ${requestedTimezone}`);
    }
  }

  /**
   * Çok sık değiştiriyor mu?
   */
  _isChangingTooFrequently(profile, now) {
    if (!profile.timezoneChangeDate) return false;

    const lastChange = new Date(profile.timezoneChangeDate);
    const hoursSince = (now - lastChange) / (1000 * 60 * 60);

    return hoursSince < 48; // 48 saat kuralı
  }

  /**
   * Kaç saat beklemesi gerek?
   */
  _getHoursToWait(profile, now) {
    const lastChange = new Date(profile.timezoneChangeDate);
    const hoursSince = (now - lastChange) / (1000 * 60 * 60);
    return Math.ceil(48 - hoursSince);
  }

  /**
   * Şüpheli atlama mı?
   */
  _isSuspiciousJump(profile, requestedTimezone) {
    const currentOffset = this._parseOffset(profile.timezoneOffset);
    const requestedOffset = this._parseOffset(requestedTimezone);
    const hourDiff = Math.abs(requestedOffset - currentOffset) / 60;

    return hourDiff >= 12; // 12+ saat fark şüpheli
  }

  // ===========================================
  // GÜNLÜK RESET İŞLEMLERİ
  // ===========================================

  /**
   * Günlük reset kontrolü
   */
  _handleDailyReset(profile, now, result, log, requestId) {
    // Hangi timezone kullanacağız?
    const activeTimezone = result.updateData.timezoneOffset || profile.timezoneOffset;

    // Bugünün tarihi (kullanıcının timezone'ında)
    const todayInUserTZ = this._getTodayInTimezone(now, activeTimezone);

    // En son ne zaman reset yapılmış?
    const lastResetDate = this._getLastResetDate(profile);

    // Reset gerekli mi?
    if (this._needsReset(lastResetDate, todayInUserTZ)) {
      this._performReset(profile, now, result, log, requestId);
    }
  }

  /**
   * Reset gerekli mi?
   */
  _needsReset(lastResetDate, todayInUserTZ) {
    return !lastResetDate || lastResetDate !== todayInUserTZ;
  }

  /**
   * Reset yap
   */
  _performReset(profile, now, result, log, requestId) {
    // Çok sık reset girişimi kontrolü
    if (this._isResetTooFrequent(profile, now)) {
      result.isDailyMessagesResetTooFrequently = true;
    } else {
      result.updateData.dailyMessageRemaining = 3;
      result.updateData.dailyMessageResetDate = now.toISOString();
    }
    log(`[${requestId}] Günlük reset yapıldı`);
  }

  /**
   * Çok sık reset girişimi mi?
   */
  _isResetTooFrequent(profile, now) {
    if (!profile.dailyMessageResetDate) return false;

    const lastReset = new Date(profile.dailyMessageResetDate);
    const hoursSince = (now - lastReset) / (1000 * 60 * 60);

    return hoursSince < 6;
  }

  // ===========================================
  // YARDIMCI FONKSİYONLAR
  // ===========================================

  /**
   * String timezone'u dakikaya çevir
   */
  _parseOffset(offsetString) {
    if (typeof offsetString === 'number') return offsetString;
    if (!offsetString) return 0;
    const parsed = parseInt(offsetString);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Timezone geçerli mi?
   */
  _isValidTimezone(offsetString) {
    const offset = this._parseOffset(offsetString);
    return offset >= -720 && offset <= 840; // UTC-12 ile UTC+14 arası
  }

  /**
   * Kullanıcının timezone'ında bugünün tarihini al
   */
  _getTodayInTimezone(utcDate, timezoneOffset) {
    const offset = this._parseOffset(timezoneOffset);
    const localDate = new Date(utcDate.getTime() + (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Son reset tarihi
   */
  _getLastResetDate(profile) {
    if (!profile.dailyMessageResetDate) return null;

    const resetTime = new Date(profile.dailyMessageResetDate);
    const offset = this._parseOffset(profile.timezoneOffset);
    return this._getTodayInTimezone(resetTime, offset);
  }

  /**
   * Response data hazırla
   */
  _prepareResponse(profile, updateData) {
    const activeTimezone = updateData.timezoneOffset || profile.timezoneOffset;
    const currentMessages = updateData.dailyMessageRemaining ?? profile.dailyMessageRemaining ?? 0;

    return {
      timezoneOffset: activeTimezone,
      timezoneDisplay: this._formatTimezone(activeTimezone),
      dailyMessageRemaining: currentMessages,
      dailyMessageLimit: 3,
      canSendMessage: currentMessages > 0,
      totalTimezoneChanges: updateData.timezoneTotalChanges || profile.timezoneTotalChanges || 0
    };
  }

  /**
   * Timezone'u "UTC+3" formatında göster
   */
  _formatTimezone(offsetString) {
    const offset = this._parseOffset(offsetString);
    if (offset === 0) return 'UTC';

    const sign = offset > 0 ? '+' : '-';
    const hours = Math.abs(offset) / 60;
    return `UTC${sign}${hours}`;
  }

  /**
   * Yeni kullanıcı için default değerler
   */
  getDefaultData(timezoneOffset = "+0") {
    const now = new Date();
    return {
      timezoneOffset: timezoneOffset,
      timezoneChangeDate: now.toISOString(),
      timezoneTotalChanges: 0,
      dailyMessageRemaining: 3,
      dailyMessageResetDate: now.toISOString()
    };
  }
}

export default new TimezoneResetUtil();