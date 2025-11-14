// services/s3.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({
  region: 'ru-central1',
  endpoint: process.env.YANDEX_ENDPOINT,
  credentials: {
    accessKeyId: process.env.YANDEX_ACCESS_KEY,
    secretAccessKey: process.env.YANDEX_SECRET_KEY,
  },
});

function detectContentType(filename) {
  const ext = filename.toLowerCase();
  if (ext.endsWith('.png')) return 'image/png';
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
  if (ext.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

async function uploadToS3(file, folder = 'downloaded_files', filename = null) {
  let fileContent;

  if (Buffer.isBuffer(file)) {
    fileContent = file;
    filename = filename || `file_${Date.now()}`;
  } else {
    if (!fs.existsSync(file)) throw new Error(`Файл не найден: ${file}`);
    fileContent = fs.readFileSync(file);
    filename = filename || path.basename(file);
  }

  const contentType = detectContentType(filename);
  const key = `${folder}/${Date.now()}_${filename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
    })
  );

  return `https://storage.yandexcloud.net/${process.env.YANDEX_BUCKET}/${key}`;
}

async function uploadScreenshot(localPath) {
  return uploadToS3(localPath, 'debug_screenshots');
}

async function downloadFromS3(url) {
  const axios = require('axios');
  const tmp = path.join('/tmp', path.basename(url));
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(tmp, res.data);
  return tmp;
}

module.exports = { uploadToS3, uploadScreenshot, downloadFromS3 };
