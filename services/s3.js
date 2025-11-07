const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.YANDEX_S3_KEY_ID,
    secretAccessKey: process.env.YANDEX_S3_SECRET,
  },
});

/**
 * Загружает Buffer или локальный файл на S3
 * @param {Buffer|string} input - Buffer с данными или путь к локальному файлу
 * @param {string} folder - папка на S3
 * @param {string} [filename] - имя файла, если input — Buffer
 * @returns {Promise<string>} - URL загруженного файла
 */

async function uploadToS3(input, folder = 'downloaded_files', filename) {
  let fileBuffer;
  let finalFilename;

  if (Buffer.isBuffer(input)) {
    fileBuffer = input;
    if (!filename) throw new Error('Для Buffer необходимо указать имя файла');
    finalFilename = filename;
  } else if (typeof input === 'string') {
    const fs = require('fs');
    const path = require('path');
    fileBuffer = fs.readFileSync(input);
    finalFilename = path.basename(input);
  } else {
    throw new Error('uploadToS3 ожидает Buffer или путь к файлу');
  }

  const key = `${folder}/${Date.now()}_${finalFilename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );

  return `https://storage.yandexcloud.net/${process.env.YANDEX_BUCKET}/${key}`;
}

/**
 * Скачивает файл с S3 в /tmp и возвращает локальный путь
 * @param {string} s3FileUrl
 * @returns {Promise<string>} - путь к локальному файлу
 */

async function downloadFromS3(s3FileUrl) {
  const path = require('path');
  const fs = require('fs');
  const axios = require('axios');

  const localPath = path.join('/tmp', path.basename(s3FileUrl));
  const res = await axios.get(s3FileUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(localPath, res.data);
  return localPath;
}

module.exports = { uploadToS3, downloadFromS3 };
