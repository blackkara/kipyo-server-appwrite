Kipyo Sunucu Yapılandırma Dökümanı - KAPSAMLI VERSİYON
Sunucu IP: 5.10.220.46
Tarih: 04 Ekim 2025
Son Güncelleme: 04 Ekim 2025 v2.0

📋 İçindekiler

Genel Bakış
Mimari
Dizin Yapısı
Appwrite Kurulumu
Kipyo Node.js API Kurulumu
DNS Yapılandırması
Yedekleme Sistemi
Felaket Kurtarma
SSL Sertifika Yönetimi
İzleme ve Bakım


📋 Genel Bakış
Bu sunucuda iki farklı servis aynı IP adresi üzerinde çalışmaktadır:
DomainServisPortAçıklamamobile-api.kipyo.comAppwrite80/443Self-hosted backend servisimobile-backend.kipyo.comNode.js API3000Dialog/Profil servisi
Reverse Proxy: Traefik 2.11 (Appwrite ile birlikte kurulu)

🏗️ Mimari
İnternet
    ↓
5.10.220.46 (Port 80/443)
    ↓
Traefik (Docker)
    ↓
    ├─→ mobile-api.kipyo.com → Appwrite Konteynerları
    └─→ mobile-backend.kipyo.com → Kipyo Node.js Konteyner (Port 3000)

📂 Dizin Yapısı
/root/
├── appwrite/
│   ├── docker-compose.yml    # Appwrite servisleri
│   └── .env                   # Appwrite yapılandırması (KRİTİK!)
│
├── kipyo/
│   ├── docker-compose.yml     # Kipyo Node.js servisi
│   ├── Dockerfile
│   ├── Dockerfile.production  # Kullanılan Dockerfile ✓
│   ├── .env
│   ├── server.js
│   ├── package.json
│   ├── kipyo-prod-firebase-adminsdk.json  # Firebase anahtarı
│   ├── google-translate-keyfile.json      # Google Cloud anahtarı
│   └── [diğer uygulama dosyaları]
│
├── appwrite_backups/          # Yerel yedekler (7 gün)
│   ├── db_backup_*.sql.gz
│   ├── env_backup_*.txt.gz
│   └── docker-compose_backup_*.yml.gz
│
├── backup_to_gdrive.sh        # Otomatik yedekleme script'i
└── KURULUM_DOKUMANI.md        # Bu dosya

🔧 Appwrite Kurulumu
Konum
bashcd /root/appwrite
Önemli Dosyalar
docker-compose.yml: Tüm Appwrite servisleri tanımlı
.env dosyası (KRİTİK - ASLA KAYBETMEYİN!):
bash_APP_DOMAIN=mobile-api.kipyo.com
_APP_DOMAIN_TARGET=mobile-api.kipyo.com
_APP_DOMAIN_TARGET_A=5.10.220.46
_APP_OPENSSL_KEY_V1=...           # ← ŞİFRELEME ANAHTARI - YEDEKLE!
_APP_DB_ROOT_PASS=...             # ← VERİTABANI ŞİFRESİ
Appwrite Yönetimi
bash# Servisleri başlat
cd /root/appwrite
docker-compose up -d

# Servisleri durdur
docker-compose down

# Logları görüntüle
docker-compose logs -f

# Belirli bir servisin logları
docker-compose logs -f appwrite

# Konteyner durumunu kontrol et
docker ps | grep appwrite

# Tüm Appwrite konteynerlerini listele
docker ps --filter "name=appwrite"
Traefik Yapılandırması
Traefik, Appwrite'ın docker-compose.yml içinde tanımlıdır:

Port 80/443 dinler
Let's Encrypt ile otomatik SSL sertifikası
Email: info@kipyo.com
PathPrefix routing kullanır (domain bazlı değil)


🚀 Kipyo Node.js API Kurulumu
Konum
bashcd /root/kipyo
Docker Image Build
bashcd /root/kipyo
docker build -f Dockerfile.production -t kipyo-app .
docker-compose.yml
yamlversion: '3.8'

