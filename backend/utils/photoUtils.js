// photoUtils.js

function generatePhotoUrl(photoKey) {
  const baseUrl = process.env.SPACES_CDN_ENDPOINT || process.env.SPACES_ENDPOINT;
  const bucket = process.env.SPACES_BUCKET;
  return `${baseUrl}/${bucket}/${photoKey}`;
}

function generatePhotoUrls(photoKeys) {
  return photoKeys.map(key => generatePhotoUrl(key));
}

export { generatePhotoUrl, generatePhotoUrls };
