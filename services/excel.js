// services/excel.js
const { generateExcelBuffer } = require('../helpers/saveToExcel');
const { uploadToS3 } = require('./s3');
const XLSX = require('xlsx');
const fs = require('fs');
const { logWithCapture } = require('../utils');

/**
 * Читает Excel-файл с ссылками на товары и возвращает массив URL
 * @param {string} filePath - локальный путь к файлу, скачанному с S3
 * @returns {Promise<string[]>} - массив ссылок на товары
 */

async function readExcelLinks(input) {
  logWithCapture(`📥 Читаю Excel`);

  let workbook;
  if (Buffer.isBuffer(input)) {
    workbook = XLSX.read(input, { type: 'buffer' });
  } else if (typeof input === 'string') {
    workbook = XLSX.readFile(input);
  } else {
    throw new Error('Invalid input to readExcelLinks');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const urls = data
    .flat()
    .filter((x) => typeof x === 'string' && x.startsWith('https://www.ozon.ru/product/'));

  logWithCapture(`🔗 Найдено ссылок: ${urls.length}`);
  return urls;
}

/**
 * Генерирует Excel с отзывами и загружает его на S3
 * @param {Array} allResults - массив объектов с результатами парсинга
 * @returns {Promise<string>} - URL загруженного Excel файла на S3
 */
async function writeExcelReviews(allResults) {
  logWithCapture(`💾 Формируем Excel для ${allResults.length} товаров...`);

  // 1️⃣ Генерация Excel в Buffer
  const buffer = generateExcelBuffer(allResults);

  // 2️⃣ Имя файла для S3
  const filename = `ozon_reviews_${Date.now()}.xlsx`;

  // 3️⃣ Загружаем напрямую в S3 (не используем локальный диск)
  const s3Url = await uploadToS3(buffer, 'downloaded_files', filename);

  logWithCapture(`✅ Excel загружен на S3: ${s3Url}`);
  return s3Url;
}

module.exports = {
  readExcelLinks,
  writeExcelReviews,
};
