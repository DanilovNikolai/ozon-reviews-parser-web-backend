const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const s3 = new AWS.S3({
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
  credentials: {
    accessKeyId: process.env.YANDEX_S3_KEY_ID,
    secretAccessKey: process.env.YANDEX_S3_SECRET,
  },
});

async function uploadToS3(input, keyOrFolder) {
  let buffer;
  let key;

  if (Buffer.isBuffer(input)) {
    key = typeof keyOrFolder === 'string' ? keyOrFolder : `downloaded_files/${Date.now()}.xlsx`;
    buffer = input;
  } else if (typeof input === 'string' && fs.existsSync(input)) {
    buffer = fs.readFileSync(input);
    key = `${keyOrFolder}/${path.basename(input)}`;
  } else {
    throw new Error('Invalid input for uploadToS3');
  }

  await s3
    .putObject({
      Bucket: process.env.YANDEX_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    .promise();

  return `https://${process.env.YANDEX_S3_BUCKET}.storage.yandexcloud.net/${key}`;
}

async function downloadFromS3(fileUrl) {
  const localPath = path.join('/tmp', path.basename(fileUrl));
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(localPath, response.data);
  return localPath;
}

module.exports = { uploadToS3, downloadFromS3 };
