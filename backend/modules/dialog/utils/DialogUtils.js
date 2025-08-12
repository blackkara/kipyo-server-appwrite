import crypto from 'crypto';

class DialogUtils {
  /**
  * Creates deterministic pair from two user IDs
  * @param {string} userId1 
  * @param {string} userId2 
  * @returns {string[]} Sorted array of user IDs
  */
  static createDeterministicPair(userId1, userId2) {
    return [userId1, userId2].sort();
  }

  /**
 * Generates dialog ID from occupants
 * @param {string[]} occupants - Sorted array of user IDs
 * @returns {string} Generated dialog ID
 */
  static generateDialogId(occupants) {
    const combined = occupants.join('_');
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    return `dialog_${hash.substring(0, 20)}`;
  }
}

export default DialogUtils;
