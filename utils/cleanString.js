function cleanString(str) {
  return str
    .replace(/\s+/g, ' ') // убираем лишние пробелы
    .replace(/\u00A0/g, ' ') // убираем неразрывные пробелы
    .trim()
    .toLowerCase();
}

module.exports = { cleanString };
