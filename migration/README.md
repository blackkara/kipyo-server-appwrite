# ConnectyCube to Appwrite Migration System

Bu sistem ConnectyCube'dan Appwrite'a kullanıcıları ve fotoğrafları migrate etmek için tasarlanmıştır. Toplam 30,850+ kullanıcı ve binlerce fotoğraf için optimize edilmiştir.

## 📋 İçindekiler
- [Genel Bakış](#genel-bakış)
- [Ön Gereksinimler](#ön-gereksinimler)
- [Migration Adımları](#migration-adımları)
- [Dosya Yapısı](#dosya-yapısı)
- [Konfigürasyon](#konfigürasyon)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Aşamalı Migration](#aşamalı-migration)
- [Toplu Migration](#toplu-migration)
- [Sorun Giderme](#sorun-giderme)

---

## 📚 Genel Bakış

Migration süreci 3 ana adımdan oluşur:

```
ConnectyCube Users + Profiles → Merged Data → Appwrite → Photos Migration
     (JSON files)           (Step 1)     (Step 2)     (Step 3)
```

### Veri Akışı:
1. **connectycube_users.json** + **connectycube_profiles.json** → **merged.json**
2. **merged.json** → **Appwrite Users + Profiles**
3. **Photo IDs** → **DigitalOcean Spaces + profile_media**

---

## 🔧 Ön Gereksinimler

### Gerekli Dosyalar:
- ✅ `connectycube_users.json` (ConnectyCube user export)
- ✅ `connectycube_profiles.json` (ConnectyCube profile export)

### Sistem Gereksinimleri:
- ✅ Node.js v14+
- ✅ NPM dependencies (AWS SDK, Appwrite SDK, stream-json)
- ✅ Appwrite instance (endpoints, API keys)
- ✅ DigitalOcean Spaces (credentials, bucket)

### Appwrite Collections:
- ✅ Users collection
- ✅ Profiles collection (`683e4215002f4fb69d06`)
- ✅ Profile_media collection (`67f8e5a1b2c3d4e5f6789012`)

---

## 🚀 Migration Adımları

### Step 1: Data Preparation + Geohash Generation
**Klasör**: `data_preparation/`
**Amaç**: İki ayrı JSON dosyasını birleştir ve geohash field'ları ekle

```bash
cd data_preparation
node step1_merge.js
```

**Girdiler:**
- `connectycube_users.json` (30,850 users)
- `connectycube_profiles.json` (29,718 profiles)

**Çıktı:**
- `merged.json` (96.33% merge rate + %100 geohash coverage)

**Özellikler:**
- Stream processing (memory efficient)
- User-profile matching by ID
- ✨ **7-character geohash generation**
- ✨ **Country code normalization** (us → US, xk → XK)
- ✨ **Kosovo (XK) support**
- Automatic photo array creation
- Missing profile handling

---

### Step 2: Appwrite Migration
**Klasör**: `appwrite_migration/`
**Amaç**: Kullanıcıları ve profilleri Appwrite'a migrate et

```bash
cd appwrite_migration

# Önce cleanup (isteğe bağlı)
node step2_clean.js

# Sonra migration
node step2_migrate.js
```

**Girdiler:**
- `merged.json` (geohash field'ları ile)

**Çıktılar:**
- Appwrite Users
- Appwrite Profiles (geohash field'ları dahil)

**Özellikler:**
- Batch processing (10'lu gruplar)
- Retry logic (3 deneme)
- Validation & error handling
- ✨ **Geohash field'ları otomatik eklenir**
- Gender code mapping (1=man, 2=woman)
- ISO 8601 date conversion

---

### Step 3: Photo Migration
**Klasör**: `photo_migration/`
**Amaç**: ConnectyCube blob'larını DigitalOcean'a migrate et

```bash
cd photo_migration
node step3_photo_migration.js
```

**Girdiler:**
- `merged.json` (photo IDs)
- ConnectyCube blob API

**Çıktılar:**
- DigitalOcean Spaces photos
- Appwrite profile_media records

**Özellikler:**
- ConnectyCube blob download (`https://api.connectycube.com/blobs/{uid}/download`)
- Auto-format detection (JPEG, PNG, GIF, WebP)
- Duplicate prevention
- Concurrent uploads (5'li batch)
- Comprehensive error tracking

---

## 📁 Dosya Yapısı

```
migration/
├── README.md                    # Bu dosya (genel rehber)
├── config.js                    # Tüm konfigürasyon
├── appwrite.json               # Appwrite collections schema
├── merged.json                 # Output: Merged data (geohash ile)
├── connectycube_users.json     # Input: Users (30,850)
├── connectycube_profiles.json  # Input: Profiles (29,718)
├── package.json                # Dependencies
│
├── data_preparation/           # Data merging + geohash
│   ├── README.md
│   └── step1_merge.js
│
├── appwrite_migration/         # Appwrite migration
│   ├── README.md
│   ├── step2_clean.js          # Cleanup script
│   └── step2_migrate.js        # Migration script
│
└── photo_migration/            # Photo migration
    ├── README.md
    ├── README_PHOTO_MIGRATION.md # Detaylı photo rehberi
    └── step3_photo_migration.js
```

---

## ⚙️ Konfigürasyon

Tüm ayarlar `config.js` dosyasında merkezi olarak yönetilir:

```javascript
module.exports = {
  config: {
    // Appwrite Configuration
    endpoint: 'https://mobile-api.kipyo.com/v1',
    project: '6867d552001fa11c2dc3',
    databaseId: '657e07e99ad1b086d9a9',
    profileCollectionId: '683e4215002f4fb69d06',
    
    // Processing Limits
    maxUsers: 15,        // Test: 15, Production: 100000
    batchSize: 10,       // Concurrent operations
    
    // Photo Migration
    photoMigration: {
      oldSystemBaseUrl: 'https://api.connectycube.com/blobs',
      maxPhotos: 25,     // Test: 25, Production: 100000
      batchSize: 5,      // Concurrent photo uploads
      
      digitalOcean: {
        endpoint: 'fra1.digitaloceanspaces.com',
        bucketName: 'kipyo',
        baseUrl: 'https://kipyo.fra1.digitaloceanspaces.com'
      }
    }
  }
}
```

---

## 🚀 Hızlı Başlangıç

### 1. Dependencies Install
```bash
npm install
```

### 2. Test Migration (Küçük Batch)
```bash
# Config'te test ayarları yap:
# maxUsers: 15, maxPhotos: 25

# Adım adım çalıştır
node step1_merge.js
node step2_migrate.js  
node step3_photo_migration.js
```

### 3. Sonuçları Kontrol Et
```bash
# Appwrite'da users ve profiles sayısını kontrol et
# DigitalOcean'da fotoğrafları kontrol et
curl -I "https://kipyo.fra1.digitaloceanspaces.com/EXAMPLE_PHOTO_ID.jpg"
```

---

## 🔄 Aşamalı Migration (Önerilen)

### Phase 1: Veri Hazırlığı (1x)
```bash
node step1_merge.js
# merged.json oluştu (30,850 users)
```

### Phase 2: Kullanıcı Migration (Batch'ler halinde)
```bash
# İlk test: 15 kullanıcı
# config.js: maxUsers: 15
node step2_migrate.js

# Sonuçları kontrol et, sonra artır
# config.js: maxUsers: 100
node step2_migrate.js

# Devam et ta ki tüm kullanıcılar migrate olana kadar
# config.js: maxUsers: 100000
node step2_migrate.js
```

### Phase 3: Fotoğraf Migration (Batch'ler halinde)
```bash
# İlk test: 25 fotoğraf
# config.js: maxPhotos: 25
node step3_photo_migration.js

# Sonuçları kontrol et, sonra artır
# config.js: maxPhotos: 500
node step3_photo_migration.js

# Büyük batch'ler
# config.js: maxPhotos: 100000
node step3_photo_migration.js
```

---

## ⚡ Toplu Migration (Hızlı)

Tüm sistemi bir seferde çalıştırmak için:

### 1. Config'i Production'a Ayarla
```javascript
// config.js
maxUsers: 100000,
maxPhotos: 100000,
batchSize: 10, // Veya 20 (server kapasitesine göre)
```

### 2. Tüm Adımları Çalıştır
```bash
node step1_merge.js && node step2_migrate.js && node step3_photo_migration.js
```

### 3. Monitoring
```bash
# Log dosyası ile takip
node step3_photo_migration.js > migration.log 2>&1 &
tail -f migration.log
```

---

## 📊 Beklenen Sonuçlar

### Step 1 (Merge):
```
✅ Processed 30,850 users
✅ Merged 29,718 profiles (96.33%)
✅ Total photos found: 42,000+
✅ Output: merged.json (15MB+)
```

### Step 2 (Users):
```
✅ Created ~29,000 Appwrite users
✅ Created ~29,000 profile documents
✅ Success rate: ~98%+
✅ Failed: Duplicate emails, validation errors
```

### Step 3 (Photos):
```
✅ Downloaded ~42,000 ConnectyCube blobs
✅ Uploaded ~42,000 photos to DigitalOcean
✅ Created ~42,000 profile_media records
✅ Success rate: ~95%+ (404'lar excluded)
✅ Format distribution: ~90% JPEG, ~8% PNG, ~2% others
```

---

## 🛠️ Sorun Giderme

### Yaygın Sorunlar:

#### 1. Step1 - Memory Issues
```bash
# Büyük dosyalar için Node memory artır
node --max-old-space-size=4096 step1_merge.js
```

#### 2. Step2 - User Already Exists
```
Error: user_already_exists
Solution: Normal, skip ediliyor, devam et
```

#### 3. Step3 - ConnectyCube 404
```
Error: ConnectyCube blob not found
Solution: Normal, bazı blob'lar silinmiş olabilir
```

#### 4. Step3 - DigitalOcean Upload Fails
```bash
# Credentials kontrolü
# config.js digitalOcean settings'leri kontrol et
```

### Performance Tuning:

#### Hız Artırma:
```javascript
// config.js
batchSize: 20,        // 10'dan 20'ye çıkar
downloadTimeout: 60000, // 30s'den 60s'ye çıkar
```

#### Memory Optimize:
```javascript
// config.js  
maxUsers: 50,         // Küçük batch'ler
maxPhotos: 100,       // Küçük batch'ler
```

---

## 📞 Destek

### Log Dosyaları:
- Error'lar otomatik olarak console'da görünür
- Statistics her adımın sonunda yazdırılır

### Debugging:
```bash
# Verbose output için
DEBUG=* node step3_photo_migration.js

# Specific user test için
# step2_migrate.js'te specific email filtresi ekle
```

### Rollback:
- Step2 için: `node step2_clean.js`
- Step3 için: DigitalOcean'da manual cleanup
- profile_media için: Collection'ı temizle

---

## 🎯 Production Checklist

### Migration Öncesi:
- [ ] Test migration başarılı
- [ ] Appwrite collections hazır
- [ ] DigitalOcean bucket permissions OK
- [ ] Backup alındı
- [ ] Load balancing ayarlandı (gerekirse)

### Migration Sırası:
- [ ] Step1: merged.json oluşturuldu
- [ ] Step2: Users ve profiles migrate edildi
- [ ] Step3: Photos migrate edildi
- [ ] Statistics kontrol edildi

### Migration Sonrası:
- [ ] Sample user'lar test edildi
- [ ] Photo URL'ler erişilebilir
- [ ] Mobile app test edildi
- [ ] Performance monitoring aktif

---

**🎉 Migration tamamlandığında 30,000+ kullanıcı ve 40,000+ fotoğraf başarıyla Appwrite + DigitalOcean altyapısına taşınmış olacak!**