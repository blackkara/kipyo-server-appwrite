# Explore Module Documentation

## Genel Bakış

Explore modülü, uygulamanın kart keşfetme (swipe) özelliğinin çekirdeğini oluşturur. Bu modül, kullanıcılara gösterilecek profil kartlarını filtreleyerek, kişiselleştirilmiş ve optimized bir keşif deneyimi sunar.

## Ana Özellikler

### Kart Filtreleme Sistemi
Explore modülü, kullanıcılara uygun olmayan kartları filtrelemek için çok katmanlı bir exclusion sistemi kullanır:

- **Yaş Filtreleme**: Kullanıcı tercihlerine göre minimum/maksimum yaş sınırları
- **Cinsiyet Filtreleme**: Tercih edilen cinsiyet seçenekleri (kadın, erkek, non-binary)
- **Coğrafi Filtreleme**: Engellenen ülke kodları
- **Mesafe Hesaplama**: Geohash tabanlı mesafe hesaplaması

### Exclusion (Hariç Tutma) Sistemleri

#### 1. Eşleşme Geçmişi
- **Matches**: Daha önce karşılıklı beğeni (match) oluşmuş kullanıcılar
- **Recent Likes**: Henüz expire olmamış beğeniler
- **Recent Dislikes**: Son 90 gün içinde beğenilmeyen kullanıcılar

#### 2. Sosyal Etkileşimler
- **Dialogs**: Dahil olduğu tüm dialog/konuşmalarda bulunan kullanıcılar (direkt mesaj, normal sohbet vs.)
- **Blocks**: Karşılıklı olarak engellenmiş kullanıcılar

#### 3. Sistem Korumaları
- **Self Exclusion**: Kullanıcının kendi profilinin gösterilmemesi

## Core API

### `getSwipeCards(requestingUser, jwtToken, filters, requestId, log, options)`

Ana kart getirme fonksiyonu. Tüm filtreleme ve exclusion mantıklarını uygular.

## Konfigürasyon Seçenekleri

### Options Parametresi
`getSwipeCards` fonksiyonu, çeşitli exclusion türlerini kontrol eden bir options parametresi kabul eder:

```javascript
const options = {
  includeMatches: true,          // Eşleşmeleri exclude et
  includeRecentDislikes: true,   // Son dislike'ları exclude et
  includeRecentLikes: true,      // Geçerli like'ları exclude et
  includeBlocks: true,           // Engellenen kullanıcıları exclude et
  includeDialogs: true,          // Dahil olduğu tüm dialogları exclude et
  dislikesTimeframeDays: 90      // Dislike zaman aralığı (gün)
};
```

### Performans Optimizasyonları
- **Paralel Query Execution**: Tüm exclusion sorguları paralel olarak çalışır
- **Batch Processing**: Toplu veri işleme ile performans optimizasyonu
- **Selective Querying**: Sadece gerekli exclusion türleri sorgulanır

## Teknik Detaylar

### Veri Modeli
Explore modülü aşağıdaki collections ile etkileşim kurar:
- **Profiles**: Ana profil verileri
- **Matches**: Karşılıklı beğeni kayıtları
- **Likes**: Beğeni kayıtları (expire date ile)
- **Dislikes**: Beğenmeme kayıtları (zaman bazlı)
- **Blocks**: Engelleme kayıtları
- **Dialogs**: Mesajlaşma diyalogları
- **Profile Media**: Profil medyaları
- **Profile Preferences**: Kullanıcı tercihleri

### Geohash ve Mesafe Hesaplaması
Modül, kullanıcılar arası mesafe hesaplaması için Haversine formülü kullanır:
- Base32 geohash decode algoritması
- Kilometre cinsinden hassas mesafe hesaplaması
- Null-safe işlemler

### Index Gereksinimleri
Optimal performans için aşağıdaki indexler önerilir:
- `profiles`: `birthDate`, `gender`, `countryCode`, `geohash`
- `matches`: `userFirst`, `userSecond`
- `likes`: `likerId`, `expireDate`
- `dislikes`: `dislikerId`, `$createdAt`
- `blocks`: `blockerId`, `blockedId`
- `dialogs`: `occupantIds`, `isDirect`

## Development Guidelines

### Kod Değişiklikleri Yaparken
1. **Performance Impact**: Yeni exclusion türleri eklerken paralel query yapısını koruyun
2. **Backward Compatibility**: Mevcut API'yi bozmamaya dikkat edin
3. **Error Handling**: Robust error handling ekleyin
4. **Logging**: İşlem adımlarını detaylı loglayın

### Test Stratejisi
- **Unit Tests**: Her exclusion türü için ayrı test
- **Integration Tests**: Gerçek veri ile end-to-end test
- **Performance Tests**: Büyük veri setlerinde performans testi
- **Edge Cases**: Null/undefined değerler için test

### Monitoring ve Debugging
- **Request ID Tracking**: Her işlem için unique request ID
- **Performance Metrics**: Query süreleri ve exclusion sayıları
- **Error Logging**: Detaylı hata mesajları
- **Debug Logs**: Geliştirme aşamasında verbose logging

## Dosya Yapısı
```
explore/
├── exploreService.js     # Ana servis logic'i
├── README.md            # Bu döküman
└── [test dosyaları]     # Gelecekteki test dosyaları
```

## İlgili Modüller
- **Message Module**: Direkt mesajlaşma işlemleri
- **Profile Module**: Profil yönetimi
- **Dialog Module**: Sohbet diyalogları
- **Like/Dislike System**: Beğeni sistemi

## Changelog
- **v1.0**: İlk versiyon - temel kart filtreleme
- **v1.1**: Dialog exclusion eklendi (tüm sohbet türleri)
- **v1.2**: Geohash tabanlı mesafe hesaplaması
- **v1.3**: Performance optimizasyonları

---
*Bu döküman Explore modülünün genel çalışma prensiplerini açıklar. Detaylı API dokümantasyonu için ilgili endpoint dosyalarına bakınız.*