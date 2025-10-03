# 🎓 Afet Kurtarma Komutları - Kelime Kelime Açıklama

Her satırı, hatta her kelimeyi detaylıca açıklıyorum:

---

## 📥 1. RCLONE KURULUMU

```bash
curl https://rclone.org/install.sh | sudo bash
```

### Kelime Kelime:

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `curl` | **C**ommand line **URL** aracı | İnternetten dosya indiren program |
| `https://rclone.org/install.sh` | Web adresi | rclone'un kurulum script'inin bulunduğu yer |
| `\|` | Pipe (boru) | Sol taraftaki komutun çıktısını sağ tarafa gönderir |
| `sudo` | **S**uper **U**ser **DO** | Komutu yönetici yetkisiyle çalıştırır |
| `bash` | Bourne Again Shell | İndirilen script'i çalıştıran program |

**Ne Oluyor?**
1. `curl` komutu install.sh dosyasını internetten **indirir**
2. `|` işareti bu dosyayı **bash'e gönderir**
3. `bash` dosyayı **çalıştırır** ve rclone'u sisteme kurar

**Sonuç:** rclone `/usr/bin/rclone` konumuna kurulur ve her yerden erişilebilir hale gelir.

---

## ⚙️ 2. GOOGLE DRIVE YAPILANDIRMASI

```bash
rclone config
```

### Kelime Kelime:

| Kelime | Ne Yapar? |
|--------|-----------|
| `rclone` | Kurduğumuz program |
| `config` | Yapılandırma komutu |

**Ne Oluyor?**
- İnteraktif bir menü açılır
- Google Drive bağlantısı için ayarlar yapılır
- Token alınarak Google hesabınıza erişim sağlanır

**Oluşturduğu Dosya:**
```
/root/.config/rclone/rclone.conf
```

**İçeriği:**
```ini
[gdrive]
type = drive
scope = drive
token = {"access_token":"ya29...","refresh_token":"1//0g..."}
```

---

## 📂 3. .ENV DOSYASINI GERİ YÜKLEME

### 3a. Google Drive'dan İndirme

```bash
rclone copy gdrive:AppwriteBackups/Config/env_backup_20251003_060001.txt.gz ./
```

### Kelime Kelime:

| Kelime/Karakter | Ne Yapar? | Açıklama |
|-----------------|-----------|----------|
| `rclone` | Program | Cloud storage aracı |
| `copy` | Kopyalama komutu | Dosyayı bir yerden başka yere kopyalar |
| `gdrive:` | Kaynak remote | Google Drive'ınız (config'de tanımladığınız) |
| `AppwriteBackups/Config/` | Kaynak klasör yolu | Google Drive'daki klasör |
| `env_backup_20251003_060001.txt.gz` | Dosya adı | Yedeklenmiş .env dosyası (sıkıştırılmış) |
| `./` | Hedef konum | Şu anki dizin (bulunduğunuz klasör) |

**Ne Oluyor?**
1. Google Drive'daki `AppwriteBackups/Config/` klasörüne gider
2. `env_backup_20251003_060001.txt.gz` dosyasını bulur
3. Bulunduğunuz dizine (`./`) kopyalar

**Sonuç:**
```
/root/appwrite/env_backup_20251003_060001.txt.gz  ← Yeni dosya burada
```

---

### 3b. Sıkıştırılmış Dosyayı Açma

```bash
gunzip env_backup_20251003_060001.txt.gz
```

### Kelime Kelime:

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `gunzip` | **G**NU **unzip** | .gz uzantılı sıkıştırılmış dosyaları açar |
| `env_backup_20251003_060001.txt.gz` | Dosya adı | Açılacak dosya |

**Ne Oluyor?**
1. `.gz` dosyasını açar (decompress)
2. Orijinal dosyayı oluşturur
3. `.gz` dosyasını otomatik siler

**Önce:**
```
env_backup_20251003_060001.txt.gz  (4 KB sıkıştırılmış)
```

