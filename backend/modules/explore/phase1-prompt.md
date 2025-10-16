# PHASE 1: CRITICAL FIXES - Implementation Prompt

You are an expert Node.js backend developer specializing in performance optimization and database query optimization. Your task is to refactor the ExploreService.js file to fix critical production issues in a dating app with 30K users.

## CONTEXT

**Current Problem:**
The ExploreService has critical query limit issues. When users have many exclusions (matches, likes, dislikes, blocks, dialogs), the code creates too many individual `Query.notEqual()` statements, causing Appwrite query limit errors (limit: 100 queries per request).

**Example of Critical User:**
- 50+ matches
- 500+ dislikes (90 days)
- 200+ likes
- 10-20 blocks
- 20+ dialogs
= ~780 excluded users → 780 separate `Query.notEqual()` statements → **CRASH**

**Tech Stack:**
- Backend: Node.js
- Database: Appwrite
- File Location: `/services/explore/ExploreService.js`

## REQUIRED CHANGES

### 1. TWO-STAGE FILTERING STRATEGY

**Current Code (BROKEN):**
```javascript
excludedUserIds.forEach(excludedId => {
  queryFilters.push(Query.notEqual('$id', excludedId)); // Creates 780 queries!
});
```

**New Code (REQUIRED):**
```javascript
// Define constants at class level
static QUERY_LIMIT = 80; // Safe threshold below Appwrite's 100 limit
static FETCH_MULTIPLIER = 3; // Fetch 3x more cards when using memory filtering

// In getSwipeCards method:
const excludedCount = excludedUserIds.size;
const excludedArray = Array.from(excludedUserIds);
const useMemoryFiltering = excludedCount > ExploreService.QUERY_LIMIT;

if (useMemoryFiltering) {
  log(`[${requestId}] Using memory filtering (${excludedCount} excluded > ${ExploreService.QUERY_LIMIT})`);
  
  // Strategy A: Fetch more cards, filter in memory
  queryFilters.push(Query.limit(limit * ExploreService.FETCH_MULTIPLIER));
  queryFilters.push(Query.offset(offset));
  
  // After fetching documents:
  let filteredDocuments = documents.documents.filter(doc => 
    !excludedUserIds.has(doc.$id)
  );
  
  // Also filter blocked countries in memory if needed
  if (showMeBlockedCountries && showMeBlockedCountries.length > 10) {
    const blockedCountriesSet = new Set(showMeBlockedCountries);
    filteredDocuments = filteredDocuments.filter(doc => 
      !blockedCountriesSet.has(doc.countryCode)
    );
  }
  
  // Take only requested limit
  filteredDocuments = filteredDocuments.slice(0, limit);
  
  log(`[${requestId}] Memory filtering: ${documents.documents.length} -> ${filteredDocuments.length} cards`);
  
} else {
  // Strategy B: Traditional query filtering (when excluded count is low)
  excludedArray.forEach(excludedId => {
    queryFilters.push(Query.notEqual('$id', excludedId));
  });
  queryFilters.push(Query.limit(limit));
  queryFilters.push(Query.offset(offset));
  
  // Use documents.documents directly
  let filteredDocuments = documents.documents;
}

// Continue with filteredDocuments instead of documents.documents
const enrichedCards = await this.enrichSwipeCards(
  jwtToken,
  filteredDocuments, // Changed from documents.documents
  requestId,
  log,
  userGeohash
);
```

### 2. USE SET INSTEAD OF ARRAY FOR EXCLUDED USERS

**Current Code:**
```javascript
const excludedUserIds = [userId]; // Array
excludedUserIds.push(...matchedUserIds);
```

