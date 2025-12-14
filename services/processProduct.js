const { getLogBuffer, logWithCapture, errorWithCapture } = require('../utils');

// Обрабатывает один товар (одну ссылку) и возвращает объект результата

async function processProduct({ url, job, mode, parseReviewsFromUrl }) {
  job.currentUrl = url;
  job.currentPage = 0;
  job.collectedReviews = null;
  job.totalReviewsCount = null;
  job.updatedAt = Date.now();

  logWithCapture(`▶ [${job.id}] Парсинг товара: ${url}`);

  try {
    const result = await parseReviewsFromUrl(
      url,
      mode,
      (partial) => {
        job.collectedReviews += partial.reviews.length;
        job.updatedAt = Date.now();
        logWithCapture(`[${job.id}] Промежуточное сохранение: ${partial.reviews.length} отзывов`);
      },
      job
    );

    if (Array.isArray(result.reviews)) {
      job.collectedReviewsTotal += result.reviews.length;
    }

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
    errorWithCapture(`❌ [${job.id}] Ошибка при парсинге товара ${url}: ${err.message}`);

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
