module.exports = {
  'config': {
    'databaseId': '657e07e99ad1b086d9a9',
    'profileCollectionId': '683e4215002f4fb69d06',
    'endpoint': 'https://mobile-api.kipyo.com/v1',
    'project': '6867d552001fa11c2dc3',
    'apiKey': 'standard_e0f5448b02f14664c1a4de120df4cd9924da9cfd0ac8e47f0b93c80f50c844948d9c105bc4388528b7d7f21b4dcddeeed65b58efebd79a5b211a62e0ed1a869d064d0bfb538aedf17bb166d4f261a9897b7a98409ec646e834428ef8fcf6d2e4009e5425155dee89c1c975f8e37091b626875ffbcc1525c9202ada69c075cea0',
    'batchSize': 10, // Concurrent operations
    'maxUsers': 50,
    'retryCount': 3,
    'retryDelay': 1000,
    
    // Photo Migration Configuration
    'photoMigration': {
      // ConnectyCube photo configuration
      'oldSystemBaseUrl': 'https://api.connectycube.com/blobs', // ConnectyCube API
      'imageFormat': 'jpg', // Default image format (will be detected from response)
      
      // DigitalOcean Spaces configuration (from backend/.env)
      'digitalOcean': {
        'endpoint': 'fra1.digitaloceanspaces.com', // From SPACES_ENDPOINT
        'accessKeyId': 'DO00R9RUA88ZB7Y8JCKZ', // From SPACES_ACCESS_KEY_ID
        'secretAccessKey': 'LDlnZSS28xV02xxUCYbwwVc2ASCXJ7/N15COCmYC9Fo', // From SPACES_SECRET_ACCESS_KEY
        'region': 'fra1', // Extracted from endpoint (fra1 region)
        'bucketName': 'kipyo', // From SPACES_BUCKET
        'baseUrl': 'https://kipyo.fra1.digitaloceanspaces.com' // Constructed public URL
      },
      
      // Processing configuration  
      'maxPhotos': 250, // Maximum photos to process (for 50 users)
      'batchSize': 10, // Process 10 photos concurrently
      'downloadTimeout': 30000, // 30 seconds
      'retryCount': 3,
      'retryDelay': 2000,
      
      // Target collection ID from appwrite.json
      'profileMediaCollectionId': '67f8e5a1b2c3d4e5f6789012' // profile_media collection
    }
  }
}