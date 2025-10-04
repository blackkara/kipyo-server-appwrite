#!/bin/bash
# 🔄 Branch Senkronizasyon Script
# Lokal main'deki değişiklikleri tüm branch'lere yayar

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

# Mevcut branch'i kaydet
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📍 Şu anki branch: ${CURRENT_BRANCH}${NC}"
echo ""

# 1. Main'e geç ve durumu kontrol et
echo -e "${BLUE}📍 Adım 1: Main branch durumu kontrol ediliyor...${NC}"
git checkout main

echo ""
echo -e "${YELLOW}📋 Main branch değişiklikleri:${NC}"
git status --short
echo ""

# Uncommitted değişiklik var mı kontrol et
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}⚠️  Uncommitted değişiklikler bulundu!${NC}"
    read -p "Bu değişiklikleri commit etmek istiyor musunuz? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        echo -e "${BLUE}💾 Değişiklikler commit ediliyor...${NC}"
        git add .
        read -p "Commit mesajı (varsayılan: 'chore: sync local changes'): " COMMIT_MSG
        COMMIT_MSG=${COMMIT_MSG:-"chore: sync local changes"}
        git commit -m "$COMMIT_MSG"
        echo -e "${GREEN}✅ Değişiklikler commit edildi${NC}"
    else
        echo -e "${RED}❌ İşlem iptal edildi.${NC}"
        git checkout "$CURRENT_BRANCH"
        exit 1
    fi
fi

# 2. Main'i push et
echo ""
echo -e "${BLUE}📤 Adım 2: Main branch push ediliyor...${NC}"
git push origin main
echo -e "${GREEN}✅ Main branch push edildi${NC}"

# 3. Remote'u güncelle
echo ""
echo -e "${BLUE}📥 Adım 3: Remote güncellemeleri getiriliyor...${NC}"
git fetch origin
echo -e "${GREEN}✅ Remote fetch tamamlandı${NC}"

# 4. Staging'i main'den güncelle
echo ""
echo -e "${BLUE}🔄 Adım 4: Staging branch güncelleniyor...${NC}"
git checkout staging
git merge origin/main --no-edit -m "chore: sync staging with main updates"
git push origin staging
echo -e "${GREEN}✅ Staging güncellendi ve push edildi${NC}"

# 5. Develop'ı staging'den güncelle
echo ""
echo -e "${BLUE}🔄 Adım 5: Develop branch güncelleniyor...${NC}"
git checkout develop
git merge origin/staging --no-edit -m "chore: sync develop with staging updates"
git push origin develop
echo -e "${GREEN}✅ Develop güncellendi ve push edildi${NC}"

# 6. Develop'da kal
echo ""
echo -e "${BLUE}🎯 Adım 6: Develop branch'ine geçiliyor...${NC}"
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
echo -e "${YELLOW}💡 Artık develop branch'indesiniz ve çalışmaya hazırsınız!${NC}"
echo ""
echo "Yapabilecekleriniz:"
echo "  • Yeni feature: git checkout -b feature/yeni-ozellik"
echo "  • Dosyaları gör: ls -la"
echo "  • Git log: git log --oneline --graph -10"
echo ""
