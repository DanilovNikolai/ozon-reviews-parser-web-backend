const { autoScroll } = require('./autoScroll');
const { sleep } = require('./sleep');
const { expandAllSpoilers } = require('./expandAllSpoilers');
const { getReviewsUrl, getReviewsUrlWithSort } = require('./getReviewsUrl');
const {
  logWithCapture,
  warnWithCapture,
  errorWithCapture,
  getLogBuffer,
  clearLogBuffer,
} = require('./logger');
const { generateHashFromReviews } = require('./generateHashFromReviews');
const { removeDuplicates } = require('./removeDuplicates');
const { getFormattedTimestamp } = require('./getFormattedTimestamp');
const { cleanString } = require('./cleanString');
const { humanMouse } = require('./humanMouse');
const { humanScroll } = require('./humanScroll');
const { humanKeyboard } = require('./humanKeyboard');
const { getTotalReviewsCountFromTitle } = require('./getTotalReviewsCountFromTitle');

module.exports = {
  autoScroll,
  sleep,
  expandAllSpoilers,
  getReviewsUrl,
  logWithCapture,
  warnWithCapture,
  errorWithCapture,
  getLogBuffer,
  clearLogBuffer,
  generateHashFromReviews,
  removeDuplicates,
  getFormattedTimestamp,
  cleanString,
  getReviewsUrlWithSort,
  humanKeyboard,
  humanMouse,
  humanScroll,
  getTotalReviewsCountFromTitle,
};
