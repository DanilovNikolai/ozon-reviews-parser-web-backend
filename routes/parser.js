const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const router = express.Router();
const prisma = require('../prisma/prisma-client');

const {
  createJob,
  getJob,
  startJob,
  finishJob,
  canStartNewJob,
  cancelJob,
} = require('../services');
const { logWithCapture } = require('../utils');
const { runJob } = require('../services/jobRunner');

// === Создание задачи ===
router.post('/', async (req, res) => {
  req.user = { userId: 1 };
  const { s3InputFileUrl, mode } = req.body;
  const userId = req.user.userId;

  if (!s3InputFileUrl) {
    return res.status(400).json({ success: false, error: 'Нет s3InputFileUrl' });
  }

  // 1. Создаём запись в БД
  const dbJob = await prisma.parserJob.create({
    data: {
      userId,
      mode: mode || '3',
      s3InputFileUrl,
      status: 'QUEUED',
    },
  });

  // 2. Создаём in-memory job и сохраняем dbJobId
  const job = createJob({
    s3InputFileUrl,
    mode,
    dbJobId: dbJob.id,
  });

  logWithCapture(`🧩 Создана задача ${job.id} (db: ${dbJob.id})`);

  if (canStartNewJob()) {
    const runJobFn = (id) => {
      const j = getJob(id);
      if (!j) return Promise.resolve();
      return runJob(id, { s3InputFileUrl: j.s3InputFileUrl, mode: j.mode });
    };

    startJob(job.id);

    runJobFn(job.id).then(() => {
      finishJob(job.id, runJobFn);
    });
  }

  return res.json({ success: true, jobId: job.id });
});

// === Статус задачи ===
router.get('/:jobId/status', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Задача не найдена' });
  return res.json({ success: true, ...job, status: job.status?.toLowerCase() });
});

// === Отмена задачи ===
router.post('/:jobId/cancel', (req, res) => {
  const jobId = req.params.jobId;
  const ok = cancelJob(jobId);

  if (!ok) return res.json({ success: false, error: 'Не удалось отменить задачу' });

  return res.json({ success: true, message: 'Отмена запрошена' });
});

module.exports = router;
