module.exports = {
  config: {
    // Appwrite settings
    appwrite: {
      endpoint: 'https://fra.cloud.appwrite.io/v1',
      project: 'zephyr',
      apiKey: 'standard_cee17f1607b2c27535570cd5b5b7f98e80ce61f1b919c5e14aed3fc621e3d879f43c7ddce7efe86f80461783f5dab365fe50b0fe6c9732992c2e0969207dcc64d32e48059ff3e3dd008ca1f878a80476909439c27febc45bdb9cd48d26d5547ef4e4b8a3aacbd28582c61392513ed82a3bbebaf0a5eefcae8b9986502803c4bf',
      databaseId: '657e07e99ad1b086d9a9',
      profileCollectionId: '683e4215002f4fb69d06'
    },

    // Digital Ocean Spaces settings
    digitalOcean: {
      endpoint: 'https://nyc3.digitaloceanspaces.com', // örnek endpoint
      region: 'nyc3',
      accessKeyId: 'YOUR_DO_ACCESS_KEY',
      secretAccessKey: 'YOUR_DO_SECRET_KEY',
      bucketName: 'your-bucket-name',
      cdnUrl: 'https://your-cdn-url.com' // CDN URL'iniz
    },

    // Old provider settings
    oldProvider: {
      baseUrl: 'https://old-provider.com',
      format: 'jpeg' // veya 'jpg', 'png' vs.
    },

    // Migration settings
    batchSize: 5, // Aynı anda kaç fotoğraf işlensin
    maxPhotos: 1000, // Test için limit
    retryCount: 3,
    retryDelay: 2000,
    downloadTimeout: 30000, // 30 saniye

    // Logging
    logFile: 'photo_migration.log'
  }
}