**Sonra:**
```
env_backup_20251003_060001.txt  (12 KB normal)
```

---

### 3c. Dosyayı Yeniden Adlandırma

```bash
mv env_backup_20251003_060001.txt .env
```

### Kelime Kelime:

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `mv` | **M**o**v**e | Dosyayı taşır veya yeniden adlandırır |
| `env_backup_20251003_060001.txt` | Eski isim | Kaynak dosya |
| `.env` | Yeni isim | Hedef isim (Appwrite'ın aradığı isim) |

**Ne Oluyor?**
1. `env_backup_20251003_060001.txt` dosyasını alır
2. Adını `.env` olarak değiştirir
3. Eski dosya silinir, yeni isimle kalır

**Sonuç:**
```
/root/appwrite/.env  ← Appwrite'ın kullanacağı dosya
```

**Bu Dosya Çok Kritik Çünkü İçinde:**
- `_APP_OPENSSL_KEY_V1` → Şifreleme anahtarı (bunu kaybederseniz veriler çözülemez!)
- `_APP_DB_ROOT_PASS` → Veritabanı şifresi
- API anahtarları, secret'lar

---

## 📄 4. DOCKER-COMPOSE.YML GERİ YÜKLEME

### 4a. İndirme

```bash
rclone copy gdrive:AppwriteBackups/Config/docker-compose_backup_20251003_060001.yml.gz ./
```

**Aynı mantık .env ile, sadece dosya adı farklı:**
- Google Drive'dan `docker-compose_backup_*.yml.gz` indirilir
- Bulunduğunuz dizine kopyalanır

---

### 4b. Açma

```bash
gunzip docker-compose_backup_20251003_060001.yml.gz
```

**Ne Oluyor?**
- `.gz` uzantısını kaldırır
- Dosyayı açar

**Sonuç:**
```
docker-compose_backup_20251003_060001.yml
```

---

### 4c. Yeniden Adlandırma

```bash
mv docker-compose_backup_20251003_060001.yml docker-compose.yml
```

**Ne Oluyor?**
- Dosya adını `docker-compose.yml` yapar
- Bu Docker'ın aradığı standart isim

**Sonuç:**
```
/root/appwrite/docker-compose.yml  ← Docker bu dosyayı okur
```

**Bu Dosya Neyi İçerir?**
- Container tanımları (mariadb, redis, appwrite, vb.)
- Port ayarları
- Volume mount'ları
- Network yapılandırması

---

## 🐳 5. CONTAINER'LARI BAŞLATMA

```bash
docker compose up -d
```

### Kelime Kelime:

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `docker` | Docker programı | Container yönetim aracı |
| `compose` | Docker Compose | Çoklu container yöneticisi |
| `up` | Başlat komutu | Container'ları ayağa kaldırır |
| `-d` | **D**etached mode (flag) | Arka planda çalıştırır (terminal'i bloke etmez) |

**Ne Oluyor?**
1. `docker-compose.yml` dosyasını okur
2. Tanımlı tüm servisleri başlatır:
   - `appwrite-mariadb` → Veritabanı
   - `appwrite-redis` → Cache
   - `appwrite` → Ana uygulama
   - `appwrite-worker-*` → Arka plan işçileri
   - `appwrite-realtime` → WebSocket servisi
   - vs. (toplam ~20 container)

**Süreç:**
```
1. Container image'ları çeker (eğer yoksa)
2. Network oluşturur
3. Volume'ları mount eder
4. Container'ları başlatır
5. Hazır olduğunda terminal'e döner
```

---

### 5b. Bekleme

```bash
sleep 180
```

### Kelime Kelime:

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `sleep` | Bekle komutu | Belirtilen süre kadar bekler |
| `180` | Saniye | 180 saniye = 3 dakika |

**Neden Bekliyoruz?**
- Container'lar başlamaya başlar
- MariaDB'nin hazır olması gerekir
- Veritabanı tablolarını oluşturması lazım
- Eğer hemen DB'ye bağlanmaya çalışırsanız **"Connection refused"** hatası alırsınız

**Alternatif:** Döngü ile kontrol
```bash
until docker exec appwrite-mariadb mysqladmin ping -h localhost --silent; do
    echo "MariaDB henüz hazır değil, bekleniyor..."
    sleep 5
done
```

---

## 🔑 6. VERİTABANI ŞİFRESİNİ ALMA

```bash
DB_PASS=$(grep _APP_DB_ROOT_PASS .env | cut -d '=' -f2 | tr -d "'\"")
```

### Bu Satır Çok Önemli! Her Parçayı Açıklıyorum:

#### 6a. Değişken Ataması

| Karakter | Ne Yapar? |
|----------|-----------|
| `DB_PASS=` | `DB_PASS` adında bir değişken oluştur |
| `$(...)` | Parantez içindeki komutun çıktısını değişkene ata |

---

#### 6b. grep Komutu

```bash
grep _APP_DB_ROOT_PASS .env
```

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `grep` | **G**lobal **R**egular **E**xpression **P**rint | Dosyada metin arar |
| `_APP_DB_ROOT_PASS` | Arama metni | Bu kelimeyi içeren satırı bul |
| `.env` | Dosya | Hangi dosyada arayacak |

**Örnek .env içeriği:**
```bash
_APP_DB_USER=root
_APP_DB_ROOT_PASS='my$ecure@Pa$$w0rd!'
_APP_DB_SCHEMA=appwrite
```

**grep çıktısı:**
```
_APP_DB_ROOT_PASS='my$ecure@Pa$$w0rd!'
```

---

#### 6c. cut Komutu

```bash
| cut -d '=' -f2
```

| Parametre | Ne Yapar? | Açıklama |
|-----------|-----------|----------|
| `\|` | Pipe | Önceki komutun çıktısını sonrakine gönder |
| `cut` | Kes komutu | Metni parçalara ayırır |
| `-d '='` | **D**elimiter (ayırıcı) | `=` işaretini ayırıcı olarak kullan |
| `-f2` | **F**ield 2 | 2. parçayı al (= işaretinden sonraki kısım) |

**Giriş:**
```
_APP_DB_ROOT_PASS='my$ecure@Pa$$w0rd!'
```

**cut işlemi:**
```
Parça 1: _APP_DB_ROOT_PASS
Parça 2: 'my$ecure@Pa$$w0rd!'  ← Bunu alıyoruz
```

**Çıktı:**
```
'my$ecure@Pa$$w0rd!'
```

---

#### 6d. tr Komutu

```bash
| tr -d "'\"" 
```

| Parametre | Ne Yapar? | Açıklama |
|-----------|-----------|----------|
| `tr` | **Tr**anslate | Karakterleri dönüştürür veya siler |
| `-d` | **D**elete | Belirtilen karakterleri sil |
| `"'\""` | Silinecek karakterler | Tek tırnak `'` ve çift tırnak `"` |

**Giriş:**
```
'my$ecure@Pa$$w0rd!'
```

**tr işlemi:**
- Baştaki `'` sil
- Sondaki `'` sil

**Çıktı:**
```
my$ecure@Pa$$w0rd!
```

---

#### 6e. Son Durum

**Tüm pipeline:**
```bash
DB_PASS=$(grep _APP_DB_ROOT_PASS .env | cut -d '=' -f2 | tr -d "'\"")
```

**Adım adım:**
```
1. grep  → _APP_DB_ROOT_PASS='my$ecure@Pa$$w0rd!'
2. cut   → 'my$ecure@Pa$$w0rd!'
3. tr    → my$ecure@Pa$$w0rd!
4. $()   → DB_PASS değişkenine ata
```

**Sonuç:**
```bash
echo $DB_PASS
# Çıktı: my$ecure@Pa$$w0rd!
```

---

## 💾 7. VERİTABANI YEDEĞİNİ İNDİRME

```bash
rclone copy gdrive:AppwriteBackups/Database/db_backup_20251003_060001.sql.gz ./
```

**Aynı mantık önceki rclone copy ile:**
- Google Drive'dan DB yedeğini indirir
- Bulunduğunuz dizine kopyalar

**Sonuç:**
```
/root/appwrite/db_backup_20251003_060001.sql.gz  (3.7 MB)
```

---

## 📦 8. VERİTABANI YEDEĞİNİ AÇMA

```bash
gunzip db_backup_20251003_060001.sql.gz
```

**Ne Oluyor?**
- Sıkıştırılmış `.gz` dosyasını açar
- SQL dump dosyasını oluşturur

**Önce:**
```
db_backup_20251003_060001.sql.gz  (3.7 MB)
```

**Sonra:**
```
db_backup_20251003_060001.sql  (15 MB)
```

**SQL Dosyası Neyi İçerir?**
```sql
-- MySQL dump
CREATE TABLE `_1_users` (...);
INSERT INTO `_1_users` VALUES ('user1@mail.com', ...);
INSERT INTO `_1_users` VALUES ('user2@mail.com', ...);
...
CREATE TABLE `_1_database_3_collection_1` (...);
INSERT INTO `_1_database_3_collection_1` VALUES (...);
...
```

---

## 🔄 9. VERİTABANINI GERİ YÜKLEME

```bash
cat db_backup_20251003_060001.sql | docker exec -i appwrite-mariadb mysql -u root -p"$DB_PASS" appwrite
```

### Bu Komut Çok Karmaşık! Parçalara Ayıralım:

---

### 9a. cat Komutu

```bash
cat db_backup_20251003_060001.sql
```

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `cat` | Con**cat**enate | Dosya içeriğini ekrana/pipe'a yazar |
| `db_backup_*.sql` | Dosya adı | 15 MB SQL dosyası |

**Ne Yapıyor?**
- SQL dosyasının tüm içeriğini okur
- Pipe'a (`|`) gönderir

---

### 9b. Pipe (|)

```bash
|
```

**Ne Yapıyor?**
- Sol taraftaki `cat` çıktısını alır
- Sağ taraftaki `docker exec` komutuna **stdin** (standart girdi) olarak gönderir

---

### 9c. docker exec Komutu

```bash
docker exec -i appwrite-mariadb mysql -u root -p"$DB_PASS" appwrite
```

#### Parça Parça:

| Kelime/Parametre | Ne Yapar? | Açıklama |
|------------------|-----------|----------|
| `docker exec` | Container'da komut çalıştır | Çalışan container içinde komut yürütür |
| `-i` | **I**nteractive | stdin'i açık tutar (pipe'tan gelen veriyi alır) |
| `appwrite-mariadb` | Container adı | Hangi container'da çalışacak |
| `mysql` | MySQL client | MariaDB'ye bağlanan program |
| `-u root` | **U**ser: root | root kullanıcısı olarak bağlan |
| `-p"$DB_PASS"` | **P**assword | Şifre (değişkenden alınan) |
| `appwrite` | Database name | Hangi veritabanına bağlanacak |

---

### 9d. Tüm Süreç:

```
1. cat SQL dosyasını okur
   └─> "CREATE TABLE _1_users..."
   └─> "INSERT INTO _1_users VALUES..."
   └─> ... (binlerce satır)

2. | (pipe) bu veriyi docker exec'e gönderir

3. docker exec appwrite-mariadb container'ına girer

4. mysql client başlatır
   - Kullanıcı: root
   - Şifre: my$ecure@Pa$$w0rd!
   - Veritabanı: appwrite

5. stdin'den gelen SQL komutlarını çalıştırır
   - CREATE TABLE komutları tabloları oluşturur
   - INSERT INTO komutları verileri ekler

6. Tüm SQL dosyası işlenene kadar devam eder
```

**Süre:** 30 saniye - 2 dakika (DB boyutuna göre)

---

### 9e. Ne Oluyor Database'de?

**Önce:** (Boş/Yeni kurulum)
```sql
USE appwrite;
SHOW TABLES;
-- Empty set (hiç tablo yok)
```

**Sonra:** (Geri yükleme sonrası)
```sql
USE appwrite;
SHOW TABLES;
-- 158 rows (tüm tablolar geri geldi!)

SELECT COUNT(*) FROM _1_users;
-- 1250 users (tüm kullanıcılar geri geldi!)
```

---

## 🔄 10. CONTAINER'LARI YENİDEN BAŞLATMA

```bash
docker compose restart
```

### Kelime Kelime:

| Kelime | Ne Yapar? | Açıklama |
|--------|-----------|----------|
| `docker compose` | Docker Compose aracı | Çoklu container yöneticisi |
| `restart` | Yeniden başlat | Tüm container'ları durdur ve başlat |

**Ne Oluyor?**
1. Tüm container'ları **durdurur** (graceful stop)
2. Tüm container'ları **yeniden başlatır**

**Neden Gerekli?**
- Veritabanı değişti
- Cache'lerin temizlenmesi gerekir
- Appwrite container'larının yeni DB'yi görmesi lazım
- Connection pool'lar yenilenmeli

**Süre:** 30-60 saniye

---

## ✅ 11. İŞLEM TAMAMLANDI!

**Artık:**
- ✅ Eski veritabanınız geri yüklendi
- ✅ Tüm kullanıcılar giriş yapabilir
- ✅ Tüm veriler yerinde
- ✅ Messaging providers çalışıyor
- ✅ API key'ler aktif

---

## 📊 KOMUTLARIN ÖZET TABLOSU

| Komut | Ne Yapar? | Süre |
|-------|-----------|------|
| `curl ... \| bash` | rclone'u indirir ve kurar | 30 sn |
| `rclone config` | Google Drive bağlantısı | 2 dk |
| `rclone copy` | Dosya indirir | 5-10 sn |
| `gunzip` | Sıkıştırılmış dosyayı açar | 1 sn |
| `mv` | Dosyayı yeniden adlandırır | Anında |
| `docker compose up -d` | Container'ları başlatır | 2 dk |
| `sleep 180` | 3 dakika bekler | 3 dk |
| `grep \| cut \| tr` | Şifreyi .env'den çıkartır | Anında |
| `cat \| docker exec` | DB'yi geri yükler | 1-2 dk |
| `docker compose restart` | Container'ları yeniden başlatır | 1 dk |

**Toplam Süre:** ~10-15 dakika

---

## 🎓 EK: BASH OPERATÖRLER SÖZLÜĞÜ

| Operatör | Adı | Ne Yapar? | Örnek |
|----------|-----|-----------|-------|
| `\|` | Pipe | Sol çıktıyı sağa gönder | `cat file \| grep "text"` |
| `>` | Redirect | Çıktıyı dosyaya yaz | `echo "hi" > file.txt` |
| `>>` | Append | Dosya sonuna ekle | `echo "hi" >> file.txt` |
| `<` | Input | Dosyadan oku | `mysql < dump.sql` |
| `$()` | Command substitution | Komut çıktısını al | `DIR=$(pwd)` |
| `${VAR}` | Variable | Değişken değeri | `echo ${DB_PASS}` |
| `"..."` | Double quotes | Değişkenleri genişletir | `echo "$USER"` |
| `'...'` | Single quotes | Literal string | `echo '$USER'` |
| `;` | Separator | Komutları ayır | `cd /tmp; ls` |
| `&&` | AND | İlki başarılıysa ikincisini çalıştır | `make && make install` |
| `\|\|` | OR | İlki başarısızsa ikincisini çalıştır | `cat file \|\| echo "fail"` |

---

## 🎯 ÖZET

Tüm bu komutlar:
1. **Yeni bir sunucuya** rclone kurar
2. **Google Drive'dan** yedekleri indirir
3. **Appwrite'ı** ayağa kaldırır
4. **Veritabanını** eski haline döndürür
5. **10-15 dakikada** sistemi çalışır hale getirir

Başka açıklamak istediğiniz komut var mı? 🤓