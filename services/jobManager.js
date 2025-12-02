const jobs = {};

let activeJobId = null;
let jobQueue = [];

// Уникальный ID
function createJobId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Создание job
function createJob({ s3InputFileUrl, mode }) {
  const now = Date.now();
  const jobId = createJobId();

  jobs[jobId] = {
    id: jobId,
    status: 'queued',

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
    error: null,
    processedProducts: [],
    processedHashes: [],

    queuePosition: 0,
  };

  jobQueue.push(jobId);
  updateQueuePositions();

  return jobs[jobId];
}

// Поиск job
function getJob(jobId) {
  return jobs[jobId] || null;
}

// Обновление позиций в очереди
function updateQueuePositions() {
  jobQueue.forEach((id, index) => {
    if (jobs[id]) jobs[id].queuePosition = index;
  });

  // Отмечаем активность
  Object.values(jobs).forEach((job) => {
    job.inQueue = jobQueue.includes(job.id);
    job.isActive = activeJobId === job.id;
  });
}

// Запуск job
function startJob(jobId) {
  activeJobId = jobId;
  jobs[jobId].status = 'downloading';
  jobs[jobId].updatedAt = Date.now();

  jobQueue = jobQueue.filter((id) => id !== jobId);
  updateQueuePositions();
}

// Завершение job
async function finishJob(jobId, runJobFn) {
  activeJobId = null;
  updateQueuePositions();

  if (jobQueue.length > 0) {
    const nextId = jobQueue[0];
    setTimeout(() => runJobFn(nextId), 200);
  }
}

function canStartNewJob() {
  return activeJobId === null;
}

module.exports = {
  jobs,
  jobQueue,
  activeJobId,
  createJob,
  getJob,
  startJob,
  finishJob,
  canStartNewJob,
  updateQueuePositions,
};
