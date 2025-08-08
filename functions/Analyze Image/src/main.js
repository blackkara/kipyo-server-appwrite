import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleAuth } from "google-auth-library";

export default async ({ req, res, log, error }) => {
  try {
    const userIdZ = req.headers['x-appwrite-user-id'];
    console.log("User ID(req.headers['x-appwrite-user-id']):", userIdZ);

    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.json({
        code: 400,
        type: 'general_argument_invalid',
        message: 'imageBase64 parameter is required'
      });
    }

    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new GoogleAuth({ credentials });

    const imageBuffer = Buffer.from(imageBase64, 'base64');
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

    return res.json({
      hasFace,
      inappropriate,
      adult,
      medical,
      spoof,
      violence
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