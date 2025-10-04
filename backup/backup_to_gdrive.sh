#!/bin/bash

###########################################
# Appwrite TAM Yedekleme Script'i
# DB + .env + docker-compose.yml
###########################################

# Ayarlar
BACKUP_DIR="/root/appwrite_backups"
APPWRITE_DIR="/root/appwrite"  # Appwrite kurulum dizini
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
    log "${YELLOW}⚠ docker-compose.yml bulunamadı (muhtemelen farklı konumda)${NC}"
fi

# 4. GOOGLE DRIVE'A YÜKLE
log "${YELLOW}[4/4] Tüm yedekler Google Drive'a yükleniyor...${NC}"

# Veritabanı
rclone copy $BACKUP_DIR/db_backup_$DATE.sql.gz gdrive:AppwriteBackups/Database/ --progress 2>&1 | tee -a $LOG_FILE
if [ $? -eq 0 ]; then
    log "${GREEN}✓ Veritabanı Google Drive'a yüklendi${NC}"
fi

# .env
rclone copy $BACKUP_DIR/env_backup_$DATE.txt.gz gdrive:AppwriteBackups/Config/ --progress 2>&1 | tee -a $LOG_FILE
if [ $? -eq 0 ]; then
    log "${GREEN}✓ .env Google Drive'a yüklendi${NC}"
fi

# docker-compose.yml
if [ -f "$BACKUP_DIR/docker-compose_backup_$DATE.yml.gz" ]; then
    rclone copy $BACKUP_DIR/docker-compose_backup_$DATE.yml.gz gdrive:AppwriteBackups/Config/ --progress 2>&1 | tee -a $LOG_FILE
    if [ $? -eq 0 ]; then
        log "${GREEN}✓ docker-compose.yml Google Drive'a yüklendi${NC}"
    fi
fi

# 5. ESKİ YEDEKLERİ TEMİZLE
log "${YELLOW}Eski yedekler temizleniyor...${NC}"

# Yerel: 7 günden eski
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "env_backup_*.txt.gz" -mtime +7 -delete
find $BACKUP_DIR -name "docker-compose_backup_*.yml.gz" -mtime +7 -delete
log "✓ Yerel eski yedekler temizlendi (>7 gün)"

# Google Drive: 30 günden eski
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
log ""
log "Yerel konum: $BACKUP_DIR"
log "Google Drive: https://drive.google.com/drive/u/0/my-drive"
log ""

# Dosya boyutları
log "${BLUE}Yedek Boyutları:${NC}"
if [ -f "$BACKUP_DIR/db_backup_$DATE.sql.gz" ]; then
    DB_SIZE=$(du -h "$BACKUP_DIR/db_backup_$DATE.sql.gz" | cut -f1)
    log "  DB: $DB_SIZE"
fi
if [ -f "$BACKUP_DIR/env_backup_$DATE.txt.gz" ]; then
    ENV_SIZE=$(du -h "$BACKUP_DIR/env_backup_$DATE.txt.gz" | cut -f1)
    log "  .env: $ENV_SIZE"
fi
if [ -f "$BACKUP_DIR/docker-compose_backup_$DATE.yml.gz" ]; then
    COMPOSE_SIZE=$(du -h "$BACKUP_DIR/docker-compose_backup_$DATE.yml.gz" | cut -f1)
    log "  docker-compose: $COMPOSE_SIZE"
fi

# Toplam boyut
TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
log "  Toplam: $TOTAL_SIZE"
log ""

# Disk kullanımı
DISK_USAGE=$(df -h $BACKUP_DIR | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')
log "${BLUE}Disk kullanımı:${NC} $DISK_USAGE"

log ""
log "${GREEN}✅ Yedekleme başarıyla tamamlandı!${NC}"
exit 0