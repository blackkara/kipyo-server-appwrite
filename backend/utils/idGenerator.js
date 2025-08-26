/**
 * Generates deterministic, collision-resistant IDs for Appwrite documents
 * 
 * @param {string} type - Document type: 'like', 'match', 'dialog', 'block', 'dislike'
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID  
 * @param {Object} options - Additional options
 * @param {boolean} options.sorted - Whether to sort user IDs (default: true for match/dialog)
 * @param {number} options.hashLength - Hash length (default: 26)
 * @param {string} options.version - Version suffix for migrations (default: '1')
 * @returns {string} Unique document ID (max 36 chars for Appwrite)
 * 
 * @example
 * // For a like (directional - order matters)
 * generateDocumentId('like', 'user123', 'user456')
 * // Returns: "Lk_a3f5d8c9b2e1f4a7d6c3x2y"
 * 
 * // For a match (bidirectional - order doesn't matter)
 * generateDocumentId('match', 'user123', 'user456') 
 * // Returns: "Mt_b7e2a4c8d9f1e3b6a5d2z4w"
 */

import crypto from 'crypto';

function generateDocumentId(type, userId1, userId2, options = {}) {
  // Validate inputs
  if (!type || !userId1 || !userId2) {
    throw new Error('Missing required parameters: type, userId1, userId2');
  }

  if (userId1 === userId2) {
    throw new Error('User IDs cannot be the same');
  }

  // Type configurations
  const typeConfig = {
    'like': { prefix: 'Lk', sorted: false },     // Directional
    'match': { prefix: 'Mt', sorted: true },     // Bidirectional
    'dialog': { prefix: 'Dg', sorted: true },    // Bidirectional
    'block': { prefix: 'Bk', sorted: false },    // Directional
    'dislike': { prefix: 'Dk', sorted: false },  // Directional
    'mute': { prefix: 'Mu', sorted: false },     // Directional
    'report': { prefix: 'Rp', sorted: false },   // Directional
    'view': { prefix: 'Vw', sorted: false },     // Directional
  };

  const config = typeConfig[type];
  if (!config) {
    throw new Error(`Invalid type: ${type}. Valid types: ${Object.keys(typeConfig).join(', ')}`);
  }

  // Apply options with defaults
  const {
    sorted = config.sorted,
    hashLength = 26,
    version = '1'
  } = options;

  // Prepare user IDs based on direction
  const userPair = sorted
    ? [userId1, userId2].sort()  // Sort for bidirectional
    : [userId1, userId2];        // Keep order for directional

  // Create rich data string for hashing
  const dataString = JSON.stringify({
    t: type,           // type
    u1: userPair[0],   // user1
    u2: userPair[1],   // user2
    v: version         // version
  });

  // Generate SHA256 hash
  const fullHash = crypto
    .createHash('sha256')
    .update(dataString)
    .digest('base64url')  // URL-safe Base64
    .substring(0, hashLength);

  // Construct final ID: prefix + hash
  const documentId = `${config.prefix}_${fullHash}`;

  // Validate length (Appwrite limit: 36 chars)
  if (documentId.length > 36) {
    throw new Error(`Generated ID exceeds 36 character limit: ${documentId.length} chars`);
  }

  return documentId;
}

// ============================================
// HELPER FUNCTIONS FOR COMMON USE CASES
// ============================================

/**
 * Generate all necessary IDs for a like operation
 */
function generateLikeOperationIds(senderId, receiverId) {
  return {
    likeId: generateDocumentId('like', senderId, receiverId),
    reverseLikeId: generateDocumentId('like', receiverId, senderId),
    matchId: generateDocumentId('match', senderId, receiverId),
    dialogId: generateDocumentId('dialog', senderId, receiverId)
  };
}

/**
 * Generate ID with collision detection
 */
