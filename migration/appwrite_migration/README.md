# Step 2: Appwrite Migration

Bu step merged.json dosyasındaki kullanıcıları ve profilleri Appwrite'a migrate eder.

## 🚀 Çalıştırma

```bash
cd step2_migrate
node step2_migrate.js
```

## 🗑️ Cleanup (İsteğe Bağlı)

Önceki migration'ı temizlemek için:

```bash
node step2_clean.js
```

## 📊 Ne Yapar?

1. **merged.json** → **Appwrite Users**
2. **Profile data** → **Appwrite Profiles collection**
3. **Geohash field'ları** → Profile documents'a eklenir
4. **Batch processing** (10'lu gruplar)
5. **Retry logic** (3 deneme)

## 📁 Input/Output

### Input:
- `../merged.json` (Step 1'den gelen geohash'li data)

### Output:
- **Appwrite Users collection**
- **Appwrite Profiles collection** (geohash field'ı ile)

## 🔧 Configuration

Config dosyası: `../config.js`

```javascript
{
  maxUsers: 200,      // Test için düşük, production'da artır
  batchSize: 10,      // Concurrent operations
  retryCount: 3,      // Retry logic
  retryDelay: 1000    // Retry delay (ms)
}
```

## 📈 Beklenen Sonuçlar

```
Users migrated: ~29,000
Profiles created: ~29,000
Success rate: ~98%+
Geohash fields: %100 included
```

## ⚠️ Notlar

- Duplicate email'ler skip edilir (normal)
- Validation error'ları log'lanır
- Geohash field'ları otomatik eklenir