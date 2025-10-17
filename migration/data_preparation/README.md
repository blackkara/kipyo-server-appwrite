# Step 1: Data Merging + Geohash Generation

Bu step ConnectyCube verilerini birleştirip her profile için geohash field'ı ekler.

## 🚀 Çalıştırma

```bash
cd step1_merge
node step1_merge.js
```

## 📊 Ne Yapar?

1. **connectycube_users.json** + **connectycube_profiles.json** → **merged.json**
2. **Country code düzeltme** (us → US, xk → XK, etc.)
3. **7-karakter geohash** ekleme (capital city koordinatları kullanarak)
4. **%100 coverage** garantisi

## 📁 Input/Output

### Input:
- `../../connectycube_users.json` (30,850+ users)
- `../../connectycube_profiles.json` (29,000+ profiles)

### Output:
- `../merged.json` (geohash field'ı ile birlikte)

## 📈 Beklenen Sonuçlar

```
Users processed: 30,850
Profiles loaded: 29,842
Users with profiles: 29,719 (96.33%)
Geohashes generated: 29,719 (100.00%)
Geohash errors: 0
```

## 🔧 Özellikler

- ✅ **Stream processing** (memory efficient)
- ✅ **Country code normalization**
- ✅ **Geohash generation**
- ✅ **Error tracking**
- ✅ **Statistics reporting**
- ✅ **Kosovo (XK) support**

## ⚡ Performans

- **Süre**: ~2-3 saniye
- **Memory**: Efficient streaming
- **Success rate**: %100