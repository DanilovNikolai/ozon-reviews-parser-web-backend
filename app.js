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
const jobs = {}; // jobId -> { status, error, s3OutputUrl, progress, ... }

function createJobId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Фоновое выполнение задачи парсинга
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

    logWithCapture(`🔗 [Процесс #${jobId}] Найдено ссылок: ${urls.length}`);

    // 3) Парсинг каждой ссылки
    for (const url of urls) {
      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.updatedAt = Date.now();
        return;
      }

      logWithCapture(`▶ [Процесс #${jobId}] Парсинг товара: ${url}`);

      try {
        const result = await parseReviewsFromUrl(url, mode, (partial) => {
          logWithCapture(
            `[Процесс #${jobId}] Промежуточное сохранение: ${partial.reviews.length} отзывов`
          );
        });

        allResults.push({
          ...result,
          error: null,
          errorOccurred: false,
        });
      } catch (err) {
        errorWithCapture(
          `❌ [Процесс #${jobId}] Ошибка при парсинге товара ${url}: ${err.message}`
        );

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
    errorWithCapture(`❌ [Процесс #${jobId}] Глобальная ошибка: ${err}`);
    if (!errorMessage) {
      errorMessage = err.message || 'Глобальная ошибка в процессе# парсинга';
    }
  }

  // 4) Генерация итогового Excel (пытаемся ВСЕГДА)
  try {
    s3OutputUrl = await writeExcelReviews(allResults);
  } catch (err) {
    errorWithCapture(`❌ [Процесс #${jobId}] Ошибка при генерации итогового Excel: ${err.message}`);
    if (!errorMessage) {
      errorMessage = `Ошибка генерации Excel: ${err.message}`;
    }
  }

  // 5) Загрузка скриншотов
  const screenshots = ['/tmp/debug_hash.png', '/tmp/debug_reviews.png'];

  for (const file of screenshots) {
    try {
      if (fs.existsSync(file)) {
        await uploadScreenshot(file);
        logWithCapture(`[Процесс #${jobId}] 📤 Скриншот загружен в S3: ${file}`);
      }
    } catch (err) {
      warnWithCapture(`[Процесс #${jobId}] ⚠ Ошибка загрузки скриншота ${file}: ${err.message}`);
    }
  }

  // 6) Обновляем job
  job.s3OutputUrl = s3OutputUrl || null;
  job.error = errorMessage || null;
  job.status = errorMessage ? 'error' : 'completed';
  job.updatedAt = Date.now();

  logWithCapture(`[Процесс #${jobId}] Завершено со статусом: ${job.status}, error = ${job.error}`);
}

// ========== API ==========

/**
 * Старт задачи парсинга.
 * Возвращает ТОЛЬКО jobId, сам парсинг идёт фоном.
 */
app.post('/parse', async (req, res) => {
  const { s3InputFileUrl, mode } = req.body;

  if (!s3InputFileUrl) {
    return res.status(400).json({
      success: false,
      error: 'Не передан s3InputFileUrl',
    });
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
    cancelRequested: false,
  };

  logWithCapture(`🧩 Создана задача jobId=${jobId} для файла ${s3InputFileUrl}`);

  // Запускаем фоном
  (async () => {
    try {
      await runJob(jobId, { s3InputFileUrl, mode });
    } catch (error) {
      errorWithCapture(`❌ [Процесс #${jobId}] Необработанная ошибка: ${error}`);
      const job = jobs[jobId];
      if (job) {
        job.status = 'error';
        job.error = e.message || 'Неизвестная ошибка в задаче';
        job.updatedAt = Date.now();
      }
    }
  })();

  return res.json({
    success: true,
    jobId,
  });
});

/**
 * Получение статуса задачи
 */
app.get('/parse/:jobId/status', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Задача не найдена',
    });
  }

  return res.json({
    success: true,
    jobId,
    status: job.status,
    error: job.error,
    s3OutputUrl: job.s3OutputUrl,
    totalUrls: job.totalUrls,
    processedUrls: job.processedUrls,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

/**
 * (Опционально) Отмена задачи
 */
app.post('/parse/:jobId/cancel', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Задача не найдена',
    });
  }

  job.cancelRequested = true;
  job.updatedAt = Date.now();

  return res.json({
    success: true,
    message: 'Отмена запрошена',
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  logWithCapture('🟢 Parser service running on port 8080');
});
