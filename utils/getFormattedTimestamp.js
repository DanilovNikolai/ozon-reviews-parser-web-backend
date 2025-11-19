function getFormattedTimestamp() {
  const now = new Date();

  // Москва +3 часа
  const local = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(local.getDate());
  const month = pad(local.getMonth() + 1);
  const year = String(local.getFullYear()).slice(2);
  const hours = pad(local.getHours());
  const minutes = pad(local.getMinutes());

  return `[${day}.${month}.${year} | ${hours}:${minutes}]`;
}

module.exports = { getFormattedTimestamp };