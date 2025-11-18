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

  try {
    // Скачать Excel с ссылками
    const localInputPath = await downloadFromS3(s3InputFileUrl);

    // Прочитать ссылки
    const urls = await readExcelLinks(localInputPath);
    const allResults = [];

    // Парсинг каждого товара
    for (const url of urls) {
      const result = await parseReviewsFromUrl(url, mode, (partial) => {
        console.log(`Промежуточное сохранение: ${partial.reviews.length} отзывов`);
      });

      allResults.push(result);

      // Загрузка скриншотов в S3
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
    }

    // Генерация итогового Excel с отзывами
    const s3OutputUrl = await writeExcelReviews(allResults);

    // Callback на фронт (если есть)
    if (callbackUrl) {
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

    // Проверка на ошибки
    const errorItem = allResults.find((r) => r.errorOccurred);

    // Формируем короткое сообщение об ошибке (вместо огромного массива логов)
    let shortError = null;

    if (errorItem) {
      const logs = errorItem.logs || [];
      const errLine =
        logs.find((l) => l.includes('❌')) ||
        logs.find((l) => l.toLowerCase().includes('ошибка')) ||
        'Произошла ошибка при парсинге';

      shortError = errLine.replace(/❌/g, '').trim();
    }

    return res.json({
      success: !errorItem,
      error: shortError,
      s3OutputUrl,
    });
  } catch (err) {
    console.error('❌ Ошибка в процессе парсинга:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  console.log('🟢 Parser service running on port 8080');
});
