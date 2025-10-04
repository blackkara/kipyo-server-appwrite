#!/bin/bash
# 🔄 Branch Senkronizasyon Script - Fixed Version
# Uncommitted değişiklikleri handle eder

set -e  # Hata durumunda dur

echo "🚀 Branch Senkronizasyon Başlıyor..."
echo "=========================================="
echo ""

# Renk kodları
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Develop'teki değişiklikleri commit et
echo -e "${BLUE}📍 Adım 1: Develop branch'teki değişiklikler kontrol ediliyor...${NC}"
git checkout develop

if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}⚠️  Uncommitted değişiklikler bulundu!${NC}"
    echo ""
    git status --short
    echo ""
    
    echo -e "${BLUE}💾 Değişiklikler commit ediliyor...${NC}"
    git add .
    git commit -m "chore: sync local changes before branch merge"
    echo -e "${GREEN}✅ Değişiklikler commit edildi${NC}"
else
    echo -e "${GREEN}✅ Temiz working directory${NC}"
fi

echo ""

# 2. Develop'ı push et
echo -e "${BLUE}📤 Adım 2: Develop branch push ediliyor...${NC}"
git push origin develop
echo -e "${GREEN}✅ Develop push edildi${NC}"
echo ""

# 3. Remote'u güncelle
echo -e "${BLUE}📥 Adım 3: Remote güncellemeleri getiriliyor...${NC}"
git fetch origin
echo -e "${GREEN}✅ Remote fetch tamamlandı${NC}"
echo ""

# 4. Main'i kontrol et ve push et
echo -e "${BLUE}📍 Adım 4: Main branch kontrol ediliyor...${NC}"
git checkout main

if [[ -n $(git status --porcelain) ]]; then
    echo -e "${BLUE}💾 Main'deki değişiklikler commit ediliyor...${NC}"
    git add .
    git commit -m "chore: sync local main changes"
    echo -e "${GREEN}✅ Main değişiklikleri commit edildi${NC}"
fi

echo -e "${BLUE}📤 Main push ediliyor...${NC}"
git push origin main
echo -e "${GREEN}✅ Main push edildi${NC}"
echo ""

# 5. Staging'i main'den güncelle
echo -e "${BLUE}🔄 Adım 5: Staging branch güncelleniyor...${NC}"
git checkout staging

# Staging'teki local değişiklikleri commit et
if [[ -n $(git status --porcelain) ]]; then
    git add .
    git commit -m "chore: commit staging local changes"
fi

git merge origin/main --no-edit -m "chore: sync staging with main updates"
git push origin staging
echo -e "${GREEN}✅ Staging güncellendi ve push edildi${NC}"
echo ""

# 6. Develop'ı staging'den güncelle
echo -e "${BLUE}🔄 Adım 6: Develop branch güncelleniyor...${NC}"
git checkout develop

git merge origin/staging --no-edit -m "chore: sync develop with staging updates"
git push origin develop
echo -e "${GREEN}✅ Develop güncellendi ve push edildi${NC}"
echo ""

# 7. Develop'da kal
echo -e "${BLUE}🎯 Adım 7: Develop branch'ine geçiliyor...${NC}"
git checkout develop
echo -e "${GREEN}✅ Şu an develop branch'indesiniz${NC}"

# Özet
echo ""
echo "=========================================="
echo -e "${GREEN}🎉 Tüm işlemler başarıyla tamamlandı!${NC}"
echo ""
echo -e "${BLUE}📊 Branch Durumu:${NC}"
echo ""
echo "Main branch son commit:"
git log origin/main --oneline -1
echo ""
echo "Staging branch son commit:"
git log origin/staging --oneline -1
echo ""
echo "Develop branch son commit:"
git log origin/develop --oneline -1
echo ""
echo -e "${YELLOW}💡 Artık develop branch'indesiniz ve tüm branch'ler senkronize!${NC}"
echo ""
