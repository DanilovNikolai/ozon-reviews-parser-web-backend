const { goToNextPageByClick } = require('./paginator');
const { launchBrowserWithCookies } = require('./launchBrowser');
const { loadPageForHash } = require('./loadPageForHash');
const { safeEvaluate } = require('./safeEvaluate');

module.exports = {
  goToNextPageByClick,
  launchBrowserWithCookies,
  loadPageForHash,
  safeEvaluate,
};
