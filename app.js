// app.js
const express = require('express');
const { parseReviewsFromUrl } = require('./main');
const { downloadFromS3, uploadScreenshot } = require('./services/s3');
const { readExcelLinks, writeExcelReviews } = require('./services/excel');
const fs = require('fs');
const { getLogBuffer, clearLogBuffer } = require('./utils');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ГЛОБАЛЬНЫЙ ФЛАГ РАБОТЫ ПАРСЕРА
let isProcessing = false;

app.post('/parse', async (req, res) => {
  const { s3InputFileUrl, mode, callbackUrl } = req.body;

  console.log('🚀 Запрос на запуск парсинга:', s3InputFileUrl);

  // Параллельный процесс запрещен
  if (isProcessing) {
    console.log('❌ Второй запуск заблокирован (процесс уже идёт)');

    return res.json({
      success: true,
      alreadyRunning: true,
      s3OutputUrl: null,
      error: null,
    });
  }

  // Активируем блокировку
  isProcessing = true;

  let allResults = [];
  let s3OutputUrl = null;
  let errorMessage = null;

  try {
    console.log('🚀 Начало основного процесса парсинга:', s3InputFileUrl);

    const localInputPath = await downloadFromS3(s3InputFileUrl);
    const urls = await readExcelLinks(localInputPath);
    console.log(`🔗 Найдено ссылок: ${urls.length}`);

    // Парсинг товаров
    for (const url of urls) {
      if (errorMessage) break;

      console.log(`▶ Парсинг товара: ${url}`);

      try {
        const result = await parseReviewsFromUrl(url, mode, (partial) => {
          console.log(`Промежуточное сохранение: ${partial.reviews.length} отзывов`);
        });

        allResults.push({
          ...result,
          error: null,
          errorOccurred: false,
        });
      } catch (err) {
        console.error(`❌ Ошибка парсинга товара ${url}:`, err.message);

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
      }
    }
  } catch (err) {
    console.error('❌ Глобальная ошибка:', err);
    if (!errorMessage) errorMessage = err.message;
  }

  // Формируем Excel
  try {
    s3OutputUrl = await writeExcelReviews(allResults);
  } catch (err) {
    console.error('❌ Ошибка генерации Excel:', err.message);
    if (!errorMessage) {
      errorMessage = `Ошибка Excel: ${err.message}`;
    }
  }

  // Загружаем скриншоты
  const screenshots = ['/tmp/debug_hash.png', '/tmp/debug_reviews.png'];

  for (const file of screenshots) {
    try {
      if (fs.existsSync(file)) {
        await uploadScreenshot(file);
        console.log(`📤 Скриншот загружен в S3: ${file}`);
      }
    } catch (err) {
      console.warn(`⚠ Ошибка загрузки скриншота ${file}:`, err.message);
    }
  }

  // Callback
  if (callbackUrl && s3OutputUrl) {
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: s3OutputUrl }),
      });
    } catch (err) {
      console.warn('⚠ Callback error:', err.message);
    }
  }

  // Снимаем блокировку
  isProcessing = false;

  return res.json({
    success: !errorMessage,
    error: errorMessage,
    s3OutputUrl,
    alreadyRunning: false,
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  console.log('🟢 Parser service running on port 8080');
});
