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

/**
 * Загружает файл или Buffer в S3
 * @param {string|Buffer} file - локальный путь или Buffer
 * @param {string} folder - папка в S3
 * @param {string} [filename] - имя файла (если Buffer)
 * @returns {Promise<string>} - URL загруженного файла
 */

async function uploadToS3(file, folder = 'downloaded_files', filename = null) {
  let fileContent;
  if (Buffer.isBuffer(file)) {
    fileContent = file;
    filename = filename || `file_${Date.now()}.xlsx`;
  } else if (typeof file === 'string') {
    if (!fs.existsSync(file)) throw new Error(`Файл не найден: ${file}`);
    fileContent = fs.readFileSync(file);
    filename = filename || path.basename(file);
  } else {
    throw new Error('uploadToS3: аргумент должен быть буффером или путём к файлу');
  }

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

/**
 * Скачивает файл с S3 по URL и сохраняет во временный локальный путь
 * @param {string} s3FileUrl
 * @returns {Promise<string>} - локальный путь
 */

async function downloadFromS3(s3FileUrl) {
  const axios = require('axios');
  const tmpPath = path.join('/tmp', path.basename(s3FileUrl));

  const res = await axios.get(s3FileUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(tmpPath, res.data);

  return tmpPath;
}

module.exports = { uploadToS3, downloadFromS3 };
