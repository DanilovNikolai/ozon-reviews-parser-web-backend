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

    // Прочитать ссылки из Excel
    const urls = await readExcelLinks(localInputPath);
    const allResults = [];

    // Парсинг товаров
    for (const url of urls) {
      const result = await parseReviewsFromUrl(url, mode, (partial) => {
        console.log(`Промежуточное сохранение: ${partial.reviews.length} отзывов`);
      });
      allResults.push(result);

      // Загрузка скриншотов в s3
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

    // Сформировать Excel и сразу загрузить на S3
    const s3OutputUrl = await writeExcelReviews(allResults);

    // Сообщить в Next.js API, что готово
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

    res.json({ success: true, s3OutputUrl });
  } catch (err) {
    console.error('❌ Ошибка в процессе парсинга:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  console.log('🟢 Parser service running on port 8080');
});