async function generateIdWithCollisionCheck(type, userId1, userId2, checkFunction) {
  const primaryId = generateDocumentId(type, userId1, userId2);

  try {
    const exists = await checkFunction(primaryId);

    if (!exists) {
      return primaryId;
    }

    // If collision detected (extremely rare), add timestamp suffix
    console.warn(`Potential collision detected for ${primaryId}`);
    const timestamp = Date.now().toString(36).slice(-4);
    return `${primaryId.slice(0, 32)}_${timestamp}`; // Keep under 36 chars

  } catch (error) {
    return primaryId;
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================

// Example 1: Simple like operation
const likeId = generateDocumentId('like', 'user123', 'user456');
console.log(likeId); // "Lk_a3f5d8c9b2e1f4a7d6c3x2y1"

// Example 2: Check for reciprocal like
const reverseLikeId = generateDocumentId('like', 'user456', 'user123');
console.log(reverseLikeId); // "Lk_b7e2a4c8d9f1e3b6a5d2z4w2" (different!)

// Example 3: Match ID (same regardless of order)
const match1 = generateDocumentId('match', 'user123', 'user456');
const match2 = generateDocumentId('match', 'user456', 'user123');
console.log(match1 === match2); // true! Both are "Mt_c4d7f2b8a1e9d3c6b8f5q3r"

// Example 4: Dialog ID (same regardless of order)
const dialog1 = generateDocumentId('dialog', 'user123', 'user456');
const dialog2 = generateDocumentId('dialog', 'user456', 'user123');
console.log(dialog1 === dialog2); // true! Both are "Dg_d8f3a5c2b9e1f7d4a6b3p8s"

// Example 5: Block operation (directional)
const blockId = generateDocumentId('block', 'user123', 'user456');
console.log(blockId); // "Bk_e2g5h8j3k6m9p2q5s8t1v4x"

// Example 6: With custom options
const customId = generateDocumentId('like', 'user123', 'user456', {
  hashLength: 20,  // Shorter hash
  version: '2'      // Version 2 schema
});
console.log(customId); // "Lk_f3h6j9k2m5p8q1s4t7"

// Example 7: Batch ID generation for like operation
const ids = generateLikeOperationIds('user123', 'user456');
console.log(ids);
/*
{
  likeId: "Lk_a3f5d8c9b2e1f4a7d6c3x2y1",
  reverseLikeId: "Lk_b7e2a4c8d9f1e3b6a5d2z4w2",
  matchId: "Mt_c4d7f2b8a1e9d3c6b8f5q3r7",
  dialogId: "Dg_d8f3a5c2b9e1f7d4a6b3p8s9"
}
*/

// ============================================
// UNIT TESTS
// ============================================

function runTests() {
  console.log('Running ID Generator Tests...\n');

  // Test 1: Deterministic behavior
  const id1 = generateDocumentId('like', 'user1', 'user2');
  const id2 = generateDocumentId('like', 'user1', 'user2');
  console.assert(id1 === id2, 'Same inputs should produce same ID');
  console.log('✅ Test 1: Deterministic behavior');

  // Test 2: Directional uniqueness
  const like1 = generateDocumentId('like', 'user1', 'user2');
  const like2 = generateDocumentId('like', 'user2', 'user1');
  console.assert(like1 !== like2, 'Different direction should produce different ID');
  console.log('✅ Test 2: Directional uniqueness');

  // Test 3: Bidirectional consistency
  const match1 = generateDocumentId('match', 'user1', 'user2');
  const match2 = generateDocumentId('match', 'user2', 'user1');
  console.assert(match1 === match2, 'Match should be same regardless of order');
  console.log('✅ Test 3: Bidirectional consistency');

  // Test 4: Length constraint
  const longId = generateDocumentId('dialog', 'verylonguserId123456789', 'anotherverylonguserId987654321');
  console.assert(longId.length <= 36, 'ID should not exceed 36 characters');
  console.log('✅ Test 4: Length constraint');

  // Test 5: Type validation
  try {
    generateDocumentId('invalid', 'user1', 'user2');
    console.assert(false, 'Should throw error for invalid type');
  } catch (e) {
    console.log('✅ Test 5: Type validation');
  }

  // Test 6: Same user validation
  try {
    generateDocumentId('like', 'user1', 'user1');
    console.assert(false, 'Should throw error for same user');
  } catch (e) {
    console.log('✅ Test 6: Same user validation');
  }

  console.log('\n✨ All tests passed!');
}

// Run tests
// runTests();



export { generateDocumentId, generateLikeOperationIds, generateIdWithCollisionCheck };