// app.js
const express = require('express');
const { parseReviewsFromUrl } = require('./main');
const { downloadFromS3, uploadScreenshot } = require('./services/s3');
const { readExcelLinks, writeExcelReviews } = require('./services/excel');
const fs = require('fs');
const { getLogBuffer, logWithCapture, warnWithCapture, errorWithCapture } = require('./utils');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ===== ХРАНИЛИЩЕ ЗАДАЧ =====
const jobs = {}; // jobId -> { ... }

function createJobId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Фоновое выполнение задачи
 */
async function runJob(jobId, { s3InputFileUrl, mode }) {
  const job = jobs[jobId];
  if (!job) return;

  let allResults = [];
  let s3OutputUrl = null;
  let errorMessage = null;

  try {
    job.status = 'downloading';
    job.updatedAt = Date.now();

    // 1) Скачать Excel
    const localInputPath = await downloadFromS3(s3InputFileUrl);

    // 2) Прочитать ссылки
    const urls = await readExcelLinks(localInputPath);
    job.totalUrls = urls.length;
    job.processedUrls = 0;
    job.status = 'parsing';
    job.updatedAt = Date.now();

    logWithCapture(`🔗 [Процесс ${jobId}] Найдено ссылок: ${urls.length}`);

    // 3) Парсинг каждой ссылки
    for (const url of urls) {
      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.updatedAt = Date.now();
        return;
      }

      job.currentUrl = url;
      job.currentPage = 0;
      job.collectedReviews = 0;
      job.updatedAt = Date.now();

      logWithCapture(`▶ [Процесс ${jobId}] Парсинг товара: ${url}`);

      try {
        const result = await parseReviewsFromUrl(
          url,
          mode,
          // Частичное сохранение → обновляем collectedReviews
          (partial) => {
            job.collectedReviews += partial.reviews.length;
            job.updatedAt = Date.now();

            logWithCapture(
              `[Процесс ${jobId}] Промежуточное сохранение: ${partial.reviews.length} отзывов`
            );
          },
          // Передаём job внутрь main.js, чтобы обновлять currentPage/totalReviewsCount
          job
        );

        allResults.push({
          ...result,
          error: null,
          errorOccurred: false,
        });
      } catch (err) {
        if (err.message === 'Парсинг отменён пользователем') {
          job.status = 'cancelled';
          job.error = null;
          job.updatedAt = Date.now();
          logWithCapture(`⛔ [Процесс ${jobId}] Остановлен пользователем`);
          return;
        }

        errorWithCapture(`❌ [Процесс ${jobId}] Ошибка при парсинге товара ${url}: ${err.message}`);

        allResults.push({
          url,
          productName: url.match(/product\/([^/]+)/)?.[1] || 'Товар',
          reviews: [],
          error: err.message,
          errorOccurred: true,
          logs: getLogBuffer(),
        });

        errorMessage = `Ошибка при парсинге товара ${url}: ${err.message}`;
        break;
      } finally {
        job.processedUrls += 1;
        job.updatedAt = Date.now();
      }
    }
  } catch (err) {
    errorWithCapture(`❌ [Процесс ${jobId}] Глобальная ошибка: ${err}`);
    if (!errorMessage) errorMessage = err.message;
  }

  // 4) Итоговый Excel
  try {
    s3OutputUrl = await writeExcelReviews(allResults);
  } catch (err) {
    errorWithCapture(`❌ Ошибка генерации Excel: ${err.message}`);
    if (!errorMessage) errorMessage = err.message;
  }

  // 5) Скриншоты
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

  // 6) Готово
  job.s3OutputUrl = s3OutputUrl || null;
  job.error = errorMessage || null;
  job.status = errorMessage ? 'error' : 'completed';
  job.updatedAt = Date.now();

  logWithCapture(`✔ [Процесс ${jobId}] Завершено: ${job.status}`);
}

// ====== API ======

app.post('/parse', async (req, res) => {
  const { s3InputFileUrl, mode } = req.body;
  if (!s3InputFileUrl) {
    return res.status(400).json({ success: false, error: 'Не передан s3InputFileUrl' });
  }

  const jobId = createJobId();
  const now = Date.now();

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
  };

  logWithCapture(`🧩 Создана задача ${jobId}`);

  (async () => {
    await runJob(jobId, { s3InputFileUrl, mode });
  })();

  return res.json({ success: true, jobId });
});

app.get('/parse/:jobId/status', (req, res) => {
  const job = jobs[req.params.jobId];

  if (!job) return res.status(404).json({ success: false, error: 'Задача не найдена' });

  return res.json({
    success: true,
    ...job,
  });
});

app.post('/parse/:jobId/cancel', (req, res) => {
  const job = jobs[req.params.jobId];

  if (!job) {
    return res.status(404).json({ success: false, error: 'Задача не найдена' });
  }

  job.cancelRequested = true;
  job.updatedAt = Date.now();

  return res.json({ success: true, message: 'Отмена запрошена' });
});

app.listen(process.env.PORT || 8080, () => {
  logWithCapture(`🟢 Parser started`);
});
