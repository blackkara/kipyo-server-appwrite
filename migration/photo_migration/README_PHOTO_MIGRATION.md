# Photo Migration Guide - Step 3

## Overview

The step3_photo_migration.js script migrates photos from ConnectyCube to DigitalOcean Spaces and creates profile_media records in Appwrite. This is the final step in the complete migration process.

## Prerequisites

✅ Completed step1_merge.js (user data merged)
✅ Completed step2_migrate.js (users and profiles created in Appwrite)
✅ AWS SDK installed (added to package.json)
✅ DigitalOcean Spaces account and configuration

## Configuration Required

Update the following sections in `config.js`:

### 1. ConnectyCube Configuration (Already Set)
```javascript
photoMigration: {
  oldSystemBaseUrl: 'https://api.connectycube.com/blobs', // ConnectyCube blob API
  imageFormat: 'jpg', // Auto-detected from blob content
}
```

### 2. DigitalOcean Spaces Configuration
```javascript
digitalOcean: {
  endpoint: 'fra1.digitaloceanspaces.com', // Your region
  accessKeyId: 'YOUR_DO_ACCESS_KEY',
  secretAccessKey: 'YOUR_DO_SECRET_KEY', 
  region: 'fra1', // Your region
  bucketName: 'your-bucket-name',
  baseUrl: 'https://your-bucket-name.fra1.digitaloceanspaces.com'
}
```

### 3. Processing Limits (for testing)
```javascript
maxPhotos: 50,     // Start small (5, then 10, then 50)
batchSize: 5,      // Concurrent uploads
```

## Testing Approach

### Phase 1: Small Test (5 photos)
```javascript
// In config.js
maxPhotos: 5,
batchSize: 3,
```

Run: `node step3_photo_migration.js`

### Phase 2: Medium Test (25 photos)
```javascript
maxPhotos: 25,
batchSize: 5,
```

### Phase 3: Full Migration
```javascript
maxPhotos: 100000, // Or remove limit
batchSize: 10,
```

## Features

### 🔄 Intelligent Processing
- **Duplicate Detection**: Skips photos already uploaded to DigitalOcean
- **Stream Processing**: Memory-efficient for large datasets
- **Batch Processing**: Configurable concurrent uploads
- **Progress Tracking**: Real-time statistics

### 🛡️ Error Handling
- **Retry Logic**: 3 attempts per photo with exponential backoff
- **Graceful Failures**: Continues processing other photos if one fails
- **Detailed Logging**: Comprehensive error tracking

### 📊 Statistics Tracking
- Users processed
- Photos found vs. uploaded
- Success/failure rates
- Error details

## Migration Flow

1. **Read merged.json**: Stream processing of user data
2. **Find Appwrite Users**: Match by email in profiles collection
3. **Download ConnectyCube Blobs**: Using `https://api.connectycube.com/blobs/{uid}/download`
4. **Auto-detect Format**: JPEG, PNG, GIF, WebP from magic bytes
5. **Upload to DigitalOcean**: S3-compatible API with detected format
6. **Create profile_media**: Appwrite documents with display order

## Expected Data Structure

The script expects photos in merged.json like:
```json
{
  "user": { "email": "user@example.com" },
  "profile": {
    "username": "username",
    "photos": [
      "E525109BC7D15E698DE8735DB46B46A48580",
      "5ECA96B07CA84D3198640DF3610CA47D03B2"
    ]
  }
}
```

## Output Example

```
📸 Starting photo migration...
✅ DigitalOcean Spaces configured successfully
📊 Migration limits: maxPhotos=50, batchSize=5

📸 Processing 4 photos for user john.doe...
📥 Downloading ConnectyCube blob: E525109BC7D15E698DE8735DB46B46A48580
✅ Downloaded blob E525109BC7D15E698DE8735DB46B46A48580 (245760 bytes)
📤 Uploading: E525109BC7D15E698DE8735DB46B46A48580 (245760 bytes)
🔍 Detected format: jpg (image/jpeg)
✅ Uploaded to: https://bucket.fra1.digitaloceanspaces.com/E525109BC7D15E698DE8735DB46B46A48580.jpg
📋 Created profile_media: 67f8e5a... for user 683e4215...
✅ Successfully migrated photo: E525109BC7D15E698DE8735DB46B46A48580 → https://...

📊 === Photo Migration Statistics ===
👥 Users processed: 12
📸 Users with photos: 8
🖼️  Total photos found: 31
📥 Photos downloaded: 29
📤 Photos uploaded: 29
📋 Profile media records created: 29
❌ Photos failed: 2
✅ Success rate: 93.55%
```

## Troubleshooting

### Common Issues

1. **"Photo not found" errors**
   - Check `oldSystemBaseUrl` in config.js
   - Verify photo IDs format and file extensions

2. **DigitalOcean upload failures**
   - Verify credentials and bucket permissions
   - Check region and endpoint settings

3. **Profile_media creation fails**
   - Ensure users exist in Appwrite profiles collection
   - Check collection ID in config.js

### Mock Mode
If DigitalOcean is not configured, the script runs in mock mode:
- Simulates photo downloads and uploads
- Creates profile_media records with mock URLs
- Useful for testing the flow without real uploads

## Security Notes

- **Never commit** DigitalOcean credentials to version control
- Use environment variables or secure config files
- Profile_media records have proper Appwrite permissions
- Uploaded photos are public-readable by default

## Next Steps

After successful photo migration:
1. Verify photos are accessible via DigitalOcean URLs
2. Test profile_media queries in Appwrite
3. Update mobile app to use new photo URLs
4. Consider implementing image resizing/optimization

## Support

For issues or questions about the photo migration:
1. Check error logs and statistics output
2. Verify configuration settings
3. Test with small batches first
4. Review Appwrite and DigitalOcean documentation