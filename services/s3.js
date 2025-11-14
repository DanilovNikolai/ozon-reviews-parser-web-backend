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
 * Определяем Content-Type по расширению файла
 */
function detectContentType(filename) {
  const ext = filename.toLowerCase();

  if (ext.endsWith('.png')) return 'image/png';
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
  if (ext.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return 'application/octet-stream';
}

/**
 * Универсальная функция загрузки любого файла в S3
 * @param {string|Buffer} file - путь или Buffer
 * @param {string} folder - папка в корзине
 * @param {string|null} filename - имя файла, если передаётся Buffer
 * @returns {Promise<string>} — ссылка на загруженный файл
 */

async function uploadToS3(file, folder = 'downloaded_files', filename = null) {
  let fileContent;

  if (Buffer.isBuffer(file)) {
    fileContent = file;
    filename = filename || `file_${Date.now()}`;
  } else if (typeof file === 'string') {
    if (!fs.existsSync(file)) throw new Error(`Файл не найден: ${file}`);
    fileContent = fs.readFileSync(file);
    filename = filename || path.basename(file);
  } else {
    throw new Error('uploadToS3: аргумент должен быть Buffer или строкой пути');
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

/**
 * Скачивает файл с S3 по URL во временный путь
 */
async function downloadFromS3(s3FileUrl) {
  const axios = require('axios');
  const tmpPath = path.join('/tmp', path.basename(s3FileUrl));

  const res = await axios.get(s3FileUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(tmpPath, res.data);

  return tmpPath;
}

/**
 * Ззагрузка скриншотов
 */
async function uploadScreenshot(localPath) {
  return uploadToS3(localPath, 'debug_screenshots');
}

module.exports = { uploadToS3, uploadScreenshot, downloadFromS3 };
