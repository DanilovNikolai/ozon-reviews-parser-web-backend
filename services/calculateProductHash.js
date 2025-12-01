const { safeEvaluate, loadPageForHash } = require('../helpers');
const { extractReviewsFromHtml } = require('../extractors/extractReviewsFromHtml');
const { generateHashFromReviews, getReviewsUrlWithSort } = require('../utils');

const calculateProductHash = async (url, page, mode) => {
  const hashUrl = getReviewsUrlWithSort(url, 'score_asc');
  await loadPageForHash(page, hashUrl);

  const htmlForHash = await safeEvaluate(
    page,
    () => {
      const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
      return container.innerHTML;
    },
    10000
  );

  const { reviews } = extractReviewsFromHtml(htmlForHash, mode);
  const hash = generateHashFromReviews(reviews);
  return hash;
};

module.exports = { calculateProductHash };
