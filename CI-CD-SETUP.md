# 🚀 CI/CD Pipeline Kurulum Özeti

## ✅ Oluşturulan Yapı

### 🌳 Branch Yapısı
- ✅ `main` - Production branch
- ✅ `staging` - Pre-production test branch
- ✅ `develop` - Development branch

### 🔄 GitHub Actions Workflows

#### 1. **feature-ci.yml** - Feature Branch CI
- **Tetiklenme:** `develop` branch'ine PR açıldığında
- **İşlemler:**
  - Lint kontrolü
  - Test çalıştırma
  - Security audit
  - Docker build kontrolü
  - PR'a yorum ekleme

#### 2. **staging-deploy.yml** - Staging Deployment
- **Tetiklenme:** `staging` branch'ine push veya PR
- **İşlemler:**
  - Test suite çalıştırma
  - Docker image build & push
  - Staging sunucusuna deploy
  - Health check
  - Bildirim gönderme

#### 3. **production-deploy.yml** - Production Deployment
- **Tetiklenme:** `main` branch'ine merge edilen PR
- **İşlemler:**
  - Security scan
  - Version tag oluşturma
  - Production Docker image build & push
  - Production deploy
  - Health check & smoke tests
  - Success/failure bildirimi

### 📄 Dokümantasyon
- ✅ `CONTRIBUTING.md` - Katkı kuralları
- ✅ `.env.example` - Environment variables şablonu
- ✅ `.github/PULL_REQUEST_TEMPLATE.md` - PR şablonu

---

## 🎯 Sonraki Adımlar

### 1. Package.json Test Scripts Ekleyin

`backend/package.json` dosyasını güncelleyin:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:integration": "jest --testMatch '**/*.integration.test.js'",
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"**/*.{js,json,md}\"",
    "format:check": "prettier --check \"**/*.{js,json,md}\""
  }
}
```

### 2. ESLint & Prettier Kurulumu

```bash
cd backend

# ESLint kurulumu
npm install --save-dev eslint eslint-config-airbnb-base eslint-plugin-import

# Prettier kurulumu
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier

# Jest kurulumu (eğer yoksa)
npm install --save-dev jest supertest @types/jest
```

**`.eslintrc.json` oluşturun:**
```json
{
  "extends": ["airbnb-base", "prettier"],
  "plugins": ["prettier"],
  "env": {
    "node": true,
    "es2021": true,
    "jest": true
  },
  "rules": {
    "prettier/prettier": "error",
    "no-console": "off",
    "import/extensions": ["error", "ignorePackages"]
  }
}
```

**`.prettierrc` oluşturun:**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### 3. GitHub Secrets Yapılandırması

Repository Settings → Secrets → Actions → New repository secret:

**Gerekli Secrets:**
```
STAGING_SERVER_HOST=your-staging-server.com
STAGING_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----...
PRODUCTION_SERVER_HOST=your-production-server.com
PRODUCTION_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----...
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL (opsiyonel)
```

**GitHub Container Registry için:**
- `GITHUB_TOKEN` otomatik olarak mevcut, ek konfigürasyon gerekmez

### 4. GitHub Variables Yapılandırması

Repository Settings → Secrets → Variables → New repository variable:

```
STAGING_URL=https://staging.yourdomain.com
PRODUCTION_URL=https://yourdomain.com
```

### 5. GitHub Environments Oluşturun

Repository Settings → Environments:

#### **staging** environment:
- Protection rules: Required reviewers (0 veya 1)
- Environment secrets (staging-specific)

#### **production** environment:
- Protection rules: Required reviewers (1 veya 2)
- Wait timer: 5 dakika (opsiyonel)
- Environment secrets (production-specific)

### 6. Branch Protection Rules

**Settings → Branches → Add rule**

**`main` branch için:**
- Branch name pattern: `main`
- ☑️ Require a pull request before merging (2 approvals)
- ☑️ Require status checks to pass before merging
  - Required status checks: `security-scan`, `build-and-push`
- ☑️ Require conversation resolution
- ☑️ Do not allow bypassing

**`staging` branch için:**
- Branch name pattern: `staging`
- ☑️ Require a pull request before merging (1 approval)
- ☑️ Require status checks to pass before merging
  - Required status checks: `test`, `build-check`

**`develop` branch için:**
- Branch name pattern: `develop`
- ☑️ Require a pull request before merging (0-1 approval)
- ☑️ Require status checks to pass before merging
  - Required status checks: `lint-and-test`

### 7. İlk Test PR

Workflow'ları test etmek için:

```bash
# Feature branch oluşturun
git checkout develop
git checkout -b feature/test-ci-pipeline

# Basit bir değişiklik yapın
echo "# CI/CD Test" >> test.md
git add test.md
git commit -m "test: verify CI/CD pipeline"
git push -u origin feature/test-ci-pipeline

# GitHub'da develop'a PR açın
# Actions tab'ında workflow'un çalıştığını göreceksiniz
```

---

## 📊 Workflow Akış Şeması

```
Developer
    ↓
feature/abc branch oluştur
    ↓
Commit & Push
    ↓
PR aç (develop'a)
    ↓
feature-ci.yml çalışır
    ├─ lint-and-test
    ├─ security-audit
    └─ build-check
    ↓
Code Review & Merge
    ↓
develop branch
    ↓
PR aç (staging'e)
    ↓
staging-deploy.yml çalışır
    ├─ test
    ├─ build-and-push
    └─ deploy-staging
    ↓
staging branch
    ↓
Manual Test
    ↓
PR aç (main'e)
    ↓
production-deploy.yml çalışır
    ├─ security-scan
    ├─ create-version
    ├─ build-and-push
    └─ deploy-production
    ↓
🎉 Production Deploy!
```

---

## 🐛 Sorun Giderme

### CI/CD Çalışmıyor
1. GitHub Actions tab'ı kontrol edin
2. Workflow dosyalarında syntax hatası var mı?
3. Repository permissions kontrol edin

### Docker Build Hatası
1. `Dockerfile.production` doğru mu?
2. Tüm bağımlılıklar package.json'da mı?
3. `.dockerignore` doğru yapılandırılmış mı?

### Deployment Hatası
1. SSH keys doğru mu?
2. Server erişilebilir mi?
3. Environment variables set edilmiş mi?

---

## 📞 Destek

Sorun yaşarsanız:
1. GitHub Issues açın
2. Actions logs'larını kontrol edin
3. CONTRIBUTING.md'yi okuyun

---

## 🎉 Tebrikler!

CI/CD pipeline'ınız hazır! Artık profesyonel bir geliştirme süreciniz var.

**Önemli:** Deployment scriptlerini sunucu yapınıza göre özelleştirmeyi unutmayın!
