import AppwriteService from '../../services/appwrite/AppwriteService.js';
import { generatePhotoUrls } from '../../utils/photoUtils.js';
import { ExploreConfig } from './exploreConfig.js';
const { createQuery } = AppwriteService;
const Query = createQuery();

class ExploreService {

  // Geohash'ten yaklaşık koordinat çıkarma
  decodeGeohash(geohash) {
    const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let minLat = -90, maxLat = 90;
    let minLon = -180, maxLon = 180;
    let isEven = true;

    for (let i = 0; i < geohash.length; i++) {
      const idx = BASE32.indexOf(geohash[i]);

      // Validate character
      if (idx === -1) {
        throw new Error(`Invalid geohash character: ${geohash[i]}`);
      }

      for (let j = 4; j >= 0; j--) {
        const bit = (idx >> j) & 1;
        if (isEven) {
          const mid = (minLon + maxLon) / 2;
          if (bit === 1) {
            minLon = mid;
          } else {
            maxLon = mid;
          }
        } else {
          const mid = (minLat + maxLat) / 2;
          if (bit === 1) {
            minLat = mid;
          } else {
            maxLat = mid;
          }
        }
        isEven = !isEven;
      }
    }

    return {
      lat: (minLat + maxLat) / 2,
      lon: (minLon + maxLon) / 2
    };
  }

