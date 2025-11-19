// services/excel.js
const XLSX = require('xlsx');
const fs = require('fs');
const { uploadToS3 } = require('./s3');
const { logWithCapture, getLogBuffer, clearLogBuffer } = require('../utils');

/**
 * Читает Excel-файл со списком ссылок на товары
 */
async function readExcelLinks(filePath) {
  logWithCapture(`📥 Читаю Excel: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
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
 * Удаляет дубликаты, сравнивая с существующими строками (по URL + ordinal)
 */
function removeDuplicates(newRows, existingRows) {
  const existingSet = new Set(existingRows.map((r) => `${r[0]}_${r[6]}`));

  const uniqueRows = [];
  let duplicates = 0;

  for (const row of newRows) {
    const key = `${row[0]}_${row[6]}`;
    if (existingSet.has(key)) {
      duplicates++;
      continue;
    }
    existingSet.add(key);
    uniqueRows.push(row);
  }

  return { uniqueRows, duplicateCount: duplicates };
}

/**
 * Генерирует Excel-файл с отзывами + логами при ошибках.
 * Возвращает URL загруженного файла в S3.
 */
async function writeExcelReviews(allResults) {
  logWithCapture(`💾 Формируем Excel для ${allResults.length} товаров...`);

  const wb = XLSX.utils.book_new();
  const MAIN_SHEET = 'Отзывы Ozon';
  const ERROR_SHEET = 'ОШИБКА';
  const LOG_SHEET = 'ЛОГИ';

  const headers = [
    'Ссылка',
    'Вариант товара',
    'Комментарий',
    'Оценка',
    'Дата',
    'Пользователь',
    'Порядковый номер',
    'Id товара',
    'Совпавший товар',
  ];

  // ------ собираем данные отзывов ------
  const newRows = allResults.flatMap((res) =>
    res.reviews.map((r) => [
      r.url || '',
      r.product || '',
      r.comment || '',
      r.rating || '',
      r.date || '',
      r.user || '',
      r.ordinal || '',
      r.hash || '',
      r.urlMatch || '',
    ])
  );

  const data = [headers, ...newRows];

  const mainSheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, mainSheet, MAIN_SHEET);

  // ------ ЕСЛИ БЫЛА ОШИБКА — создаём лист ERROR / ЛОГИ ------
  const hasError = allResults.some((r) => r.error || r.errorOccurred);

  if (hasError) {
    logWithCapture('⚠️ Обнаружены ошибки — создаю лист ERROR и LOGS');

    // Лист "ОШИБКА": краткое описание
    const errorMessages = allResults
      .filter((r) => r.error || r.errorOccurred)
      .flatMap((r) => [
        [`Ошибка при парсинге товара:`],
        [r.productName || r.url || ''],
        [r.error || 'Неизвестная ошибка'],
        [''],
      ]);

    const errorSheet = XLSX.utils.aoa_to_sheet(errorMessages);
    XLSX.utils.book_append_sheet(wb, errorSheet, ERROR_SHEET);

    // Лист "ЛОГИ" — весь лог буфера
    const logs = getLogBuffer();
    const logsSheet = XLSX.utils.aoa_to_sheet(logs.map((l) => [l]));
    XLSX.utils.book_append_sheet(wb, logsSheet, LOG_SHEET);
  }

  // ------ пишем файл в буфер ------
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  // ------ загрузка на S3 ------
  const filename = `ozon_reviews_${Date.now()}.xlsx`;
  const url = await uploadToS3(buffer, 'downloaded_files', filename);

  logWithCapture(`📤 Excel загружен на S3: ${url}`);
  logWithCapture(`📦 Уникальных отзывов добавлено: ${newRows.length}`);

  clearLogBuffer();

  return url;
}

module.exports = { readExcelLinks, writeExcelReviews };
