const XLSX = require('xlsx');
const { removeDuplicates, logWithCapture, getLogBuffer } = require('../utils');

/**
 * Собирает все отзывы и возвращает Excel-файл в виде Buffer
 * @param {Array} allData - массив объектов от parseReviewsFromUrl()
 * @returns {Buffer} buffer Excel-файла
 */
function generateExcelBuffer(allData) {
  const sheetName = 'Отзывы Ozon';
  const errorSheet = 'ОШИБКА';
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

  const wb = XLSX.utils.book_new();
  const hasError = allData.some((d) => d.errorOccurred);

  const rows = allData.flatMap((d) =>
    d.reviews.map((r) => [
      r.url || '',
      r.product,
      r.comment,
      r.rating,
      r.date,
      r.user,
      r.ordinal || '',
      r.hash || '',
      r.urlMatch || '',
    ])
  );

  const { uniqueRows, duplicateCount } = removeDuplicates(rows, [], false);
  const data = [headers, ...uniqueRows];
  const mainSheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, mainSheet, sheetName);

  if (hasError) {
    const logLines = getLogBuffer();
    const errorSheetData = logLines.map((line) => [line]);
    const errSheet = XLSX.utils.aoa_to_sheet(errorSheetData);
    XLSX.utils.book_append_sheet(wb, errSheet, errorSheet);
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  logWithCapture(`💾 Excel-файл успешно сформирован`);
  logWithCapture(`✅ Уникальных отзывов добавлено: ${uniqueRows.length}`);
  if (duplicateCount > 0) logWithCapture(`⚠️ Пропущено дубликатов: ${duplicateCount}`);

  return buffer;
}

module.exports = { generateExcelBuffer };
