const express = require('express');
const { parseReviewsFromUrl } = require('./main');
const fs = require('fs');

const {
  downloadFromS3,
  uploadScreenshot,
  readExcelLinks,
  writeExcelReviews,
  createJob,
  getJob,
  startJob,
  finishJob,
  canStartNewJob,
  processProduct,
  cancelJob,
} = require('./services');
const { logWithCapture, warnWithCapture, errorWithCapture } = require('./utils');

const app = express();
app.use(express.json({ limit: '10mb' }));

// === Основной обработчик фоновой задачи ===
async function runJob(jobId, { s3InputFileUrl, mode }) {
  const job = getJob(jobId);
  if (!job) return;

  // отменено до запуска
  if (job.cancelRequested || job.status === 'cancelled') {
    logWithCapture(`⏹ [${jobId}] Задача была отменена до запуска - пропускаем`);
    return;
  }

  let allResults = [];
  let s3OutputUrl = null;
  let errorMessage = null;

  try {
    // === 1) Скачивание Excel ===
    job.status = 'downloading';
    job.updatedAt = Date.now();

    const localInputPath = await downloadFromS3(s3InputFileUrl);

    // === 2) Чтение ссылок из Excel ===
    const urls = await readExcelLinks(localInputPath);

    job.totalUrls = urls.length;
    job.processedUrls = 0;
    job.status = 'parsing';
    job.updatedAt = Date.now();

    logWithCapture(`🔗 [${jobId}] Найдено ссылок: ${urls.length}`);

    // === 3) Обработка каждой ссылки ===
    for (const url of urls) {
      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.updatedAt = Date.now();
        break;
      }

      const result = await processProduct({ url, job, mode, parseReviewsFromUrl });
      allResults.push(result);

      if (result.errorOccurred && result.error !== 'cancelled') {
        errorMessage = result.error;
        break;
      }
    }
  } catch (err) {
    errorWithCapture(`❌ [${jobId}] Глобальная ошибка: ${err}`);
    if (!errorMessage) errorMessage = err.message;
  }

  // === 4) Формирование Excel ===
  try {
    s3OutputUrl = await writeExcelReviews(allResults);
  } catch (err) {
    errorWithCapture(`❌ [${jobId}] Excel ошибка: ${err.message}`);
    if (!errorMessage) errorMessage = err.message;
  }

  // === 5) Загрузка скриншотов ===
  const screenshots = ['/tmp/debug_hash.png', '/tmp/debug_reviews.png'];
  for (const file of screenshots) {
    try {
      if (fs.existsSync(file)) {
        await uploadScreenshot(file);
        logWithCapture(`[${jobId}] 📤 Скриншот загружен`);
      }
    } catch (err) {
      warnWithCapture(`[${jobId}] ⚠ Ошибка загрузки скриншота: ${err.message}`);
    }
  }

  // === 6) Завершение ===
  job.s3OutputUrl = s3OutputUrl || null;

  if (job.cancelRequested) {
    job.status = 'cancelled';
  } else if (errorMessage) {
    job.status = 'error';
    job.error = errorMessage;
  } else {
    job.status = 'completed';
  }

  job.updatedAt = Date.now();
  logWithCapture(`✔ [${jobId}] Завершено: ${job.status}`);
}

// ====================== API ======================

app.post('/parse', async (req, res) => {
  const { s3InputFileUrl, mode } = req.body;
  if (!s3InputFileUrl) return res.status(400).json({ success: false, error: 'Нет s3InputFileUrl' });

  // Создаём новую задачу (статус: queued)
  const job = createJob({ s3InputFileUrl, mode });
  logWithCapture(`🧩 Создана задача ${job.id}`);

  // Если нет активной — запускаем цепочку
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

app.get('/parse/:jobId/status', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Задача не найдена' });
  return res.json({ success: true, ...job });
});

app.post('/parse/:jobId/cancel', (req, res) => {
  const jobId = req.params.jobId;
  const ok = cancelJob(jobId);

  if (!ok) {
    return res.json({ success: false, error: 'Не удалось отменить задачу' });
  }

  return res.json({ success: true, message: 'Отмена запрошена' });
});

// СТАРТ СЕРВЕРА
app.listen(process.env.PORT || 8080, () => {
  logWithCapture(`🟢 Parser started`);
});
