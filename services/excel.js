// services/excel.js
const XLSX = require('xlsx');
const fs = require('fs');
const { uploadToS3 } = require('./s3');
const { logWithCapture, getLogBuffer, clearLogBuffer, removeDuplicates } = require('../utils');

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

  const rawRows = [];

  // ------ собираем данные отзывов + строки-дубли ------

  for (const res of allResults) {
    // Если это дубликат товара — добавляем одну специальную строку
    if (res.skipped) {
      rawRows.push([
        res.url || '',
        'ДУБЛЬ ТОВАРА',
        'ДУБЛЬ ТОВАРА',
        'ДУБЛЬ ТОВАРА',
        'ДУБЛЬ ТОВАРА',
        'ДУБЛЬ ТОВАРА',
        'ДУБЛЬ ТОВАРА',
        res.hash || '',
        res.duplicateOfUrl || '',
      ]);
      continue;
    }

    if (!Array.isArray(res.reviews) || res.reviews.length === 0) {
      continue;
    }

    const rowsForProduct = res.reviews.map((r) => [
      r.url || '',
      r.product || '',
      r.comment || '',
      r.rating || '',
      r.date || '',
      r.user || '',
      r.ordinal || '',
      r.hash || '',
      r.urlMatch || '',
    ]);

    rawRows.push(...rowsForProduct);
  }

  // ------ удаляем дубликаты из rawRows ------
  const { uniqueRows, duplicateCount } = removeDuplicates(rawRows, [], false);

  logWithCapture(`🧹 Удалено дубликатов отзывов: ${duplicateCount}`);
  logWithCapture(`📦 Уникальных отзывов осталось: ${uniqueRows.length}`);

  const mainSheet = XLSX.utils.aoa_to_sheet([headers, ...uniqueRows]);
  XLSX.utils.book_append_sheet(wb, mainSheet, MAIN_SHEET);

  // ------ ЕСЛИ БЫЛА ОШИБКА — создаём лист ERROR / ЛОГИ ------
  const hasError = allResults.some((r) => r.error || r.errorOccurred);

  if (hasError) {
    logWithCapture('⚠️ Обнаружены ошибки — создаю лист ERROR и LOGS');

    // Лист "ОШИБКА"
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

    // Лист "ЛОГИ"
    const logs = getLogBuffer();
    const logsSheet = XLSX.utils.aoa_to_sheet(logs.map((l) => [l]));
    XLSX.utils.book_append_sheet(wb, logsSheet, LOG_SHEET);
  }

  // ------ пишем файл в буфер ------
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const timestamp = Date.now();
  let filename = `result_${timestamp}.xlsx`;

  if (hasError) {
    filename = `result_${timestamp}_ОШИБКА.xlsx`;
  }

  // ------ загрузка на S3 ------
  const url = await uploadToS3(buffer, 'downloaded_files', filename);

  logWithCapture(`📤 Excel загружен на S3: ${url}`);
  logWithCapture(`📦 Уникальных отзывов добавлено в файл: ${uniqueRows.length}`);

  clearLogBuffer();

  return url;
}

module.exports = { readExcelLinks, writeExcelReviews };
