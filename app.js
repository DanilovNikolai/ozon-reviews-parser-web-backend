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
  updateQueuePositions,
} = require('./services');
const { logWithCapture, warnWithCapture, errorWithCapture } = require('./utils');

const app = express();
app.use(express.json({ limit: '10mb' }));

// === Основной обработчик фоновой задачи ===
async function runJob(jobId, { s3InputFileUrl, mode }) {
  const job = getJob(jobId);
  if (!job) return;

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

    logWithCapture(`🔗 [Процесс ${jobId}] Найдено ссылок: ${urls.length}`);

    // === 3) Обработка каждой ссылки ===
    for (const url of urls) {
      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.updatedAt = Date.now();
        return;
      }

      const result = await processProduct({ url, job, mode, parseReviewsFromUrl });

      allResults.push(result);

      if (result.errorOccurred && result.error !== 'cancelled') {
        errorMessage = result.error;
        break;
      }
    }
  } catch (err) {
    errorWithCapture(`❌ [Процесс ${jobId}] Глобальная ошибка: ${err}`);
    if (!errorMessage) errorMessage = err.message;
  }

  // === 4) Формирование Excel ===
  try {
    s3OutputUrl = await writeExcelReviews(allResults);
  } catch (err) {
    errorWithCapture(`❌ Ошибка генерации Excel: ${err.message}`);
    if (!errorMessage) errorMessage = err.message;
  }

  // === 5) Загрузка скриншотов ===
  const screenshots = ['/tmp/debug_hash.png', '/tmp/debug_reviews.png'];

  for (const file of screenshots) {
    try {
      if (fs.existsSync(file)) {
        await uploadScreenshot(file);
        logWithCapture(`[Процесс ${jobId}] 📤 Скриншот загружен: ${file}`);
      }
    } catch (err) {
      warnWithCapture(`[Процесс ${jobId}] ⚠ Ошибка загрузки скриншота: ${err.message}`);
    }
  }

  // === 6) Завершение ===
  job.s3OutputUrl = s3OutputUrl || null;
  job.error = errorMessage || null;
  job.status = errorMessage ? 'error' : 'completed';
  job.updatedAt = Date.now();

  logWithCapture(`✔ [Процесс ${jobId}] Завершено: ${job.status}`);
}

// ====================== API ======================

app.post('/parse', async (req, res) => {
  const { s3InputFileUrl, mode } = req.body;

  if (!s3InputFileUrl) return res.status(400).json({ success: false, error: 'Нет s3InputFileUrl' });

  // Создаём новую задачу (статус: queued)
  const job = createJob({ s3InputFileUrl, mode });
  logWithCapture(`🧩 Создана задача ${job.id}`);

  // Если нет активного — запускаем сразу
  if (canStartNewJob()) {
    startJob(job.id);

    (async () => {
      await runJob(job.id, { s3InputFileUrl, mode });
      await finishJob(job.id, (nextId) =>
        runJob(nextId, {
          s3InputFileUrl: getJob(nextId).s3InputFileUrl,
          mode: getJob(nextId).mode,
        })
      );
    })();
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
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Задача не найдена' });
  }

  // === ЕСЛИ ЗАДАЧА ЕЩЁ В ОЧЕРЕДИ — отменяем мгновенно ===
  if (job.status === 'queued') {
    jobQueue = jobQueue.filter((id) => id !== jobId);
    job.status = 'cancelled';
    job.updatedAt = Date.now();

    updateQueuePositions();

    return res.json({
      success: true,
      message: 'Задача отменена (она была в очереди и не запускалась)',
    });
  }

  // === ЕСЛИ ЗАДАЧА УЖЕ РАБОТАЕТ - ставим флаг отмены ===
  job.cancelRequested = true;
  job.updatedAt = Date.now();

  return res.json({
    success: true,
    message: 'Отмена запрошена — задача будет остановлена',
  });
});

// СТАРТ СЕРВЕРА
app.listen(process.env.PORT || 8080, () => {
  logWithCapture(`🟢 Parser started`);
});
