const { autoScroll } = require('./autoScroll');
const { sleep } = require('./sleep');
const { expandAllSpoilers } = require('./expandAllSpoilers');
const { getReviewsUrl, getReviewsUrlWithSort } = require('./getReviewsUrl');
const { logWithCapture, warnWithCapture, errorWithCapture, getLogBuffer } = require('./logger');
const { generateHashFromReviews } = require('./generateHashFromReviews');
const { removeDuplicates } = require('./removeDuplicates');
const { getFormattedTimestamp } = require('./getFormattedTimestamp');
const { cleanString } = require('./cleanString');

module.exports = {
  autoScroll,
  sleep,
  expandAllSpoilers,
  getReviewsUrl,
  logWithCapture,
  warnWithCapture,
  errorWithCapture,
  getLogBuffer,
  generateHashFromReviews,
  removeDuplicates,
  getFormattedTimestamp,
  cleanString,
  getReviewsUrlWithSort,
};
