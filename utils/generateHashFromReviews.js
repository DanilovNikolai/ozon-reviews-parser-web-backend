const crypto = require('crypto');
const { cleanString } = require('./cleanString');

function generateHashFromReviews(reviews) {
  const simplified = reviews
    .map((r) => ({
      user: cleanString(r.user),
      rating: String(r.rating).trim(),
      comment: cleanString(r.comment),
      date: cleanString(r.date),
    }))
    .sort((a, b) => {
      const keyA = a.user + a.date + a.comment;
      const keyB = b.user + b.date + b.comment;
      return keyA.localeCompare(keyB);
    });

  const text = JSON.stringify(simplified);
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { generateHashFromReviews };
