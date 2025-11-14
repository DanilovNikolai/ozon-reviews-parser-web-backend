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
    const localInputPath = await downloadFromS3(s3InputFileUrl);
    const urls = await readExcelLinks(localInputPath);
    const allResults = [];

    for (const url of urls) {
      const result = await parseReviewsFromUrl(url, mode);

      allResults.push(result);

      // Загрузка ВСЕХ скриншотов
      for (const screenshot of result.screenshots) {
        try {
          if (fs.existsSync(screenshot)) {
            await uploadScreenshot(screenshot);
            console.log(`📤 Загружен: ${screenshot}`);
          }
        } catch (err) {
          console.warn(`⚠ Ошибка загрузки ${screenshot}:`, err.message);
        }
      }
    }

    const s3OutputUrl = await writeExcelReviews(allResults);

    if (callbackUrl) {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: s3OutputUrl }),
      });
    }

    res.json({ success: true, s3OutputUrl });
  } catch (err) {
    console.error('❌ Ошибка:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8080, () => {
  console.log('🟢 Parser service running on port 8080');
});