services:
  kipyo:
    image: kipyo-app
    container_name: kipyo
    restart: unless-stopped
    networks:
      - appwrite
    ports:
      - "3000:3000"
    labels:
      - "traefik.enable=true"
      - "traefik.constraint-label-stack=appwrite"
      - "traefik.docker.network=appwrite"
      - "traefik.http.services.kipyo_backend.loadbalancer.server.port=3000"
      - "traefik.http.routers.kipyo_backend_http.entrypoints=appwrite_web"
      - "traefik.http.routers.kipyo_backend_http.rule=Host(`mobile-backend.kipyo.com`)"
      - "traefik.http.routers.kipyo_backend_http.service=kipyo_backend"
      - "traefik.http.routers.kipyo_backend_https.entrypoints=appwrite_websecure"
      - "traefik.http.routers.kipyo_backend_https.rule=Host(`mobile-backend.kipyo.com`)"
      - "traefik.http.routers.kipyo_backend_https.service=kipyo_backend"
      - "traefik.http.routers.kipyo_backend_https.tls=true"
      - "traefik.http.routers.kipyo_backend_https.tls.certresolver=letsencrypt"

networks:
  appwrite:
    external: true
Kipyo Servis Yönetimi
bash# Servisi başlat
cd /root/kipyo
docker-compose up -d

# Servisi durdur
docker-compose down

# Logları görüntüle
docker-compose logs -f kipyo

# Canlı log takibi
docker logs -f kipyo

# Konteyner durumunu kontrol et
docker ps | grep kipyo

# Konteyner içine gir (debug için)
docker exec -it kipyo sh

# Konteyner kaynak kullanımı
docker stats kipyo

🌐 DNS Yapılandırması
DNS sağlayıcınızda aşağıdaki kayıtlar tanımlı olmalı:
Tip: A
Host: mobile-api
Değer: 5.10.220.46
TTL: 3600

Tip: A
Host: mobile-backend
Değer: 5.10.220.46
TTL: 3600
DNS Kontrolü
bash# DNS çözümlemesini kontrol et
nslookup mobile-api.kipyo.com
nslookup mobile-backend.kipyo.com

# veya daha detaylı
dig mobile-api.kipyo.com
dig mobile-backend.kipyo.com

💾 Yedekleme Sistemi
Otomatik Yedekleme Script'i
Konum: /root/backup_to_gdrive.sh
bash#!/bin/bash

###########################################
# Appwrite TAM Yedekleme Script'i
# DB + .env + docker-compose.yml
###########################################

# Ayarlar
BACKUP_DIR="/root/appwrite_backups"
APPWRITE_DIR="/root/appwrite"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/appwrite_backup.log"

# Renk kodları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Log fonksiyonu
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "${GREEN}========================================${NC}"
log "${GREEN}TAM YEDEKLEME BAŞLATILDI: $DATE${NC}"
log "${GREEN}========================================${NC}"

# Backup dizini yoksa oluştur
mkdir -p $BACKUP_DIR

# .env dosyasından DB şifresini al
if [ -f "$APPWRITE_DIR/.env" ]; then
    DB_PASS=$(grep _APP_DB_ROOT_PASS $APPWRITE_DIR/.env | cut -d '=' -f2 | tr -d "'\"")
    log "✓ .env dosyası bulundu"
else
    log "${RED}✗ HATA: .env dosyası bulunamadı!${NC}"
    exit 1
fi

# 1. VERİTABANI YEDEĞİ
log "${YELLOW}[1/4] Veritabanı yedekleniyor...${NC}"
docker exec appwrite-mariadb mysqldump -u root -p"$DB_PASS" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    appwrite 2>/dev/null | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

if [ $? -eq 0 ]; then
    DB_SIZE=$(du -h $BACKUP_DIR/db_backup_$DATE.sql.gz | cut -f1)
    log "${GREEN}✓ Veritabanı yedeklendi: $DB_SIZE${NC}"
else
    log "${RED}✗ Veritabanı yedekleme HATASI!${NC}"
    exit 1
fi

