const { getLogBuffer, logWithCapture, errorWithCapture } = require('../utils');

// Обрабатывает один товар (одну ссылку) и возвращает объект результата

async function processProduct({ url, job, mode, parseFn }) {
  job.currentUrl = url;
  job.currentPage = 0;
  job.collectedReviews = 0;
  job.updatedAt = Date.now();

  logWithCapture(`▶ [Процесс ${job.id}] Парсинг товара: ${url}`);

  try {
    const result = await parseFn(
      url,
      mode,
      // Промежуточное сохранение (для режимов парсинга)
      (partial) => {
        job.collectedReviews += partial.reviews.length;
        job.updatedAt = Date.now();
        logWithCapture(
          `[Процесс ${job.id}] Промежуточное сохранение: ${partial.reviews.length} отзывов`
        );
      },
      job
    );

    // Обработка дублирования
    if (result.skipped === true) {
      return {
        ...result,
        error: null,
        errorOccurred: false,
        skipped: true,
      };
    }

    // Обычная успешная обработка
    return {
      ...result,
      error: null,
      errorOccurred: false,
      skipped: false,
    };
  } catch (err) {
    // Обработка отмены пользователем
    if (err.message === 'Парсинг отменён пользователем') {
      return {
        reviews: [],
        productName: url.match(/product\/([^/]+)/)?.[1] || 'Товар',
        url,
        skipped: false,
        errorOccurred: true,
        error: 'cancelled',
        logs: getLogBuffer(),
      };
    }

    // Обработка ошибки при парсинге
    errorWithCapture(`❌ [Процесс ${job.id}] Ошибка при парсинге товара ${url}: ${err.message}`);

    return {
      reviews: [],
      productName: url.match(/product\/([^/]+)/)?.[1] || 'Товар',
      url,
      skipped: false,
      errorOccurred: true,
      error: err.message,
      logs: getLogBuffer(),
    };
  } finally {
    job.processedUrls += 1;
    job.updatedAt = Date.now();
  }
}

module.exports = { processProduct };
