# Google Translate API Setup Guide

## Setting up Google Cloud Translation API with Service Account

### 1. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your Project ID

### 2. Enable Translation API
1. Navigate to "APIs & Services" > "Library"
2. Search for "Cloud Translation API"
3. Click on it and press "Enable"

### 3. Create Service Account
1. Go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Give it a name like "translate-service"
4. Grant the role "Cloud Translation API User"
5. Click "Done"

### 4. Generate Keyfile
1. Click on the created service account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose JSON format
5. Download the keyfile

### 5. Configure the Application

Place the downloaded JSON keyfile in your backend directory and rename it to `google-translate-keyfile.json`.

Update your `.env` file:
```env
# Use service account keyfile (recommended)
GOOGLE_CLOUD_KEY_FILE=./google-translate-keyfile.json
```

The keyfile JSON structure should look like:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "translate-service@your-project.iam.gserviceaccount.com",
  "client_id": "client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

### 6. Security Notes
- **NEVER** commit the keyfile to version control
- Add `google-translate-keyfile.json` to `.gitignore`
- Keep the keyfile secure and rotate keys regularly
- Use environment-specific keyfiles for different environments

## Quota Management System

The translation service includes a comprehensive quota management system with the following features:

### Daily Quotas
- Each user gets 100 translation requests per day
- Quotas reset at midnight in the user's timezone
- Remaining quota is returned with each translation response

### Profile Fields Required
The following fields need to be added to the user profiles collection in Appwrite:

```javascript
{
  // Timezone management
  "timezoneOffset": 0,                    // User's timezone offset in minutes
  "timezoneChangeDate": null,             // Last timezone change timestamp
  "timezoneTotalChanges": 0,              // Daily timezone change counter
  "lastTimezoneOffset": null,             // Previous timezone offset
  
  // Translation quotas
  "dailyTranslateRemaining": 100,         // Remaining translation quota
  "dailyTranslateRemainingResetDate": null, // Last quota reset timestamp
  "dailyTranslateRemainingLastUsed": null,  // Last translation timestamp
  
  // Future: Direct message quotas
  "dailyDirectMessageRemaining": 3,       // Daily direct messages
  "dailyDirectMessageRemainingResetDate": null,
  "dailyDirectMessageRemainingLastUsed": null,
  
  // Fraud detection
  "quotaSuspended": false,                // Quota suspension status
  "quotaSuspensionReason": null,          // Suspension reason
  "quotaSuspensionDate": null,            // Suspension timestamp
  "quotaSuspensionScore": 0               // Fraud score
}
```

### API Endpoints

#### Translation with Quota
```bash
POST /api/translate/message
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "messageId": "msg123",
  "targetLanguage": "tr"
}

Response:
{
  "success": true,
  "messageId": "msg123",
  "originalText": "Hello",
  "translatedText": "Merhaba",
  "targetLanguage": "tr",
  "cached": false,
  "quotaInfo": {
    "remaining": 99,
    "dailyLimit": 100,
    "nextResetAt": "2024-01-01T00:00:00Z",
    "nextResetIn": "5h 30m"
  }
}
```

#### Check Quota Status
```bash
GET /api/translate/quota?userId=user123
Authorization: Bearer <jwt_token>

Response:
{
  "success": true,
  "quota": {
    "quotaType": "translate",
    "remaining": 99,
    "dailyLimit": 100,
    "used": 1,
    "nextResetAt": "2024-01-01T00:00:00Z",
    "nextResetIn": "5h 30m",
    "timezoneOffset": 180
  }
}
```

#### Update Timezone
```bash
PUT /api/translate/timezone
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "userId": "user123",
  "timezoneOffset": 180  // +3 hours in minutes
}

Response:
{
  "success": true,
  "newOffset": 180,
  "previousOffset": 0,
  "changesToday": 1,
  "isSuspicious": false,
  "suspicionReasons": []
}
```

### Fraud Detection

The system detects and prevents timezone manipulation abuse:

1. **Maximum Changes Per Day**: 2 timezone changes allowed
2. **Maximum Offset Jump**: 360 minutes (6 hours) per change
3. **Rapid Change Detection**: Flags changes within 1 hour
4. **Pattern Analysis**: Detects patterns of changes around quota reset times

When suspicious activity is detected:
- User's quota access is temporarily restricted
- Activity is logged for review
- Admin can clear suspension manually

### Testing the System

1. **Test normal translation**:
```javascript
// Should consume 1 quota
const result = await translateService.translateMessage(
  jwtToken,
  'message_id',
  'es'
);
console.log(result.quotaInfo); // { remaining: 99, ... }
```

2. **Test quota exhaustion**:
```javascript
// After 100 translations
const result = await translateService.translateMessage(
  jwtToken,
  'message_id',
  'fr'
);
console.log(result.error); // 'QUOTA_EXCEEDED'
```

3. **Test timezone reset**:
```javascript
// Update timezone to trigger reset check
await quotaManager.updateUserTimezone(jwtToken, userId, 180);

// Check quota - should reset if it's a new day in user's timezone
const status = await quotaManager.getQuotaStatus(
  jwtToken,
  userId,
  'TRANSLATE'
);
```

4. **Test fraud detection**:
```javascript
// Rapid timezone changes
await quotaManager.updateUserTimezone(jwtToken, userId, 0);
await quotaManager.updateUserTimezone(jwtToken, userId, 480);
await quotaManager.updateUserTimezone(jwtToken, userId, -420);
// Should trigger suspension on 3rd change
```

## Troubleshooting

### Common Issues

1. **"Google Translate API key or keyfile not configured"**
   - Ensure GOOGLE_CLOUD_KEY_FILE path is correct
   - Verify the keyfile exists at the specified location
   - Check file permissions

2. **"Daily translate quota exceeded"**
   - Wait until midnight in your timezone
   - Check remaining quota with GET /api/translate/quota

3. **"Suspicious timezone activity detected"**
   - Too many timezone changes in one day
   - Contact admin to clear suspension

4. **Translation fails with permission error**
   - Verify service account has "Cloud Translation API User" role
   - Check if Translation API is enabled in Google Cloud Console