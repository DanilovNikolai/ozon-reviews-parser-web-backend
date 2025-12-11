const express = require('express');
const router = express.Router();

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
  const { s3InputFileUrl, mode } = req.body;
  if (!s3InputFileUrl) return res.status(400).json({ success: false, error: 'Нет s3InputFileUrl' });

  const job = createJob({ s3InputFileUrl, mode });
  logWithCapture(`🧩 Создана задача ${job.id}`);

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
  return res.json({ success: true, ...job });
});

// === Отмена задачи ===
router.post('/:jobId/cancel', (req, res) => {
  const jobId = req.params.jobId;
  const ok = cancelJob(jobId);

  if (!ok) return res.json({ success: false, error: 'Не удалось отменить задачу' });

  return res.json({ success: true, message: 'Отмена запрошена' });
});

module.exports = router;