**New Code:**
```javascript
const excludedUserIds = new Set([userId]); // Set for O(1) lookup

// Add to Set (not push)
if (exclusionData.matches) {
  exclusionData.matches.forEach(match => {
    if (match.user1Id && match.user2Id) {
      excludedUserIds.add(match.user1Id === userId ? match.user2Id : match.user1Id);
    }
    if (match.userIds) {
      match.userIds.forEach(id => {
        if (id !== userId) excludedUserIds.add(id);
      });
    }
  });
}

// Same pattern for other exclusions
if (exclusionData.recentDislikes) {
  exclusionData.recentDislikes.forEach(dislike => {
    excludedUserIds.add(dislike.dislikedId);
  });
}

if (exclusionData.recentLikes) {
  exclusionData.recentLikes.forEach(like => {
    excludedUserIds.add(like.likedId);
  });
}

if (exclusionData.blocks) {
  exclusionData.blocks.forEach(block => {
    excludedUserIds.add(block.blockedId);
  });
}

if (exclusionData.dialogs) {
  exclusionData.dialogs.forEach(dialog => {
    dialog.occupantIds.forEach(id => {
      if (id !== userId) excludedUserIds.add(id);
    });
  });
}
```

### 3. OPTIMIZE QUERY.SELECT() FOR ALL EXCLUSION QUERIES

**Add Query.select() to reduce data transfer:**

```javascript
// Dialogs - only fetch occupantIds
if (includeDialogs) {
  queries.push(
    appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_DIALOGS_ID,
      [
        Query.contains('occupantIds', userId),
        Query.select(['occupantIds']) // NEW: Only fetch what we need
      ]
    )
  );
  queryNames.push('dialogs');
}

// Matches - only fetch user IDs
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
        Query.select(['user1Id', 'user2Id', 'userIds']) // NEW
      ]
    )
  );
  queryNames.push('matches');
}

// Recent dislikes - only fetch dislikedId
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
        Query.select(['dislikedId']) // NEW
      ]
    )
  );
  queryNames.push('recentDislikes');
}

// Recent likes - only fetch likedId
if (includeRecentLikes) {
  queries.push(
    appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_LIKES_ID,
      [
        Query.equal('likerId', [userId]),
        Query.greaterThan('expireDate', new Date().toISOString()),
        Query.select(['likedId']) // NEW
      ]
    )
  );
  queryNames.push('recentLikes');
}

// Blocks - only fetch blockedId
if (includeBlocks) {
  queries.push(
    appwriteService.listDocuments(
      jwtToken,
      process.env.DB_COLLECTION_BLOCKS_ID,
      [
        Query.equal('blockerId', [userId]),
        Query.select(['blockedId']) // NEW
      ]
    )
  );
  queryNames.push('blocks');
}
```

### 4. IMPROVE ERROR HANDLING

**In calculateDistanceFromGeohashes:**
```javascript
calculateDistanceFromGeohashes(geohash1, geohash2) {
  if (!geohash1 || !geohash2) return null;
  
  try {
    const coord1 = this.decodeGeohash(geohash1);
    const coord2 = this.decodeGeohash(geohash2);
    return this.calculateDistance(coord1.lat, coord1.lon, coord2.lat, coord2.lon);
  } catch (error) {
    // NEW: Log the error instead of silently failing
    console.warn(`Geohash decode error: ${error.message}`, { 
      geohash1, 
      geohash2 
    });
    return null;
  }
}
```

**In decodeGeohash (add validation):**
```javascript
decodeGeohash(geohash) {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90;
  let minLon = -180, maxLon = 180;
  let isEven = true;

  for (let i = 0; i < geohash.length; i++) {
    const idx = BASE32.indexOf(geohash[i]);
    
    // NEW: Validate character
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
```

**In main getSwipeCards catch block:**
```javascript
} catch (error) {
  log(`[${requestId}] ERROR in getSwipeCards: ${error.message}`);
  console.error(`[${requestId}] Full error stack:`, error); // NEW: Full error logging
  throw new Error(`Failed to fetch cards: ${error.message}`);
}
```

**In enrichSwipeCards:**
```javascript
async enrichSwipeCards(jwtToken, profileDocuments, requestId, log, userGeohash = null) {
  try {
    // NEW: Early return for empty array
    if (profileDocuments.length === 0) {
      log(`[${requestId}] No profiles to enrich`);
      return [];
    }

    const profileIds = profileDocuments.map(doc => doc.$id);
    // ... rest of the code
    
  } catch (error) {
    log(`[${requestId}] ERROR in enrichSwipeCards: ${error.message}`);
    console.error(`[${requestId}] Enrichment error stack:`, error); // NEW
    throw error;
  }
}
```

