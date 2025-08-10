import AppwriteService from '../../services/appwrite/AppwriteService.js';
import { generatePhotoUrls } from '../../utils/photoUtils.js';

const { createQuery } = AppwriteService;
const Query = createQuery();

class ExploreService {

  async getSwipeCards(requestingUser, jwtToken, filters, requestId, log, options = {}) {
    try {
      const operationStart = Date.now();
      const { limit = 10, offset = 0 } = filters;
      log(`[${requestId}] Starting getSwipeCards for user: ${requestingUser.$id} with filters: limit=${limit}, offset=${offset}`);

  const appwriteService = AppwriteService.getInstance();
      // User preferences
      const showMeMinAge = requestingUser?.prefs?.showMeMinAge ?? 18;
      const showMeMaxAge = requestingUser?.prefs?.showMeMaxAge ?? 99;
      const showMeGenderWoman = requestingUser?.prefs?.showMeGenderWoman ?? true;
      const showMeGenderMan = requestingUser?.prefs?.showMeGenderMan ?? true;
      const showMeGenderNonBinary = requestingUser?.prefs?.showMeGenderNonBinary ?? true;
      const showMeBlockedCountries = requestingUser?.prefs?.showMeBlockedCountries ?? [];

      const userId = requestingUser.$id;

      // Varsayılan seçenekler
      const {
        includeMatches = true,
        includeRecentDislikes = false,
        includeRecentLikes = false,
        includeBlocks = false,
        dislikesTimeframeDays = 90 // 3 ay (likes için expireDate kullanılıyor)
      } = options;

      // Sadece istenen exclusion sorgularını hazırla
      const queries = [];
      const queryNames = [];

      if (includeMatches) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_MATCHES_ID,
            [
              Query.or([
                Query.equal('userFirst', [userId]),
                Query.equal('userSecond', [userId])
              ])
            ]
          )
        );
        queryNames.push('matches');
      }

      if (includeRecentDislikes) {
        const timeframeAgo = new Date();
        timeframeAgo.setDate(timeframeAgo.getDate() - dislikesTimeframeDays);

        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_DISLIKES_ID,
            [
              Query.equal('dislikerId', [userId]),
              Query.greaterThanEqual('$createdAt', timeframeAgo.toISOString())
            ]
          )
        );
        queryNames.push('recentDislikes');
      }

      if (includeRecentLikes) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_LIKES_ID,
            [
              Query.equal('likerId', [userId]),
              Query.greaterThan('expireDate', new Date().toISOString())
            ]
          )
        );
        queryNames.push('recentLikes');
      }

      if (includeBlocks) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_BLOCKS_ID,
            [
              Query.equal('blockerId', [userId])
            ]
          )
        );
        queryNames.push('blocks');
      }

      // Paralel exclusion sorgu execution
      const exclusionResults = await Promise.all(queries);
      const exclusionQueryDuration = Date.now() - operationStart;

      // Sonuçları organize et
      const exclusionData = {};
      const exclusionSummary = {};

      exclusionResults.forEach((result, index) => {
        const queryName = queryNames[index];
        exclusionData[queryName] = result.documents;
        exclusionSummary[`${queryName}Count`] = result.total;
      });

      // Exclusion ID'lerini çıkar
      const excludedUserIds = [userId]; // Don't show the user themselves

      // Matches'dan excluded user ID'leri al
      if (exclusionData.matches) {
        const matchedUserIds = exclusionData.matches.flatMap(match => {
          if (match.user1Id && match.user2Id) {
            return match.user1Id === userId ? [match.user2Id] : [match.user1Id];
          }
          if (match.userIds) {
            return match.userIds.filter(id => id !== userId);
          }
          return [];
        });
        excludedUserIds.push(...matchedUserIds);
      }

      // Recent dislikes'dan excluded user ID'leri al
      if (exclusionData.recentDislikes) {
        const dislikedUserIds = exclusionData.recentDislikes.map(dislike => dislike.dislikedId);
        excludedUserIds.push(...dislikedUserIds);
      }

      // Recent likes'dan excluded user ID'leri al
      if (exclusionData.recentLikes) {
        const likedUserIds = exclusionData.recentLikes.map(like => like.likedId);
        excludedUserIds.push(...likedUserIds);
      }

      // Blocks'dan excluded user ID'leri al
      if (exclusionData.blocks) {
        const blockedUserIds = exclusionData.blocks.map(block => block.blockedId);
        excludedUserIds.push(...blockedUserIds);
      }

      // Exclusion sonuçlarını logla
      log(`[${requestId}] Exclusion query results:`);
      queryNames.forEach(queryName => {
        log(`[${requestId}] - ${queryName}: ${exclusionSummary[`${queryName}Count`]}`);
      });
      log(`[${requestId}] Exclusions fetched in ${exclusionQueryDuration}ms, total excluded: ${excludedUserIds.length}`);

      // Build query filters for potential cards
      const queryFilters = [
        Query.limit(limit),
        Query.offset(offset)
      ];

      // FIX: Her excluded user ID için ayrı notEqual query ekle
      // Appwrite notEqual sorgusu tek değer kabul ediyor
      excludedUserIds.forEach(excludedId => {
        queryFilters.push(Query.notEqual('$id', excludedId));
      });

      // Add age filters - yaş sınırları dahil edilsin
      const today = new Date();

      // Minimum yaş için maksimum doğum tarihi (dahil)
      const maxBirthDate = new Date(today);
      maxBirthDate.setFullYear(maxBirthDate.getFullYear() - showMeMinAge);
      queryFilters.push(Query.lessThanEqual('birthDate', maxBirthDate.toISOString()));

      // Maksimum yaş için minimum doğum tarihi (dahil)
      const minBirthDate = new Date(today);
      minBirthDate.setFullYear(minBirthDate.getFullYear() - showMeMaxAge - 1);
      queryFilters.push(Query.greaterThanEqual('birthDate', minBirthDate.toISOString()));

      // Gender filter - multiple gender selection
      const selectedGenders = [];
      if (showMeGenderWoman) selectedGenders.push('woman');
      if (showMeGenderMan) selectedGenders.push('man');
      if (showMeGenderNonBinary) selectedGenders.push('nonBinary');

      // Eğer hiç gender seçilmemişse, hepsini göster
      if (selectedGenders.length > 0) {
        queryFilters.push(Query.equal('gender', selectedGenders));
      }

      // Exclude blocked countries - FIX: Her blocked country için ayrı notEqual
      if (showMeBlockedCountries && showMeBlockedCountries.length > 0) {
        showMeBlockedCountries.forEach(blockedCountry => {
          queryFilters.push(Query.notEqual('countryCode', blockedCountry));
        });
      }

      // Fetch potential cards
      const cardsQueryStart = Date.now();
      const documents = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        queryFilters
      );
      const cardsQueryDuration = Date.now() - cardsQueryStart;

      // Her doküman için photosWithUrl alanı ekle
      const enrichedDocuments = documents.documents.map((doc) => {
        const photoKeys = doc.photos || []; // 'photos' dizisi varsa
        const photosWithUrl = generatePhotoUrls(photoKeys);
        return {
          ...doc,
          photosWithUrl
        };
      });


      const totalOperationDuration = Date.now() - operationStart;

      log(`[${requestId}] Cards query completed in ${cardsQueryDuration}ms`);
      log(`[${requestId}] Found ${documents.total} potential cards`);
      log(`[${requestId}] getSwipeCards completed in ${totalOperationDuration}ms`);

      return {
        cards: enrichedDocuments,
        total: documents.total,
        exclusionsSummary: exclusionSummary,
        performance: {
          exclusionQueryDuration,
          cardsQueryDuration,
          totalOperationDuration,
          queriesExecuted: queryNames
        }
      };

    } catch (error) {
      log(`[${requestId}] ERROR in getSwipeCards: ${error.message}`);
      throw new Error(`Failed to fetch cards: ${error.message}`);
    }
  }

}

export default new ExploreService();