# 2. .ENV DOSYASI YEDEĞİ (KRİTİK!)
log "${YELLOW}[2/4] .env dosyası yedekleniyor...${NC}"
if [ -f "$APPWRITE_DIR/.env" ]; then
    cp "$APPWRITE_DIR/.env" "$BACKUP_DIR/env_backup_$DATE.txt"
    gzip "$BACKUP_DIR/env_backup_$DATE.txt"
    log "${GREEN}✓ .env dosyası yedeklendi${NC}"
    log "${BLUE}  → İçeriği: _APP_OPENSSL_KEY_V1 (ŞİFRELEME ANAHTARI)${NC}"
else
    log "${RED}✗ .env dosyası bulunamadı!${NC}"
fi

# 3. DOCKER-COMPOSE.YML YEDEĞİ
log "${YELLOW}[3/4] docker-compose.yml yedekleniyor...${NC}"
if [ -f "$APPWRITE_DIR/docker-compose.yml" ]; then
    cp "$APPWRITE_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose_backup_$DATE.yml"
    gzip "$BACKUP_DIR/docker-compose_backup_$DATE.yml"
    log "${GREEN}✓ docker-compose.yml yedeklendi${NC}"
else
    log "${YELLOW}⚠ docker-compose.yml bulunamadı${NC}"
fi

# 4. GOOGLE DRIVE'A YÜKLE
log "${YELLOW}[4/4] Tüm yedekler Google Drive'a yükleniyor...${NC}"

rclone copy $BACKUP_DIR/db_backup_$DATE.sql.gz gdrive:AppwriteBackups/Database/ --progress 2>&1 | tee -a $LOG_FILE
if [ $? -eq 0 ]; then
    log "${GREEN}✓ Veritabanı Google Drive'a yüklendi${NC}"
fi

rclone copy $BACKUP_DIR/env_backup_$DATE.txt.gz gdrive:AppwriteBackups/Config/ --progress 2>&1 | tee -a $LOG_FILE
if [ $? -eq 0 ]; then
    log "${GREEN}✓ .env Google Drive'a yüklendi${NC}"
fi

if [ -f "$BACKUP_DIR/docker-compose_backup_$DATE.yml.gz" ]; then
    rclone copy $BACKUP_DIR/docker-compose_backup_$DATE.yml.gz gdrive:AppwriteBackups/Config/ --progress 2>&1 | tee -a $LOG_FILE
    if [ $? -eq 0 ]; then
        log "${GREEN}✓ docker-compose.yml Google Drive'a yüklendi${NC}"
    fi
fi

# 5. ESKİ YEDEKLERİ TEMİZLE
log "${YELLOW}Eski yedekler temizleniyor...${NC}"

find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "env_backup_*.txt.gz" -mtime +7 -delete
find $BACKUP_DIR -name "docker-compose_backup_*.yml.gz" -mtime +7 -delete
log "✓ Yerel eski yedekler temizlendi (>7 gün)"

rclone delete gdrive:AppwriteBackups/Database/ --min-age 30d 2>&1 | tee -a $LOG_FILE
rclone delete gdrive:AppwriteBackups/Config/ --min-age 90d 2>&1 | tee -a $LOG_FILE
log "✓ Google Drive eski yedekler temizlendi"

# 6. ÖZET
log "${GREEN}========================================${NC}"
log "${GREEN}TAM YEDEKLEME TAMAMLANDI!${NC}"
log "${GREEN}========================================${NC}"
log ""
log "${BLUE}Yedeklenen Dosyalar:${NC}"
log "  ✓ Veritabanı (appwrite)"
log "  ✓ .env (şifreleme anahtarı + şifreler)"
log "  ✓ docker-compose.yml (container yapılandırması)"

if [ -f "$BACKUP_DIR/db_backup_$DATE.sql.gz" ]; then
    DB_SIZE=$(du -h "$BACKUP_DIR/db_backup_$DATE.sql.gz" | cut -f1)
    log "  DB: $DB_SIZE"
fi

TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
log "  Toplam: $TOTAL_SIZE"

log "${GREEN}✅ Yedekleme başarıyla tamamlandı!${NC}"
exit 0
Yedekleme Kurulumu
bash# 1. rclone Kur
curl https://rclone.org/install.sh | sudo bash

