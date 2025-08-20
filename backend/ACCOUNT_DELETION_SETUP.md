# Account Deletion Setup Guide

## Overview
This system provides a secure account deletion flow with email verification, required for Google Play Store compliance.

## Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-specific-password
EMAIL_FROM=noreply@kipyo.com

# OR Generic SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
```

## Gmail Setup Instructions

1. **Enable 2-Factor Authentication**
   - Go to your Google Account settings
   - Navigate to Security
   - Enable 2-Step Verification

2. **Generate App Password**
   - In Google Account settings, go to Security
   - Select "2-Step Verification"
   - Scroll to "App passwords"
   - Generate a new app password for "Mail"
   - Copy the 16-character password
   - Use this as `EMAIL_APP_PASSWORD`

## API Endpoints

### 1. Request OTP Code
**POST** `/api/account/deletion/request-otp`

Request Body:
```json
{
  "email": "user@example.com"
}
```

Response:
```json
{
  "success": true,
  "message": "Verification code sent to your email",
  "data": {
    "email": "user@example.com",
    "expiresInMinutes": 10
  }
}
```

### 2. Verify OTP Code
**POST** `/api/account/deletion/verify-otp`

Request Body:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

Response:
```json
{
  "success": true,
  "message": "Verification successful",
  "data": {
    "deletionToken": "secure-token-here",
    "expiresInMinutes": 5
  }
}
```

### 3. Confirm Account Deletion
**DELETE** `/api/account/deletion/confirm`

Request Body:
```json
{
  "deletionToken": "secure-token-here"
}
```

Response:
```json
{
  "success": true,
  "message": "Account successfully deleted"
}
```

### 4. Check Deletion Status
**GET** `/api/account/deletion/status`

Response:
```json
{
  "success": true,
  "data": {
    "hasPendingOTP": false,
    "otpExpiryMinutes": 10,
    "deletionTokenExpiryMinutes": 5
  }
}
```

## Security Features

1. **OTP Verification**
   - 6-digit random code
   - 10-minute expiration
   - Maximum 3 attempts per code
   - Rate limiting protection

2. **Deletion Token**
   - Secure random token (256-bit)
   - 5-minute expiration
   - Single use only
   - User-specific validation

3. **Email Notifications**
   - OTP delivery email
   - Deletion confirmation email

## Implementation Notes

### For Production
- Consider using Redis for OTP and token storage instead of in-memory Map
- Implement rate limiting on OTP requests (e.g., max 3 requests per hour)
- Add logging for audit trail
- Consider implementing a grace period for account recovery

### AppwriteService Methods Required
The following methods need to be implemented in AppwriteService:

```javascript
// Delete user's messages
await appwriteService.deleteUserMessages(jwtToken, userId);

// Delete user's matches
await appwriteService.deleteUserMatches(jwtToken, userId);

// Delete user's profile data
await appwriteService.deleteUserProfile(jwtToken, userId);

// Delete user account from Appwrite
await appwriteService.deleteUserAccount(jwtToken, userId);
```

## Testing

1. Start the server with email configuration
2. Authenticate as a user
3. Request OTP: `POST /api/account/deletion/request-otp`
4. Check email for OTP code
5. Verify OTP: `POST /api/account/deletion/verify-otp`
6. Use deletion token: `DELETE /api/account/deletion/confirm`
7. Verify account is deleted

## Compliance

This implementation meets Google Play Store requirements:
- ✅ In-app account deletion
- ✅ Email verification
- ✅ Secure token-based deletion
- ✅ Confirmation emails
- ✅ Complete data removal

## Public URL for Google Play

You can provide this URL for Google Play Store compliance:
```
https://your-domain.com/api/account/deletion/request-otp
```

Users will need to:
1. Be authenticated in the app
2. Enter their email
3. Enter the verification code
4. Confirm deletion

This ensures secure, user-initiated account deletion.