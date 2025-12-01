// Хранилище задач в памяти
const jobs = {};

// Генерация уникального ID задачи.
function createJobId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Создать новую задачу и поместить в хранилище
function createJob({ s3InputFileUrl, mode }) {
  const now = Date.now();
  const jobId = createJobId();

  jobs[jobId] = {
    id: jobId,
    status: 'queued',
    error: null,
    s3InputFileUrl,
    s3OutputUrl: null,
    mode: mode || '3',
    createdAt: now,
    updatedAt: now,
    totalUrls: 0,
    processedUrls: 0,
    currentUrl: null,
    currentPage: 0,
    collectedReviews: 0,
    totalReviewsCount: 0,
    cancelRequested: false,
    processedHashes: [],
    processedProducts: [],
  };

  return jobs[jobId];
}

// Вернуть задачу по jobId
function getJob(jobId) {
  return jobs[jobId] || null;
}

module.exports = {
  jobs,
  createJob,
  getJob,
};
