const { readExcelLinks, writeExcelReviews } = require('./excel');
const { uploadToS3, uploadScreenshot, downloadFromS3 } = require('./s3');
const { saveCookies, closeBrowser } = require('./browserCleanup');
const { calculateProductHash } = require('./calculateProductHash');
const { updateJobStatus } = require('./updateJobStatus');
const {
  createJob,
  getJob,
  startJob,
  finishJob,
  canStartNewJob,
  updateQueuePositions,
  jobQueue,
  cancelJob,
} = require('./jobManager');
const { processProduct } = require('./processProduct');

module.exports = {
  readExcelLinks,
  writeExcelReviews,
  uploadToS3,
  uploadScreenshot,
  downloadFromS3,
  saveCookies,
  closeBrowser,
  calculateProductHash,
  updateJobStatus,
  createJob,
  getJob,
  startJob,
  finishJob,
  canStartNewJob,
  processProduct,
  updateQueuePositions,
  jobQueue,
  cancelJob,
};
