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
router.post('/', authMiddleware, async (req, res) => {
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

// === История задач ===
router.get('/jobs', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const jobs = await prisma.parserJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mode: true,
        status: true,
        error: true,

        s3InputFileUrl: true,
        s3OutputUrl: true,

        totalUrls: true,
        collectedReviews: true,

        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    const result = jobs.map((job) => {
      const started = job.startedAt ?? job.createdAt;
      const finished = job.finishedAt ?? null;

      const durationSeconds = started && finished ? Math.floor((finished - started) / 1000) : null;

      return {
        id: job.id,
        mode: job.mode,
        status: job.status,
        error: job.error,

        inputFileUrl: job.s3InputFileUrl,
        outputFileUrl: job.s3OutputUrl,

        totalUrls: job.totalUrls ?? 0,
        collectedReviews: job.collectedReviews ?? 0,

        createdAt: job.createdAt,
        createdAtHuman: job.createdAt.toLocaleString('ru-RU'),

        durationSeconds,
      };
    });

    return res.json({
      success: true,
      jobs: result,
    });
  } catch (err) {
    console.error('❌ Ошибка получения истории запусков:', err);
    return res.status(500).json({
      success: false,
      error: 'Не удалось получить историю запусков',
    });
  }
});

module.exports = router;
