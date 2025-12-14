const { createLock, removeLock } = require('../utils/lockManager');
const { updateParserJob } = require('./parserJobUpdater');
const prisma = require('../prisma/prisma-client');

const jobs = {};

let activeJobId = null;
const jobQueue = [];

const PARSER_LOCK_NAME = 'parser';
const PARSER_LOCK_TTL_MIN = Number(process.env.PARSER_LOCK_TTL_MIN || 120);

// Уникальный ID
function createJobId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
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

  if (activeJobId && jobs[activeJobId]) {
    jobs[activeJobId].queuePosition = 0;
    jobs[activeJobId].humanQueuePosition = 0;
  }
}

// Можно ли запускать новую задачу прямо сейчас
function canStartNewJob() {
  return activeJobId === null;
}

// === СОЗДАНИЕ ЗАДАЧИ ===
function createJob({ s3InputFileUrl, mode, dbJobId }) {
  const now = Date.now();
  const jobId = createJobId();

  jobs[jobId] = {
    id: jobId,
    dbJobId,
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

// === ПОИСК ЗАДАЧИ ===
function getJob(jobId) {
  return jobs[jobId] || null;
}

// === ЗАПУСК ЗАДАЧИ ===
async function startJob(jobId) {
  const job = jobs[jobId];
  if (!job) return;

  if (!activeJobId) {
    createLock(PARSER_LOCK_NAME, PARSER_LOCK_TTL_MIN, { type: 'parsing' });
  }

  activeJobId = jobId;
  const now = Date.now();

  job.status = 'downloading';
  job.startedAt = job.startedAt || now;
  job.updatedAt = now;

  // Синхронизация с БД
  await updateParserJob(job.dbJobId, {
    status: 'DOWNLOADING',
    startedAt: new Date(now),
  });

  const index = jobQueue.indexOf(jobId);
  if (index !== -1) jobQueue.splice(index, 1);

  updateQueuePositions();
}

// === ОТМЕНА ЗАДАЧИ ===
async function cancelJob(jobId) {
  const job = jobs[jobId];
  if (!job) return false;

  // 1) Задача в очереди — сразу отменяем
  const idx = jobQueue.indexOf(jobId);
  if (idx !== -1) {
    jobQueue.splice(idx, 1);
    job.status = 'cancelled';
    job.cancelRequested = true;
    job.updatedAt = Date.now();
    updateQueuePositions();

    await updateParserJob(job.dbJobId, {
      status: 'CANCELLED',
      finishedAt: new Date(),
    });

    return true;
  }

  // 2) Активная задача — помечаем, но НЕ финализируем
  if (activeJobId === jobId) {
    job.cancelRequested = true;
    job.status = 'cancelling';
    job.updatedAt = Date.now();

    return true;
  }

  return false;
}

// === ЗАВЕРШЕНИЕ ЗАДАЧИ И ЗАПУСК СЛЕДУЮЩЕЙ ===
function finishJob(jobId, runJobFn) {
  activeJobId = null;
  updateQueuePositions();

  const startNext = () => {
    // если задач больше нет — снимаем parser.lock
    if (jobQueue.length === 0) {
      removeLock(PARSER_LOCK_NAME);
      return;
    }

    if (activeJobId) return;

    const nextId = jobQueue[0];
    const nextJob = getJob(nextId);

    // Если задачи нет — выкидываем из очереди и пробуем следующую
    if (!nextJob) {
      jobQueue.shift();
      updateQueuePositions();
      return startNext();
    }

    // Если уже отменена — тоже выкидываем из очереди
    if (nextJob.status === 'cancelled' || nextJob.cancelRequested) {
      jobQueue.shift();
      updateQueuePositions();
      return startNext();
    }

    // Обычный запуск следующей задачи
    startJob(nextId);
    runJobFn(nextId).then(() => finishJob(nextId, runJobFn));
  };

  // Небольшая пауза перед запуском следующей
  setTimeout(startNext, 1000);
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
