const jobs = {};

let activeJobId = null;
const jobQueue = [];

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
    startedAt: null,

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
    humanQueuePosition: 0,
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
    const job = jobs[id];
    if (job) {
      job.queuePosition = index;
      job.humanQueuePosition = activeJobId && job.id !== activeJobId ? index + 1 : index;
    }
  });

  // активная задача всегда в начале
  if (activeJobId && jobs[activeJobId]) {
    jobs[activeJobId].queuePosition = 0;
    jobs[activeJobId].humanQueuePosition = 0;
  }
}

// Запуск job
function startJob(jobId) {
  const job = jobs[jobId];
  if (!job) return;

  activeJobId = jobId;
  job.status = 'downloading';
  job.startedAt = Date.now();
  job.updatedAt = Date.now();

  const index = jobQueue.indexOf(jobId);
  if (index !== -1) jobQueue.splice(index, 1);

  updateQueuePositions();
}

// Завершение job и запуск следующей
function finishJob(jobId, runJobFn) {
  activeJobId = null;
  updateQueuePositions();

  if (jobQueue.length === 0) {
    return;
  }

  const nextId = jobQueue[0];

  setTimeout(() => {
    const nextJob = getJob(nextId);
    if (!nextJob) {
      // на всякий случай чистим очередь
      const idx = jobQueue.indexOf(nextId);
      if (idx !== -1) jobQueue.splice(idx, 1);
      updateQueuePositions();
      if (jobQueue.length > 0) {
        finishJob(nextId, runJobFn);
      }
      return;
    }

    // если уже отменён — пропускаем и берём следующего
    if (nextJob.status === 'cancelled' || nextJob.cancelRequested) {
      const idx = jobQueue.indexOf(nextId);
      if (idx !== -1) jobQueue.splice(idx, 1);
      updateQueuePositions();

      if (jobQueue.length > 0) {
        finishJob(nextId, runJobFn);
      }
      return;
    }

    // обычный запуск
    startJob(nextId);
    runJobFn(nextId);
  }, 200);
}

function cancelJob(jobId) {
  const job = jobs[jobId];
  if (!job) return false;

  // 1) Если в очереди — просто удалить
  const idx = jobQueue.indexOf(jobId);
  if (idx !== -1) {
    jobQueue.splice(idx, 1);
    job.status = 'cancelled';
    job.cancelRequested = true;
    job.updatedAt = Date.now();
    updateQueuePositions();
    return true;
  }

  // 2) Если активная
  if (activeJobId === jobId) {
    job.status = 'cancelled';
    job.cancelRequested = true;
    job.updatedAt = Date.now();
    activeJobId = null;
    updateQueuePositions();
    return true;
  }

  return false;
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
  cancelJob,
};
