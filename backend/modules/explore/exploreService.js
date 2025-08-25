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

      // Sadece gerekli verileri çek ve enrich et
      const enrichmentStart = Date.now();
      const enrichedCards = await this.enrichSwipeCards(
        jwtToken,
        documents.documents,
        requestId,
        log
      );
      const enrichmentDuration = Date.now() - enrichmentStart;

      log(`[${requestId}] Cards enrichment completed in ${enrichmentDuration}ms`);

      return {
        cards: enrichedCards,
        total: documents.total,
        exclusionsSummary: exclusionSummary,
        performance: {
          exclusionQueryDuration,
          cardsQueryDuration,
          enrichmentDuration,
          totalOperationDuration: Date.now() - operationStart,
          queriesExecuted: queryNames
        }
      };

    } catch (error) {
      log(`[${requestId}] ERROR in getSwipeCards: ${error.message}`);
      throw new Error(`Failed to fetch cards: ${error.message}`);
    }
  }


  async enrichSwipeCards(jwtToken, profileDocuments, requestId, log) {
    try {
      const profileIds = profileDocuments.map(doc => doc.$id);

      // Sadece swipe cards için gerekli verileri paralel çek
      const [mediaData, preferencesData] = await Promise.all([
        this.getBatchProfileMedia(jwtToken, profileIds),
        this.getBatchProfilePreferences(jwtToken, profileIds)
      ]);

      log(`[${requestId}] Essential data fetched for ${profileIds.length} profiles`);

      // Data'yı organize et
      const mediaByUserId = this.groupDocumentsByUserId(mediaData);
      const preferencesByUserId = this.groupSingleDocumentsByUserId(preferencesData);

      // Her profile'ı enrich et
      const enrichedCards = profileDocuments.map(profile => {
        const userId = profile.$id;

        // Photo URLs generate et
        const photoKeys = profile.photos || [];
        const photosWithUrl = generatePhotoUrls(photoKeys);

        // Sadece gerekli data'yı attach et
        return {
          ...profile,
          photosWithUrl,
          medias: mediaByUserId[userId] || [],
          preferences: preferencesByUserId[userId] || null
        };
      });

      return enrichedCards;

    } catch (error) {
      log(`[${requestId}] ERROR in enrichSwipeCards: ${error.message}`);
      throw error;
    }
  }

  async getBatchProfileMedia(jwtToken, userIds) {
    if (userIds.length === 0) return [];

    const appwriteService = AppwriteService.getInstance();
    const result = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_MEDIA_ID,
      [
        Query.equal('userId', userIds),
        Query.equal('isActive', true),
        Query.orderAsc('displayOrder')
      ]
    );
    return result.documents;
  }

  async getBatchProfilePreferences(jwtToken, userIds) {
    if (userIds.length === 0) return [];

    const appwriteService = AppwriteService.getInstance();
    const result = await appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_PROFILE_PREFERENCES_ID,
      [
        Query.equal('userId', userIds),
        Query.limit(userIds.length)
      ]
    );
    return result.documents;
  }

  groupDocumentsByUserId(documents) {
    return documents.reduce((acc, doc) => {
      const userId = doc.userId;
      if (!acc[userId]) {
        acc[userId] = [];
      }
      acc[userId].push(doc);
      return acc;
    }, {});
  }

  groupSingleDocumentsByUserId(documents) {
    return documents.reduce((acc, doc) => {
      const userId = doc.userId;
      acc[userId] = doc;
      return acc;
    }, {});
  }
}

export default new ExploreService();