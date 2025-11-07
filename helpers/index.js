const { goToNextPageByClick } = require('./paginator');
const { saveAllReviewsToExcel } = require('./saveToExcel');
const { launchBrowserWithCookies } = require('./launchBrowser');

module.exports = { goToNextPageByClick, saveAllReviewsToExcel, launchBrowserWithCookies };
