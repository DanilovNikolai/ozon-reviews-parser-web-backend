function getFormattedTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = String(now.getFullYear()).slice(2);
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  return `[${day}.${month}.${year} | ${hours}:${minutes}]`;
}

module.exports = { getFormattedTimestamp };
