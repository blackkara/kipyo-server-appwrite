export const TIMEZONE_CONFIG = {
  // Timezone değişikliği için bekleme süresi (saat)
  TIMEZONE_CHANGE_COOLDOWN_HOURS: 48,
  // Şüpheli timezone atlaması eşik değeri (saat)
  SUSPICIOUS_JUMP_THRESHOLD_HOURS: 12,
  // Geçerli timezone offset aralığı (dakika cinsinden)
  MIN_TIMEZONE_OFFSET: -720, // UTC-12
  MAX_TIMEZONE_OFFSET: 840,   // UTC+14
  MAX_DAILY_TIMEZONE_CHANGES: 3, // Maksimum günlük timezone değişikliği
};