# 2. Google Drive Yapılandır
rclone config
# n → Yeni remote oluştur
# İsim: gdrive
# Type: drive (Google Drive seç)
# Client ID/Secret: Boş bırak (Enter)
# Scope: drive (Full access)
# Browser'da Google hesabına giriş yap

# 3. Google Drive klasörlerini oluştur
rclone mkdir gdrive:AppwriteBackups
rclone mkdir gdrive:AppwriteBackups/Database
rclone mkdir gdrive:AppwriteBackups/Config

# 4. Script'i oluştur
nano /root/backup_to_gdrive.sh
# (Yukarıdaki script'i yapıştır)

# 5. İzin ver
chmod +x /root/backup_to_gdrive.sh

# 6. Test et
/root/backup_to_gdrive.sh

# 7. Kontrol et
rclone ls gdrive:AppwriteBackups/Database/
rclone ls gdrive:AppwriteBackups/Config/

# 8. Cron ile otomatikleştir (her gün 03:00'te)
crontab -e
# Ekle:
0 3 * * * /root/backup_to_gdrive.sh >> /var/log/appwrite_backup.log 2>&1
Yedek Politikası

Yerel Yedekler: 7 gün saklanır
Google Drive Database: 30 gün saklanır
Google Drive Config: 90 gün saklanır (kritik dosyalar)
Yedekleme Saati: Her gün 03:00


🔥 Felaket Kurtarma
SENARYO: Sunucu Tamamen Çöktü veya Yeni Sunucu Kurulumu
Süre: ~15 dakika
Gereksinimler: Google Drive erişimi
Adım 1: rclone Kur
bashcurl https://rclone.org/install.sh | sudo bash
Adım 2: Google Drive Bağlantısı
bashrclone config
# Önceki yapılandırmayı tekrarla
Adım 3: Appwrite Klasörünü Oluştur
bashmkdir -p /root/appwrite
cd /root/appwrite
Adım 4: .env Dosyasını Geri Yükle
bash# En son yedeği listele
rclone ls gdrive:AppwriteBackups/Config/ | grep env_backup

# En son yedeği indir (tarih en yeni olanı seç)
rclone copy gdrive:AppwriteBackups/Config/env_backup_20251003_060001.txt.gz ./

# Aç
gunzip env_backup_20251003_060001.txt.gz

# Yeniden adlandır
mv env_backup_20251003_060001.txt .env
Adım 5: docker-compose.yml Geri Yükle
bash# En son yedeği indir
rclone copy gdrive:AppwriteBackups/Config/docker-compose_backup_20251003_060001.yml.gz ./

# Aç
gunzip docker-compose_backup_20251003_060001.yml.gz

# Yeniden adlandır
mv docker-compose_backup_20251003_060001.yml docker-compose.yml
Adım 6: Container'ları Başlat
bashdocker compose up -d

# MariaDB'nin hazır olmasını bekle (3 dakika)
sleep 180
Adım 7: Veritabanı Şifresini Al
bashDB_PASS=$(grep _APP_DB_ROOT_PASS .env | cut -d '=' -f2 | tr -d "'\"")
echo "DB Şifresi: $DB_PASS"
Adım 8: Veritabanı Yedeğini İndir ve Geri Yükle
bash# En son DB yedeğini listele
rclone ls gdrive:AppwriteBackups/Database/ | grep db_backup

# En son yedeği indir
rclone copy gdrive:AppwriteBackups/Database/db_backup_20251003_060001.sql.gz ./

# Aç
gunzip db_backup_20251003_060001.sql.gz

# Geri yükle (1-2 dakika sürer)
cat db_backup_20251003_060001.sql | docker exec -i appwrite-mariadb mysql -u root -p"$DB_PASS" appwrite

# Container'ları yeniden başlat
docker compose restart

# 30 saniye bekle
sleep 30
Adım 9: Test Et
bashcurl http://mobile-api.kipyo.com
curl https://mobile-api.kipyo.com
Tamamlandı! Sistem tamamen geri yüklendi.

