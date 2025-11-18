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
    // 1) Скачать Excel с S3
    const localInputPath = await downloadFromS3(s3InputFileUrl);

    // 2) Прочитать список ссылок
    const urls = await readExcelLinks(localInputPath);
    const allResults = [];

    // 3) Парсинг каждой ссылки
    for (const url of urls) {
      console.log(`▶ Парсинг товара: ${url}`);

      try {
        const result = await parseReviewsFromUrl(url, mode, (partial) => {
          console.log(`Промежуточное сохранение: ${partial.reviews.length} отзывов`);
        });

        // Если парсер сам сообщил об ошибке через errorOccurred
        if (result.errorOccurred) {
          const logs = result.logs || [];
          const errLine =
            logs.find((l) => l.includes('❌')) ||
            logs.find((l) => l.toLowerCase().includes('ошибка')) ||
            'Произошла ошибка при парсинге';

          const shortError = errLine.replace(/❌/g, '').trim();

          return res.status(500).json({
            success: false,
            error: shortError,
          });
        }

        allResults.push(result);
      } catch (err) {
        // Ошибка, выброшенная внутри parseReviewsFromUrl
        console.error(`❌ Ошибка при парсинге товара ${url}:`, err.message);

        return res.status(500).json({
          success: false,
          error: `Ошибка при парсинге ${url}: ${err.message}`,
        });
      }

      // 4) Загрузка возможных скриншотов только если НЕ было ошибок
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

    // 5) Генерация итогового Excel
    const s3OutputUrl = await writeExcelReviews(allResults);

    // 6) Callback (если есть)
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

    // 7) Всё успешно
    return res.json({
      success: true,
      error: null,
      s3OutputUrl,
    });
  } catch (err) {
    // Ошибки уровня всего парсинга
    console.error('❌ Глобальная ошибка парсинга:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  console.log('🟢 Parser service running on port 8080');
});
