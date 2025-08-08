/**
 * {
   "team":{
      "team":{
         "$id":"68587d6b001dbbc988a1",
         "$createdAt":"2025-06-22T22:02:19.793+00:00",
         "$updatedAt":"2025-06-22T22:02:19.793+00:00",
         "name":"Dialog_6856809fec45ecafda7d_6856047fa04f2602e3c6",
         "total":0,
         "prefs":{
            
         }
      },
      "memberships":[
         {
            "$id":"68587d6bd10fd1df27d6",
            "$createdAt":"2025-06-22T22:02:19.857+00:00",
            "$updatedAt":"2025-06-22T22:02:19.857+00:00",
            "userId":"6856809fec45ecafda7d",
            "userName":"Mustafa Kara",
            "userEmail":"karaneedsmoney@gmail.com",
            "teamId":"68587d6b001dbbc988a1",
            "teamName":"Dialog_6856809fec45ecafda7d_6856047fa04f2602e3c6",
            "invited":"2025-06-22T22:02:19.856+00:00",
            "joined":"2025-06-22T22:02:19.856+00:00",
            "confirm":true,
            "mfa":false,
            "roles":[
               "member"
            ]
         },
         {
            "$id":"68587d6be34981aa18bf",
            "$createdAt":"2025-06-22T22:02:19.932+00:00",
            "$updatedAt":"2025-06-22T22:02:19.932+00:00",
            "userId":"6856047fa04f2602e3c6",
            "userName":"Mustafa (Blackkara)",
            "userEmail":"karamusti@gmail.com",
            "teamId":"68587d6b001dbbc988a1",
            "teamName":"Dialog_6856809fec45ecafda7d_6856047fa04f2602e3c6",
            "invited":"2025-06-22T22:02:19.931+00:00",
            "joined":"2025-06-22T22:02:19.931+00:00",
            "confirm":true,
            "mfa":false,
            "roles":[
               "member"
            ]
         }
      ]
   },
   "dialog":{
      "canonicalDialogId":"6856047fa04f2602e3c6_6856809fec45ecafda7d",
      "teamId":"68587d6b001dbbc988a1",
      "occupantIds":[
         "6856809fec45ecafda7d",
         "6856047fa04f2602e3c6"
      ],
      "$id":"68587d6b001dbbc988a1",
      "$permissions":[
         "read(\"team:68587d6b001dbbc988a1\")",
         "update(\"team:68587d6b001dbbc988a1\")",
         "delete(\"team:68587d6b001dbbc988a1\")"
      ],
      "$createdAt":"2025-06-22T22:02:19.995+00:00",
      "$updatedAt":"2025-06-22T22:02:19.995+00:00",
      "$sequence":"6",
      "$databaseId":"657e07e99ad1b086d9a9",
      "$collectionId":"68571641001893bfe8a4"
   }
}
 */

import { Client, Databases, ID, Teams, Query, Permission, Role } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  try {
    const requestedUserId = req.headers['x-appwrite-user-id'];
    if (!requestedUserId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'requesterUserId parameter is required'
      });
    }

    const { userId, occupantId } = req.body;

    if (!userId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'userId parameter is required'
      });
    }

    if (!occupantId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'occupantId parameter is required'
      });
    }

    if (occupantId === userId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'userId and occupantId cannot be the same'
      });
    }

    if (requestedUserId !== userId && requestedUserId !== occupantId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'requesterUserId must be the same as userId or occupantId'
      });
    }

    const client = getClient();
    const databases = new Databases(client);

    const ids = [userId, occupantId].sort();
    let dialog = await getDialog(databases, ids);

    if (!dialog) {
      dialog = await createDialog(databases, mutualId, canonicalDialogId, [userId, occupantId]);
      return res.json({ dialog: dialog });
    }

    return res.json({ dialog: dialog });
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
 * Create a dialogId for a given pair of userId and occupantId.
 * It ensures that the dialogId is always the same for the same pair of userIds,
 * no matter the order of the userId and the occupantId.
 * @param {string} userId - The id of the user.
 * @param {string} occupantId - The id of the user's occupant.
 * @return {string} The dialogId for the given pair of userId and occupantId.
 */
function createDialogId(userId, occupantId) {
  if (userId.localeCompare(occupantId) <= 0) {
    return `${userId}_${occupantId}`;
  } else {
    return `${occupantId}_${userId}`;
  }
}


async function getDialog(databases, userId) {
  const documents = await databases.listDocuments(
    process.env.DB_ID,
    process.env.DB_COLLECTION_DIALOGS_ID,
    [
      Query.contains('occupants', userId)
    ],
  );

  if (documents.total < 1) {
    return null;
  } else if (documents.total == 1) {
    return documents.documents[0]
  } else {
    throw new Error('Multiple dialogs found');
  }
}


async function createDialog(databases, occupants) {
  return await databases.createDocument(
    process.env.DB_ID,
    process.env.DB_COLLECTION_DIALOGS_ID,
    'unique()',
    {
      occupants: occupants
    }
  );
}

/**
 * Get a team by its ID.
 * @param {Teams} teams An instance of the Teams client
 * @param {string} mutualId The ID of the team
 * @returns {Promise<{team: Team, memberships: Membership[]}>} The team document and its membership documents
 * @throws Will throw a 404 error if the team with the given mutual ID does not exist
 */
async function getTeam(teams, mutualId) {
  try {
    const team = await teams.get(mutualId);
    const memberships = await teams.listMemberships(mutualId);
    return {
      team: team,
      memberships: memberships
    };
  } catch (error) {
    // {"code":400,"type":404,"message":"Team with the requested ID could not be found."}
    // Thorws above error if team does not exist. Instead of throwing error, return null
    if (error.code === 404) {
      return null
    }
    throw error;
  }
}

/**
 * Creates a team with the given mutual ID and user IDs.
 * 
 * It will create a team with the given mutual ID and add the given user IDs to the team.
 * If a team with the given mutual ID already exists, it will throw an error.
 * 
 * @param {Teams} teams - An instance of the Teams client
 * @param {string} mutualId - The ID of the team to create
 * @param {string[]} userIds - The IDs of the users to add to the team
 * @returns {Promise<Object>} The team object and its memberships
 * @throws Will throw an error if the team with the given mutual ID already exists
 */
async function createTeam(teams, mutualId, userIds) {
  const teamName = 'Dialog_' + userIds.join('_');
  const memberships = [];
  const team = await teams.create(mutualId, teamName, ['owner', 'member']);
  for (const userId of userIds) {
    memberships.push(await teams.createMembership(mutualId, ['member'], undefined, userId));
  }
  return {
    team: team,
    memberships: memberships
  };
}