Diğer Felaket Senaryoları
Senaryo 1: Kipyo Servisi Çalışmıyor
bash# 1. Konteyner durumunu kontrol et
docker ps -a | grep kipyo

# 2. Logları kontrol et
docker logs kipyo --tail 100

# 3. Konteyner varsa yeniden başlat
docker restart kipyo

# 4. Konteyner yoksa yeniden oluştur
cd /root/kipyo
docker-compose up -d

# 5. Hala çalışmıyorsa image'ı yeniden build et
docker build -f Dockerfile.production -t kipyo-app .
docker-compose down
docker-compose up -d
Senaryo 2: Appwrite Servisi Çalışmıyor
bash# 1. Tüm Appwrite konteynerlerini kontrol et
docker ps | grep appwrite

# 2. Traefik loglarını kontrol et
docker logs appwrite-traefik --tail 100

# 3. MariaDB durumunu kontrol et
docker logs appwrite-mariadb --tail 50

# 4. Tüm servisleri yeniden başlat
cd /root/appwrite
docker-compose restart

# 5. Gerekirse tamamen durdur ve başlat
docker-compose down
docker-compose up -d
Senaryo 3: .env Dosyası Kayboldu
bash# KRİTİK: Bu dosya olmadan sistem çalışmaz!
cd /root/appwrite

# Google Drive'dan en son .env'i geri yükle
rclone copy gdrive:AppwriteBackups/Config/env_backup_$(date +%Y%m%d)*.txt.gz ./
gunzip env_backup_*.txt.gz
mv env_backup_*.txt .env

# Container'ları yeniden başlat
docker-compose restart