  // Haversine formülü ile iki nokta arası mesafe (km)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Dünya yarıçapı km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c); // km cinsinden tam sayı
  }

  // Geohash'ler arası mesafe hesaplama
  calculateDistanceFromGeohashes(geohash1, geohash2) {
    if (!geohash1 || !geohash2) return null;

    try {
      const coord1 = this.decodeGeohash(geohash1);
      const coord2 = this.decodeGeohash(geohash2);
      return this.calculateDistance(coord1.lat, coord1.lon, coord2.lat, coord2.lon);
    } catch (error) {
      // Log the error instead of silently failing
      console.warn(`Geohash decode error: ${error.message}`, {
        geohash1,
        geohash2
      });
      return null;
    }
  }

  async getSwipeCards(requestingUser, jwtToken, filters, requestId, log, options = {}) {
    try {
      const operationStart = Date.now();
      const { limit = ExploreConfig.DEFAULT_LIMIT, offset = ExploreConfig.DEFAULT_OFFSET } = filters;
      log(`[${requestId}] Starting getSwipeCards for user: ${requestingUser.$id} with filters: limit=${limit}, offset=${offset}`);

      const appwriteService = AppwriteService.getInstance();
      // User preferences
      const showMeMinAge = requestingUser?.prefs?.showMeMinAge ?? 18;
      const showMeMaxAge = requestingUser?.prefs?.showMeMaxAge ?? 99;
      const showMeGenderWoman = requestingUser?.prefs?.showMeGenderWoman ?? true;
      const showMeGenderMan = requestingUser?.prefs?.showMeGenderMan ?? true;
      const showMeGenderNonBinary = requestingUser?.prefs?.showMeGenderNonBinary ?? true;
      const showMeBlockedCountries = requestingUser?.prefs?.showMeBlockedCountries ?? [];
      const locationScope = requestingUser?.prefs?.locationScope ?? ExploreConfig.LOCATION_SCOPE.WORLDWIDE;

      const userId = requestingUser.$id;

      // Varsayılan seçenekler
      const {
        includeMatches = true,
        includeRecentDislikes = true,
        includeRecentLikes = true,
        includeBlocks = true,
        includeDialogs = true, // Dahil olduğu tüm dialogları exclude et
        dislikesTimeframeDays = ExploreConfig.DEFAULT_DISLIKES_TIMEFRAME_DAYS
      } = options;

      // Sadece istenen exclusion sorgularını hazırla
      const queries = [];
      const queryNames = [];

      // Kullanıcının kendi profilini çek (geohash için)
      queries.push(
        appwriteService.getDocument(
          jwtToken,
          process.env.DB_COLLECTION_PROFILES_ID,
          userId // userId direkt document ID olarak kullanılıyor
        )
      );
      queryNames.push('userProfile');

      // Bu kullacının dahil olduğu bir match var mı?
      if (includeMatches) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_MATCHES_ID,
            [
              Query.or([
                Query.equal('userFirst', [userId]),
                Query.equal('userSecond', [userId])
              ]),
              Query.select(['userFirst', 'userSecond']),
              Query.limit(ExploreConfig.EXCLUSION_QUERY_LIMIT)
            ]
          )
        );
        queryNames.push('matches');
      }

      // Son zamanlarda dislike ettiği profiller (zaman aralığında) var mı?
      if (includeRecentDislikes) {
        const timeframeAgo = new Date();
        timeframeAgo.setDate(timeframeAgo.getDate() - dislikesTimeframeDays);

        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_DISLIKES_ID,
            [
              Query.equal('dislikerId', [userId]),
              Query.greaterThanEqual('$createdAt', timeframeAgo.toISOString()),
              Query.select(['dislikedId']),
              Query.limit(ExploreConfig.EXCLUSION_QUERY_LIMIT)
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
             // Query.greaterThan('expireDate', new Date().toISOString()),
              Query.select(['likedId']),
              Query.limit(ExploreConfig.EXCLUSION_QUERY_LIMIT)
            ]
          )
        );
        queryNames.push('recentLikes');
      }

      // Kullanıcının blockladığı profiller var mı?
      if (includeBlocks) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_BLOCKS_ID,
            [
              Query.equal('blockerId', [userId]),
              Query.select(['blockedId']),
              Query.limit(ExploreConfig.EXCLUSION_QUERY_LIMIT)
            ]
          )
        );
        queryNames.push('blocks');
      }

      // Kullanıcının dahil olduğu tüm dialoglar var mı? (direkt veya normal fark etmeksizin)
      if (includeDialogs) {
        queries.push(
          appwriteService.listDocuments(
            jwtToken,
            process.env.DB_COLLECTION_DIALOGS_ID,
            [
              Query.contains('occupantIds', userId),
              Query.select(['occupantIds']),
              Query.limit(ExploreConfig.EXCLUSION_QUERY_LIMIT)
            ]
          )
        );
        queryNames.push('dialogs');
      }

      // Paralel exclusion sorgu execution
      const exclusionResults = await Promise.all(queries);
      const exclusionQueryDuration = Date.now() - operationStart;

      // Sonuçları organize et
      const exclusionData = {};
      const exclusionSummary = {};
      let userGeohash = null; // Kullanıcının geohash'i

      exclusionResults.forEach((result, index) => {
        const queryName = queryNames[index];

        // Kullanıcı profili ise geohash'i al
        if (queryName === 'userProfile') {
          userGeohash = result.geohash;
          log(`[${requestId}] User geohash: ${userGeohash ? 'found' : 'not found'}`);
        } else {
          exclusionData[queryName] = result.documents;
          exclusionSummary[`${queryName}Count`] = result.total;
        }
      });

      // Exclusion ID'lerini çıkar (Set kullan)
      const excludedUserIds = new Set([userId]); // Don't show the user themselves

      // Matches'dan excluded user ID'leri al
      if (exclusionData.matches) {
        exclusionData.matches.forEach(match => {
          if (match.userFirst && match.userSecond) { // ✅ DÜZELT
            const matchedUserId = match.userFirst === userId
              ? match.userSecond
              : match.userFirst;
            excludedUserIds.add(matchedUserId);
          }

          // userIds array yapısı için (eğer varsa)
          if (match.userIds && Array.isArray(match.userIds)) {
            match.userIds.forEach(id => {
              if (id !== userId) excludedUserIds.add(id);
            });
          }
        });
      }

      // Recent dislikes'dan excluded user ID'leri al
      if (exclusionData.recentDislikes) {
        exclusionData.recentDislikes.forEach(dislike => {
          excludedUserIds.add(dislike.dislikedId);
        });
      }

      // Recent likes'dan excluded user ID'leri al
      if (exclusionData.recentLikes) {
        exclusionData.recentLikes.forEach(like => {
          excludedUserIds.add(like.likedId);
        });
      }

      // Blocks'dan excluded user ID'leri al
      if (exclusionData.blocks) {
        exclusionData.blocks.forEach(block => {
          excludedUserIds.add(block.blockedId);
        });
      }

      // Dialoglar'dan excluded user ID'leri al (direkt veya normal fark etmeksizin)
      if (exclusionData.dialogs) {
        exclusionData.dialogs.forEach(dialog => {
          dialog.occupantIds.forEach(id => {
            if (id !== userId) excludedUserIds.add(id);
          });
        });
      }

      // Exclusion sonuçlarını logla
      log(`[${requestId}] Exclusion query results:`);
      queryNames.forEach(queryName => {
        if (queryName !== 'userProfile') { // userProfile'ı exclusion log'larında gösterme
          log(`[${requestId}] - ${queryName}: ${exclusionSummary[`${queryName}Count`]}`);
        }
      });
      const excludedCount = excludedUserIds.size;
      log(`[${requestId}] Exclusions fetched in ${exclusionQueryDuration}ms, total excluded: ${excludedCount}`);

      // Two-stage filtering strategy
      const excludedArray = Array.from(excludedUserIds);
      const useMemoryFiltering = excludedCount > ExploreConfig.QUERY_LIMIT;

      // Build query filters for potential cards
      const queryFilters = [];

      if (useMemoryFiltering) {
        log(`[${requestId}] Using memory filtering (${excludedCount} excluded > ${ExploreConfig.QUERY_LIMIT})`);

        // Strategy A: Fetch more cards, filter in memory
        queryFilters.push(Query.limit(limit * ExploreConfig.FETCH_MULTIPLIER));
        queryFilters.push(Query.offset(offset));
      } else {
        // Strategy B: Traditional query filtering (when excluded count is low)
        excludedArray.forEach(excludedId => {
          queryFilters.push(Query.notEqual('$id', excludedId));
        });
        queryFilters.push(Query.limit(limit));
        queryFilters.push(Query.offset(offset));
      }

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

      // Only add to query if list is small (<=COUNTRY_QUERY_LIMIT countries)
      if (showMeBlockedCountries && showMeBlockedCountries.length > 0 && showMeBlockedCountries.length <= ExploreConfig.COUNTRY_QUERY_LIMIT) {
        showMeBlockedCountries.forEach(blockedCountry => {
          queryFilters.push(Query.notEqual('countryCode', blockedCountry));
        });
      }
      // If >10 blocked countries, filter in memory (handled below)

      // Location scope filters based on user's geohash
      if (userGeohash && locationScope !== ExploreConfig.LOCATION_SCOPE.WORLDWIDE) {
        if (locationScope === ExploreConfig.LOCATION_SCOPE.COUNTRY) {
          // Use configured precision for country-level matching
          const countryPrefix = userGeohash.substring(0, ExploreConfig.GEOHASH_PRECISION.COUNTRY);
          queryFilters.push(Query.startsWith('geohash', countryPrefix));
          log(`[${requestId}] Filtering by country geohash prefix: ${countryPrefix}`);
        } else if (locationScope === ExploreConfig.LOCATION_SCOPE.CITY) {
          // Use configured precision for city-level matching  
          const cityPrefix = userGeohash.substring(0, ExploreConfig.GEOHASH_PRECISION.CITY);
          queryFilters.push(Query.startsWith('geohash', cityPrefix));
          log(`[${requestId}] Filtering by city geohash prefix: ${cityPrefix}`);
        }
      } else if (locationScope !== ExploreConfig.LOCATION_SCOPE.WORLDWIDE) {
        log(`[${requestId}] Location scope '${locationScope}' requested but user geohash not available`);
      }

      // Fetch potential cards
      const cardsQueryStart = Date.now();
      const documents = await appwriteService.listDocuments(
        jwtToken,
        process.env.DB_COLLECTION_PROFILES_ID,
        queryFilters
      );
      const cardsQueryDuration = Date.now() - cardsQueryStart;

      // Apply memory filtering if needed
      let filteredDocuments;
      if (useMemoryFiltering) {
        filteredDocuments = documents.documents.filter(doc =>
          !excludedUserIds.has(doc.$id)
        );

        // Also filter blocked countries in memory if needed
        if (showMeBlockedCountries && showMeBlockedCountries.length > ExploreConfig.COUNTRY_QUERY_LIMIT) {
          const blockedCountriesSet = new Set(showMeBlockedCountries);
          filteredDocuments = filteredDocuments.filter(doc =>
            !blockedCountriesSet.has(doc.countryCode)
          );
        }

        // Take only requested limit
        filteredDocuments = filteredDocuments.slice(0, limit);

        log(`[${requestId}] Memory filtering: ${documents.documents.length} -> ${filteredDocuments.length} cards`);
      } else {
        // Use documents.documents directly
        filteredDocuments = documents.documents;
      }

      // Sadece gerekli verileri çek ve enrich et
      const enrichmentStart = Date.now();
      const enrichedCards = await this.enrichSwipeCards(
        jwtToken,
        filteredDocuments, // Changed from documents.documents
        requestId,
        log,
        userGeohash // Kullanıcının geohash'ini pass et
      );
      const enrichmentDuration = Date.now() - enrichmentStart;

      log(`[${requestId}] Cards enrichment completed in ${enrichmentDuration}ms`);

      log(documents);

      return {
        cards: enrichedCards,
        total: documents.total,
        filteredTotal: filteredDocuments.length, // Actual returned count
        exclusionsSummary: {
          ...exclusionSummary,
          totalExcluded: excludedCount, // Total excluded count
          usedMemoryFiltering: useMemoryFiltering // Important metric
        },
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
      console.error(`[${requestId}] Full error stack:`, error); // Full error logging
      throw new Error(`Failed to fetch cards: ${error.message}`);
    }
  }


  async enrichSwipeCards(jwtToken, profileDocuments, requestId, log, userGeohash = null) {
    try {
      // Early return for empty array
      if (profileDocuments.length === 0) {
        log(`[${requestId}] No profiles to enrich`);
        return [];
      }

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

        // Mesafe hesapla (eğer her iki tarafta da geohash varsa)
        let distanceKm = null;
        if (userGeohash && profile.geohash) {
          distanceKm = this.calculateDistanceFromGeohashes(userGeohash, profile.geohash);
        }

        // Sadece gerekli data'yı attach et
        return {
          ...profile,
          photosWithUrl,
          medias: mediaByUserId[userId] || [],
          preferences: preferencesByUserId[userId] || null,
          distanceKm // Mesafe bilgisini ekle (null olabilir)
        };
      });

      return enrichedCards;

    } catch (error) {
      log(`[${requestId}] ERROR in enrichSwipeCards: ${error.message}`);
      console.error(`[${requestId}] Enrichment error stack:`, error); // Error logging
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
        Query.orderAsc('displayOrder'),
        Query.limit(ExploreConfig.EXCLUSION_QUERY_LIMIT)
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
        Query.limit(Math.min(userIds.length, ExploreConfig.EXCLUSION_QUERY_LIMIT))
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