# Node.js base image kullan
FROM node:20-alpine

# Çalışma dizinini ayarla
WORKDIR /app

# Package dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm ci --only=production

# Uygulama kodlarını kopyala
COPY . .

# Firebase admin SDK ve Google Cloud keyfile dosyalarının varlığını kontrol et
# Build zamanında bu dosyaların olması gerektiğini belirt
RUN test -f kipyo-prod-firebase-adminsdk.json || echo "Warning: Firebase admin SDK file not found"
RUN test -f google-translate-keyfile.json || echo "Warning: Google translate keyfile not found"

# Dosya izinlerini ayarla
RUN chmod 644 kipyo-prod-firebase-adminsdk.json 2>/dev/null || true
RUN chmod 644 google-translate-keyfile.json 2>/dev/null || true

# Uygulama portunu belirt
EXPOSE 3000

# Node.js kullanıcısına geç (güvenlik için)
USER node

# Uygulamayı başlat
CMD ["node", "server.js"]