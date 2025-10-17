# Step 3: Photo Migration

Bu step ConnectyCube blob'larını DigitalOcean Spaces'e migrate eder.

## 🚀 Çalıştırma

```bash
cd step3_photo_migration
node step3_photo_migration.js
```

## 📊 Ne Yapar?

1. **merged.json**'dan photo ID'leri alır
2. **ConnectyCube blob API**'den fotoğrafları download eder
3. **DigitalOcean Spaces**'e upload eder
4. **Appwrite profile_media** collection'a record'lar ekler

## 📁 Input/Output

### Input:
- `../merged.json` (photo ID'leri içeren)
- ConnectyCube blob API

### Output:
- **DigitalOcean Spaces photos**
- **Appwrite profile_media collection**

## 🔧 Configuration

Config dosyası: `../config.js`

```javascript
photoMigration: {
  oldSystemBaseUrl: 'https://api.connectycube.com/blobs',
  maxPhotos: 1000,    // Test için, production'da artır
  batchSize: 10,      // Concurrent uploads
  downloadTimeout: 30000,
  digitalOcean: {
    endpoint: 'fra1.digitaloceanspaces.com',
    bucketName: 'kipyo',
    // credentials...
  }
}
```

## 📈 Beklenen Sonuçlar

```
Photos processed: ~40,000+
Successful uploads: ~95%
404 errors: Normal (bazı blob'lar silinmiş)
Format distribution: ~90% JPEG, ~8% PNG, ~2% others
```

## 🔧 Özellikler

- ✅ **Auto-format detection** (JPEG, PNG, GIF, WebP)
- ✅ **Duplicate prevention**
- ✅ **Concurrent uploads** (5'li batch)
- ✅ **Error tracking**
- ✅ **404 handling** (normal durum)

## 📚 Detaylı Dokümantasyon

Daha fazla detay için: `README_PHOTO_MIGRATION.md`