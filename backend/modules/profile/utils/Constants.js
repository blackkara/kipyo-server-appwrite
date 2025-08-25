// utils/Constants.js

export const RESET_CONFIG = {
  // Günlük mesaj limiti
  DAILY_MESSAGE_LIMIT: 3,
  // Reset için bekleme süresi (saat)
  RESET_COOLDOWN_HOURS: 18
};

export const PROFILE_CONFIG = {
  // Gerekli alanlar - profil kullanımı için mutlaka doldurulması gereken alanlar
  REQUIRED_FIELDS: ['username', 'birthDate', 'gender', 'medias'], // photos -> medias olarak değiştirildi
  
  // Önemli alanlar - profil kalitesi için önemli olan alanlar
  IMPORTANT_FIELDS: ['about', 'passions', 'relationGoal'], // passions artık preferences.passions'dan okunacak
  
  // Opsiyonel alanlar - profil tamamlanması için iyi olan ama zorunlu olmayan alanlar
  OPTIONAL_FIELDS: ['habits', 'relationStatus', 'height'], // habits artık preferences.habits'dan okunacak
  
  // Ağırlık değerleri (toplamı 100 olmalı)
  COMPLETION_WEIGHTS: {
    REQUIRED: 50,   // %50 - Gerekli alanlar
    IMPORTANT: 35,  // %35 - Önemli alanlar  
    OPTIONAL: 15    // %15 - Opsiyonel alanlar
  }
};