🔐 SSL Sertifika Yönetimi
Otomatik Yenileme (Let's Encrypt)
Traefik otomatik olarak SSL sertifikalarını yeniler. Ancak sorun çıkarsa:
bash# Traefik'i durdur
docker stop appwrite-traefik

# Certbot ile manuel yenile
certbot renew

# Sertifikaları Traefik volume'üne kopyala
docker run --rm \
  -v appwrite_appwrite-certificates:/certs \
  -v /etc/letsencrypt:/letsencrypt \
  alpine sh -c "cp /letsencrypt/live/mobile-api.kipyo.com/fullchain.pem /certs/cert.pem && \
                cp /letsencrypt/live/mobile-api.kipyo.com/privkey.pem /certs/key.pem"

# Traefik'i başlat
docker start appwrite-traefik
Sertifika Sorunları
bash# 1. Traefik sertifika klasörünü kontrol et
docker exec appwrite-traefik ls -la /storage/certificates/

# 2. Bozuk sertifikaları sil
docker exec appwrite-traefik rm -rf /storage/certificates/mobile-backend.kipyo.com/

# 3. Traefik'i yeniden başlat (otomatik yenileme için)
docker restart appwrite-traefik

# 4. 2-3 dakika bekle, Let's Encrypt otomatik çalışacak

# 5. Logları kontrol et
docker logs appwrite-traefik --tail 50 | grep -i acme

🧪 Test ve Doğrulama
Servis Durumu Kontrolü
bash# Tüm konteynerleri listele
docker ps

# Port dinlemelerini kontrol et
sudo ss -tulpn | grep LISTEN

# Appwrite için beklenen portlar: 80, 443, 9000, 9443
# Kipyo için beklenen port: 3000
HTTP/HTTPS Testleri
bash# Appwrite test
curl http://mobile-api.kipyo.com
curl https://mobile-api.kipyo.com

# Kipyo test
curl http://mobile-backend.kipyo.com
curl https://mobile-backend.kipyo.com

# Lokal test (DNS olmadan)
curl -H "Host: mobile-backend.kipyo.com" http://localhost:3000
Beklenen Kipyo API Yanıtı
json{
  "message": "Dialog Service API",
  "version": "1.0.0",
  "status": "healthy",
  "timestamp": "2025-10-04T13:38:13.616Z",
  "endpoints": {
    "POST /api/dialogs": "Create or get dialog",
    "GET /api/dialogs/health": "Health check",
    "POST /api/profile/update": "Update profile",
    "POST /api/profile/uploadPhoto": "Upload photo",
    "GET /api/explore": "Explore profiles",
    "POST /api/interactions": "Create interaction",
    "GET /api/matches": "Get matches",
    "POST /api/messages": "Send message"
  }
}

📊 İzleme Komutları
bash# Disk kullanımı
df -h

# Docker disk kullanımı
docker system df

# Konteyner kaynak kullanımı
docker stats

# Eski/kullanılmayan imajları temizle
docker system prune -a

# Network kontrolü
docker network ls
docker network inspect appwrite

# Yedek boyutları
du -sh /root/appwrite_backups/

# Log dosyası boyutu
ls -lh /var/log/appwrite_backup.log

🔄 Güncelleme Prosedürü
Kipyo Uygulaması Güncelleme
bash# 1. Yeni kodu sunucuya aktar
cd /root/kipyo
git pull  # veya scp ile yeni dosyaları kopyala

# 2. Image'ı yeniden build et
docker build -f Dockerfile.production -t kipyo-app .

# 3. Eski konteyner durdur
docker-compose down

# 4. Yeni konteyner başlat
docker-compose up -d

# 5. Logları kontrol et
docker-compose logs -f kipyo
Appwrite Güncelleme
bash# 1. ÖNCE YEDEK AL!
/root/backup_to_gdrive.sh

# 2. Konteyner versiyonlarını kontrol et
docker ps --format "{{.Names}}\t{{.Image}}"

# 3. docker-compose.yml'de image versiyonunu güncelle
cd /root/appwrite
nano docker-compose.yml
# image: appwrite/appwrite:1.7.4 → 1.8.0 gibi

# 4. Yeni image'ı çek
docker-compose pull

# 5. Servisleri yeniden başlat
docker-compose up -d

# 6. Logları takip et
docker-compose logs -f

📞 Sorun Giderme Checklist
Bir sorun olduğunda sırasıyla kontrol edin:

 Konteynerler çalışıyor mu? (docker ps)
 DNS kayıtları doğru mu? (nslookup)
 Traefik loglarında hata var mı? (docker logs appwrite-traefik)
 Port 80/443 dinleniyor mu? (ss -tulpn | grep ':80\|:443')
 SSL sertifikaları geçerli mi?
 Disk dolmuş mu? (df -h)
 .env dosyası mevcut mu?
 MariaDB çalışıyor mu? (docker exec appwrite-mariadb mysqladmin ping)
 Yedekler güncel mi? (rclone ls gdrive:AppwriteBackups/Database/)


📝 Önemli Notlar

Network: Hem Appwrite hem Kipyo appwrite Docker network'ünü kullanır
Restart Policy: Tüm konteynerler unless-stopped ile yapılandırılmış
Portlar: Kipyo'nun 3000 portu hem Traefik hem de direkt erişim için açık
Traefik: Appwrite kurulumu ile gelir, ayrı kurulum gerektirmez
SSL: Let's Encrypt otomatik yenileme aktif
.env dosyası: En kritik dosya - mutlaka yedeklenmeli
Yedekler: Otomatik olarak her gün 03:00'te alınır


🔗 Faydalı Linkler

Appwrite Dashboard: https://mobile-api.kipyo.com
Kipyo API: https://mobile-backend.kipyo.com
Google Drive Yedekler: https://drive.google.com/drive/folders/AppwriteBackups
Portainer (varsa): https://5.10.220.46:9443


🆘 Acil Durum Kılavuzu
Sistem Tamamen Çöktü
bash# 1. Panik yapma
# 2. Bu dökümanı oku
# 3. "Felaket Kurtarma" bölümünü takip et
# 4. Yedekler Google Drive'da: AppwriteBackups/
Kritik Dosyalar Kayboldu
bash# .env kayboldu?
rclone copy gdrive:AppwriteBackups/Config/ /root/appwrite/ --include "env_backup_*"

# docker-compose.yml kayboldu?
rclone copy gdrive:AppwriteBackups/Config/ /root/appwrite/ --include "docker-compose_*"

Son Güncelleme: 04 Ekim 2025
Döküman Versiyonu: 2.0
Yazar: Sistem Yöneticisi
Durum: Üretim Ortamı