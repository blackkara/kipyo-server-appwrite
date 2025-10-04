# Contributing to Kipyo Server Appwrite

Kipyo Server projesine katkıda bulunduğunuz için teşekkürler! 🎉

## 📋 İçindekiler

- [Branch Stratejisi](#branch-stratejisi)
- [Geliştirme Akışı](#geliştirme-akışı)
- [Commit Mesaj Formatı](#commit-mesaj-formatı)
- [Pull Request Süreci](#pull-request-süreci)
- [Code Review](#code-review)
- [Test Yazma](#test-yazma)

---

## 🌳 Branch Stratejisi

Projemizde GitFlow-Light modeli kullanıyoruz:

```
main (production)
  ↑
staging (pre-production)
  ↑
develop (development)
  ↑
feature/* veya bugfix/*
```

### Branch Türleri

#### 1. **main**
- Production ortamı
- Sadece `staging` branch'inden PR kabul eder
- Her merge otomatik olarak production'a deploy olur
- **Asla doğrudan commit atmayın!**

#### 2. **staging**
- Pre-production test ortamı
- Sadece `develop` branch'inden PR kabul eder
- Test ortamına otomatik deploy olur

#### 3. **develop**
- Aktif geliştirme branch'i
- Feature branch'lerinden PR kabul eder
- Development ortamına otomatik deploy olur

#### 4. **feature/***
- Yeni özellikler için
- Format: `feature/[ticket-id]-[kısa-açıklama]`
- Örnek: `feature/KIP-123-add-user-auth`
- `develop` branch'inden oluşturulur

#### 5. **bugfix/***
- Bug düzeltmeleri için
- Format: `bugfix/[kısa-açıklama]`
- Örnek: `bugfix/fix-login-validation`
- `develop` branch'inden oluşturulur

#### 6. **hotfix/***
- Acil production düzeltmeleri için
- Format: `hotfix/[kısa-açıklama]`
- Örnek: `hotfix/fix-memory-leak`
- `main` branch'inden oluşturulur
- Hem `main` hem `develop`'a merge edilir

---

## 🔄 Geliştirme Akışı

### Yeni Özellik Geliştirme

```bash
# 1. Develop branch'ini güncelleyin
git checkout develop
git pull origin develop

# 2. Yeni feature branch oluşturun
git checkout -b feature/KIP-123-new-feature

# 3. Değişikliklerinizi yapın ve commit edin
git add .
git commit -m "feat: add new feature"

# 4. Branch'inizi push edin
git push -u origin feature/KIP-123-new-feature

# 5. GitHub'da Pull Request açın (develop'a)
```

### Bug Düzeltme

```bash
# 1. Develop'dan bugfix branch'i oluşturun
git checkout develop
git pull origin develop
git checkout -b bugfix/fix-validation-error

# 2. Düzeltmeyi yapın
git add .
git commit -m "fix: resolve validation error in login form"

# 3. Push ve PR açın
git push -u origin bugfix/fix-validation-error
```

### Hotfix (Acil Düzeltme)

```bash
# 1. Main'den hotfix branch'i oluşturun
git checkout main
git pull origin main
git checkout -b hotfix/fix-critical-bug

# 2. Düzeltmeyi yapın
git add .
git commit -m "fix: resolve critical authentication bug"

# 3. Push edin
git push -u origin hotfix/fix-critical-bug

# 4. İKİ PR açın:
#    a) hotfix/fix-critical-bug → main
#    b) hotfix/fix-critical-bug → develop
```

---

## 💬 Commit Mesaj Formatı

[Conventional Commits](https://www.conventionalcommits.org/) standardını kullanıyoruz:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type (Zorunlu)

- `feat`: Yeni özellik
- `fix`: Bug düzeltmesi
- `docs`: Dokümantasyon değişikliği
- `style`: Code formatting (kod davranışını etkilemeyen)
- `refactor`: Refactoring (ne bug fix ne de feature)
- `perf`: Performance iyileştirmesi
- `test`: Test ekleme veya düzeltme
- `chore`: Build process veya auxiliary tool değişiklikleri
- `ci`: CI/CD değişiklikleri

### Scope (Opsiyonel)

Değişikliğin hangi modülü etkilediği:
- `auth`
- `api`
- `database`
- `docker`
- `deploy`

### Örnekler

```bash
# Feature
git commit -m "feat(auth): add Google OAuth integration"

# Bug fix
git commit -m "fix(api): resolve CORS issue for frontend requests"

# Documentation
git commit -m "docs: update API endpoint documentation"

# Refactoring
git commit -m "refactor(database): optimize query performance"

# CI/CD
git commit -m "ci: add automated testing workflow"

# Breaking change
git commit -m "feat(api)!: change response format for user endpoints

BREAKING CHANGE: User API response now returns 'userId' instead of 'id'"
```

---

## 🔀 Pull Request Süreci

### PR Açmadan Önce

- [ ] Kodunuz lint kontrolünden geçiyor mu? (`npm run lint`)
- [ ] Testler çalışıyor mu? (`npm test`)
- [ ] `.env.example` güncel mi?
- [ ] Dokümantasyon güncel mi?
- [ ] Commit mesajları kurallara uygun mu?

### PR Template

PR açarken şu bilgileri ekleyin:

```markdown
## Açıklama
[Yapılan değişikliklerin kısa açıklaması]

## İlgili Issue
Fixes #[issue_number]

## Değişiklik Türü
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Test
- [ ] Local'de test edildi
- [ ] Unit testler eklendi/güncellendi
- [ ] Integration testler eklendi

## Screenshots (eğer UI değişikliği varsa)
[Ekran görüntüleri]

## Checklist
- [ ] Kod self-review yapıldı
- [ ] Kodda comment'ler eklendi (gerekli yerlere)
- [ ] Dokümantasyon güncellendi
- [ ] Değişiklikler breaking change içermiyor
- [ ] Yeni uyarı/hata mesajı üretmiyor
```

### Review Süreci

1. **Otomatik Kontroller**
   - CI/CD workflow'ları çalışır
   - Lint, test, build kontrolleri yapılır
   - Başarısız olursa PR merge edilemez

2. **Code Review**
   - En az 1 reviewer onayı gerekli (branch'e göre değişir)
   - Tüm conversation'lar resolve edilmeli

3. **Merge**
   - Squash and merge tercih edilir
   - Merge commit mesajı anlamlı olmalı

---

## 👀 Code Review

### Review Yaparken Dikkat Edilecekler

✅ **Olumlu**
- Kod okunabilir mi?
- Fonksiyonlar tek bir şey yapıyor mu?
- Error handling doğru mu?
- Security açığı var mı?
- Performance sorunlu mu?
- Test coverage yeterli mi?

❌ **Olumsuz**
- Magic number'lar var mı?
- Duplicate code var mı?
- Console.log kalmış mı?
- Hard-coded value'lar var mı?
- Commented code var mı?

### Feedback Verme

✅ **İyi örnek:**
```
Burada async/await kullanımı daha okunabilir olabilir:
```javascript
const data = await fetchData();
```
```

❌ **Kötü örnek:**
```
Bu kod çok kötü, değiştir.
```

---

## 🧪 Test Yazma

### Test Yapısı

```javascript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      // Arrange
      const userData = { name: 'Test User', email: 'test@example.com' };
      
      // Act
      const result = await userService.createUser(userData);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe(userData.name);
    });

    it('should throw error with invalid email', async () => {
      // Arrange
      const userData = { name: 'Test', email: 'invalid-email' };
      
      // Act & Assert
      await expect(userService.createUser(userData))
        .rejects
        .toThrow('Invalid email format');
    });
  });
});
```

### Test Komutları

```bash
# Tüm testleri çalıştır
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- user.service.test.js
```

---

## 🚀 Deployment

### Development
- `develop` branch'e merge → Otomatik development deploy

### Staging
- `develop` → `staging` PR merge → Otomatik staging deploy

### Production
- `staging` → `main` PR merge → Otomatik production deploy

---

## 📞 İletişim

Sorularınız için:
- GitHub Issues açın
- Pull Request'te comment yapın
- Repository maintainer'larına ulaşın

---

## 📚 Ek Kaynaklar

- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitFlow Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)
- [Writing Good Commit Messages](https://chris.beams.io/posts/git-commit/)

---

**Teşekkürler! 🎉**
