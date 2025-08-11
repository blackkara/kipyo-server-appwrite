export const RESET_CONFIG = {
  // Günlük mesaj limiti
  DAILY_MESSAGE_LIMIT: 3,
  // Reset için bekleme süresi (saat)
  RESET_COOLDOWN_HOURS: 18
};

export const PROFILE_CONFIG = {
  REQUIRED_FIELDS: ['username', 'birthDate', 'gender', 'photos'],
  IMPORTANT_FIELDS: ['about', 'passions', 'relationGoal'],
  OPTIONAL_FIELDS: ['habits', 'relationStatus', 'height'],
  COMPLETION_WEIGHTS: {REQUIRED: 50, IMPORTANT: 35, OPTIONAL: 15},
};