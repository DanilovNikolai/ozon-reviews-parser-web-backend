const express = require('express');
const { parseReviewsFromUrl } = require('./main');
const { downloadFromS3, uploadToS3 } = require('./services/s3');
const { readExcelLinks, writeExcelReviews } = require('./services/excel');

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

    // Парсинг
    for (const url of urls) {
      const result = await parseReviewsFromUrl(url, mode, (partial) => {
        console.log(`Промежуточное сохранение: ${partial.reviews.length} отзывов`);
      });
      allResults.push(result);
    }

    // Сохранить результаты в новый Excel
    const outputPath = await writeExcelReviews(allResults);

    // Загрузить в S3
    const s3OutputUrl = await uploadToS3(outputPath, 'downloaded_files');

    // Сообщить в Next.js API, что готово
    if (callbackUrl) {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: s3OutputUrl }),
      });
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
