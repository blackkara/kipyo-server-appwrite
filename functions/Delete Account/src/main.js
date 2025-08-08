import { Client, Databases, Users } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    const requesterUserId = req.headers['x-appwrite-user-id'];
    if (!requesterUserId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'requesterUserId parameter is required'
      });
    }

    const client = getClient();

    const users = new Users(client);
    await users.delete(userId);

    const databases = new Databases(client);
    const profile = await getProfile(databases, userId);
    if (profile) {
      await databases.deleteDocument(
        process.env.DB_ID,
        process.env.DB_COLLECTION_PROFILE_ID,
        profile.$id
      );
    }

  } catch (e) {
    return res.json({
      code: 400,
      type: e.code || 'processing_error',
      message: e.message || 'Unknown error'
    });
  }
};


/**
 * Returns an Appwrite Client instance using the environment variables
 * APPWRITE_FUNCTION_API_ENDPOINT, APPWRITE_FUNCTION_PROJECT_ID, and APPWRITE_API_KEY.
 *
 * @returns {Client}
 */
function getClient() {
  return new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
}

/**
 * Retrieves a profile document from the profiles collection using the given userId.
 * @param {Databases} databases - An instance of the Databases client.
 * @param {string} userId - The userId of the profile to retrieve.
 * @returns {Promise<null | Document>} The profile document or null if not found.
 * @throws Will throw an error if multiple profiles are found.
 */
async function getProfile(databases, userId) {
  const documents = await databases.listDocuments(
    process.env.DB_ID,
    process.env.DB_COLLECTION_PROFILE_ID,
    [
      Query.equal('userId', userId)
    ]
  );

  if (documents.total < 1) {
    return null;
  } else if (documents.total == 1) {
    return documents.documents[0]
  } else {
    throw new Error('Multiple profiles found');
  }
}