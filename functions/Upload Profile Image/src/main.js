import { Client, Databases } from 'node-appwrite';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleAuth } from "google-auth-library";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fileTypeFromBuffer } from 'file-type';
import { randomBytes } from 'crypto';

export default async ({ req, res, log, error }) => {
  try {

    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'userId parameter is required'
      });
    }

    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'imageBase64 parameter is required'
      });
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const fileInfo = await fileTypeFromBuffer(imageBuffer);
    if (!fileInfo || fileInfo.mime !== 'image/jpeg') {
      return res.json({
        code: 400,
        type: 'invalid_image_format',
        message: 'Only JPEG images are allowed'
      });
    }

    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new GoogleAuth({ credentials });
    const imageAnnotatorClient = new ImageAnnotatorClient({ auth });

    const [faceDetectionResult] = await imageAnnotatorClient.faceDetection(imageBuffer);
    const hasFace = faceDetectionResult.faceAnnotations.length > 0;

    if (!hasFace) {
      return res.json({
        hasFace
      });
    }

    const [safeSearchDetectionResult] = await imageAnnotatorClient.safeSearchDetection(imageBuffer);
    const { adult, medical, spoof, violence } = safeSearchDetectionResult.safeSearchAnnotation;
    const inappropriate = isInappropriate([adult, medical, spoof, violence]);

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new Databases(client);
    const profile = await databases.getDocument(
      process.env.DB_ID,
      process.env.DB_COLLECTION_PROFILE_ID,
      userId
    );

    if (!profile) {
      return res.json({
        code: 400,
        type: 'profile_not_found',
        message: 'Profile not found'
      });
    }

    const key = randomBytes(18).toString('hex').toUpperCase();
    const updatedPhotos = [...(profile.photos || []), key];

    const spaces = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT,
      region: process.env.SPACES_AWS_REGION,
      credentials: {
        accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
        secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
      },
      forcePathStyle: false,
    });

    const uploadedPhoto = await spaces.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      Body: imageBuffer,
      ACL: 'public-read',
      ContentType: 'image/jpeg'
    }));

    const updatedProfile = await databases.updateDocument(
      process.env.DB_ID,
      process.env.DB_COLLECTION_PROFILE_ID,
      userId,
      { photos: updatedPhotos }
    );

    return res.json({
      hasFace,
      inappropriate,
      adult,
      medical,
      spoof,
      violence,
      key,
      uploadedPhoto,
      updatedProfile
    });
  } catch (e) {
    return res.json({
      code: 400,
      type: e.code || 'processing_error',
      message: e.message || 'Unknown error'
    });
  }
};

const isInappropriate = (values) => {
  for (let index = 0; index < values.length; index++) {
    if (isInappropriateSingle(values[index])) {
      return true;
    }
  }
  return false;
}

const isInappropriateSingle = (value) => {
  return value === 'LIKELY' || value === 'VERY_LIKELY';
}