### 5. UPDATE RETURN VALUE TO INCLUDE NEW METRICS

```javascript
return {
  cards: enrichedCards,
  total: documents.total,
  filteredTotal: filteredDocuments.length, // NEW: Actual returned count
  exclusionsSummary: {
    ...exclusionSummary,
    totalExcluded: excludedCount, // NEW
    usedMemoryFiltering: useMemoryFiltering // NEW: Important metric
  },
  performance: {
    exclusionQueryDuration,
    cardsQueryDuration,
    enrichmentDuration,
    totalOperationDuration: Date.now() - operationStart,
    queriesExecuted: queryNames
  }
};
```

### 6. OPTIMIZE COUNTRY BLOCKING

**Current Code:**
```javascript
if (showMeBlockedCountries && showMeBlockedCountries.length > 0) {
  showMeBlockedCountries.forEach(blockedCountry => {
    queryFilters.push(Query.notEqual('countryCode', blockedCountry));
  });
}
```

**New Code:**
```javascript
// Only add to query if list is small (<=10 countries)
if (showMeBlockedCountries && showMeBlockedCountries.length > 0 && showMeBlockedCountries.length <= 10) {
  showMeBlockedCountries.forEach(blockedCountry => {
    queryFilters.push(Query.notEqual('countryCode', blockedCountry));
  });
}
// If >10 blocked countries, filter in memory (already handled in memory filtering section)
```

## IMPLEMENTATION CHECKLIST

- [ ] Add `QUERY_LIMIT` and `FETCH_MULTIPLIER` static constants to class
- [ ] Replace `excludedUserIds` array with Set
- [ ] Update all `.push()` calls to `.add()` for Set operations
- [ ] Implement two-stage filtering logic with `useMemoryFiltering` check
- [ ] Add `Query.select()` to all 5 exclusion queries (dialogs, matches, dislikes, likes, blocks)
- [ ] Update country blocking to only use query filters for ≤10 countries
- [ ] Add geohash character validation in `decodeGeohash`
- [ ] Add console.warn to `calculateDistanceFromGeohashes` catch block
- [ ] Add console.error to both main catch blocks
- [ ] Add early return check in `enrichSwipeCards` for empty array
- [ ] Update return object with new fields: `filteredTotal`, `totalExcluded`, `usedMemoryFiltering`
- [ ] Test with mock data: 50 excluded users (should use query filtering)
- [ ] Test with mock data: 150 excluded users (should use memory filtering)

## TESTING REQUIREMENTS

After implementation, the code must:
1. **Not crash** when a user has 500+ excluded users
2. **Use memory filtering** (log shows "Using memory filtering") when excluded > 80
3. **Use query filtering** when excluded ≤ 80
4. **Return correct number of cards** (exactly `limit` cards, not more)
5. **Log performance metrics** including `usedMemoryFiltering` boolean
6. **Handle invalid geohashes** without crashing (return null distance)

## CONSTRAINTS

- Do NOT change function signatures
- Do NOT remove any existing functionality
- Do NOT add new dependencies
- Keep all existing logs
- Maintain backward compatibility with existing API responses
- Follow existing code style and conventions
- Do NOT modify AppwriteService or other imported services

## OUTPUT FORMAT

Please provide:
1. The complete refactored `ExploreService.js` file
2. A summary of changes made
3. Line numbers where critical changes were made
4. Any edge cases to test

## SUCCESS CRITERIA

✅ Code handles 1000+ excluded users without query limit errors
✅ Response time < 1 second for users with 500+ exclusions
✅ Memory usage increase < 10MB per request
✅ All existing tests pass
✅ New metrics visible in logs: `usedMemoryFiltering`, `filteredTotal`, `totalExcluded`

---

**IMPORTANT:** This is production code for a dating app with 30K users. Accuracy and reliability are critical. Double-check all array→Set conversions and ensure the filtering logic is correct.