// app.js
const express = require('express');
const { parseReviewsFromUrl } = require('./main');
const { downloadFromS3, uploadScreenshot } = require('./services/s3');
const { readExcelLinks, writeExcelReviews } = require('./services/excel');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/parse', async (req, res) => {
  const { s3InputFileUrl, mode, callbackUrl } = req.body;
  console.log('🚀 Начало парсинга:', s3InputFileUrl);

  let allResults = [];
  let s3OutputUrl = null;
  let errorMessage = null;

  try {
    // 1) Скачать Excel с S3
    const localInputPath = await downloadFromS3(s3InputFileUrl);

    // 2) Прочитать список ссылок
    const urls = await readExcelLinks(localInputPath);
    console.log(`🔗 Найдено ссылок: ${urls.length}`);

    // 3) Парсинг каждой ссылки
    for (const url of urls) {
      if (errorMessage) break; // если уже была ошибка — не идём дальше

      console.log(`▶ Парсинг товара: ${url}`);

      try {
        const result = await parseReviewsFromUrl(url, mode, (partial) => {
          console.log(`Промежуточное сохранение: ${partial.reviews.length} отзывов`);
        });

        allResults.push(result);
      } catch (err) {
        // Ошибка, выброшенная внутри parseReviewsFromUrl
        console.error(`❌ Ошибка при парсинге товара ${url}:`, err.message);
        errorMessage = `Ошибка при парсинге товара ${url}: ${err.message}`;
        // прерываем цикл по товарам, но не весь обработчик
        break;
      }
    }
  } catch (err) {
    console.error('❌ Глобальная ошибка в процессе парсинга:', err);
    if (!errorMessage) {
      errorMessage = err.message || 'Глобальная ошибка в процессе парсинга';
    }
  }

  // 4) Генерация итогового Excel — ПЫТАЕМСЯ СДЕЛАТЬ ВСЕГДА
  try {
    s3OutputUrl = await writeExcelReviews(allResults);
  } catch (err) {
    console.error('❌ Ошибка при генерации итогового Excel:', err.message);
    if (!errorMessage) {
      errorMessage = `Ошибка генерации Excel: ${err.message}`;
    }
  }

  // 5) Загрузка скриншотов (первая и последняя спарсенная страница)
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

  // 6) Callback на фронт (если есть) — НЕ критичен
  if (callbackUrl && s3OutputUrl) {
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: s3OutputUrl }),
      });
    } catch (err) {
      console.warn('⚠ Ошибка callback запроса:', err.message);
    }
  }

  // 7) Отдаём ответ ВСЕГДА со статусом 200
  return res.json({
    success: !errorMessage,
    error: errorMessage,
    s3OutputUrl,
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  console.log('🟢 Parser service running on port 8080');
});
