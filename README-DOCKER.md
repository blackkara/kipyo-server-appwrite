# Docker Kurulum Rehberi

## Gereksinimler
- Docker
- Docker Compose

## Kurulum Adımları

### 1. Environment Değişkenleri
Backend klasöründe `.env` dosyası oluşturulmalı ve gerekli değişkenler tanımlanmalıdır.

### 2. Gerekli Dosyalar
Aşağıdaki dosyaların backend klasöründe bulunması gerekir:
- `kipyo-prod-firebase-adminsdk.json` - Firebase Admin SDK credentials
- `google-translate-keyfile.json` - Google Cloud Translation API credentials

### 3. Docker İle Çalıştırma

#### Development Build
```bash
# Docker image'ı build et
docker build -t kipyo-backend ./backend

# Container'ı çalıştır
docker run -p 3000:3000 --env-file ./backend/.env kipyo-backend
```

#### Docker Compose İle Çalıştırma
```bash
# Servisi başlat
docker-compose up -d

# Logları görüntüle
docker-compose logs -f backend

# Servisi durdur
docker-compose down
```

#### Production Build
```bash
# Production image'ı build et
docker build -f ./backend/Dockerfile.production -t kipyo-backend:prod ./backend

# Production container'ı çalıştır
docker run -d \
  --name kipyo-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file ./backend/.env \
  -v $(pwd)/backend/kipyo-prod-firebase-adminsdk.json:/app/kipyo-prod-firebase-adminsdk.json:ro \
  -v $(pwd)/backend/google-translate-keyfile.json:/app/google-translate-keyfile.json:ro \
  kipyo-backend:prod
```

## Container Yönetimi

### Container'ı Durdurma
```bash
docker stop kipyo-backend
```

### Container'ı Silme
```bash
docker rm kipyo-backend
```

### Image'ı Silme
```bash
docker rmi kipyo-backend
```

### Container Loglarını Görüntüleme
```bash
docker logs kipyo-backend
```

### Container'a Bağlanma
```bash
docker exec -it kipyo-backend sh
```

## Health Check
Uygulama sağlık kontrolü için `/health` endpoint'i kullanılabilir:
```bash
curl http://localhost:3000/health
```

## Notlar
- `.env` dosyası Docker image'a dahil edilmez, runtime'da container'a aktarılır
- Firebase ve Google Cloud credential dosyaları güvenlik nedeniyle volume olarak mount edilir
- Production build'de multi-stage build kullanılarak image boyutu optimize edilmiştir
- Production'da `dumb-init` kullanılarak process management iyileştirilmiştir