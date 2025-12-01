function getTotalReviewsCountFromTitle(titleText) {
  const titleMatch = titleText.match(/([\d\s]+)\s+отзыв/i);
  if (!titleMatch) return null;
  return parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
}

module.exports = { getTotalReviewsCountFromTitle };
