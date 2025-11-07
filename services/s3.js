const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const s3Client = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.YANDEX_S3_KEY_ID,
    secretAccessKey: process.env.YANDEX_S3_SECRET,
  },
});

async function uploadToS3(localPath, folder = 'downloaded_files') {
  const fileContent = fs.readFileSync(localPath);
  const filename = path.basename(localPath);
  const key = `${folder}/${Date.now()}_${filename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET,
      Key: key,
      Body: fileContent,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );

  return `https://storage.yandexcloud.net/${process.env.YANDEX_BUCKET}/${key}`;
}

async function downloadFromS3(s3FileUrl) {
  const localPath = path.join('/tmp', path.basename(s3FileUrl));
  const res = await axios.get(s3FileUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(localPath, res.data);
  return localPath;
}

module.exports = { uploadToS3, downloadFromS3 };
