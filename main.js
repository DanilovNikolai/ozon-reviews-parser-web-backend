const { CONFIG } = require('./config');
const { extractReviewsFromHtml } = require('./extractors/extractReviewsFromHtml');
const {
  autoScroll,
  sleep,
  expandAllSpoilers,
  getReviewsUrl,
  getReviewsUrlWithSort,
  logWithCapture,
  warnWithCapture,
  errorWithCapture,
  getLogBuffer,
  generateHashFromReviews,
} = require('./utils');

const { goToNextPageByClick, launchBrowserWithCookies } = require('./helpers');

/**
 * Основная функция парсинга
 * @param {string} url - ссылка на товар
 * @param {string} mode - режим парсинга: 1, 2, 3
 * @param {function} onPartialSave - колбэк для обработки промежуточных данных
 * @param {array} seenHashes - массив уже обработанных хэшей
 * @param {array} seenUrls - массив уже обработанных URL
 */
async function parseReviewsFromUrl(
  url,
  mode = '3',
  onPartialSave = () => {},
  seenHashes = [],
  seenUrls = []
) {
  const { browser, page } = await launchBrowserWithCookies();
  const productNameMatch = url.match(/product\/([^/]+)/)?.[1] || 'Товар';

  let hashForThisProduct = '';
  const allReviews = [];
  const collectedForSave = [];
  let totalReviewsCount = 0;

  try {
    // --- 1️⃣ Получение хэша для проверки дубликатов ---
    const hashUrl = getReviewsUrlWithSort(url, 'score_asc');

    await page.goto(hashUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.nextPageTimeout });
    await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 15000 }).catch(() =>
      logWithCapture('⚠️ Контейнер отзывов не найден при получении хэша')
    );
    await page.waitForTimeout(2000);

    logWithCapture('🕒 Страница для хэша загружена');

    const htmlForHash = await page.evaluate(() => {
      const container = document.querySelector('[data-widget="webListReviews"]');
      return container ? container.innerHTML : '';
    });

    const reviewsForHash = extractReviewsFromHtml(htmlForHash, mode);
    const hash = generateHashFromReviews(reviewsForHash);

    const existingIndex = seenHashes.findIndex((h) => h === hash);
    if (existingIndex !== -1) {
      const urlMatch = seenUrls[existingIndex];
      warnWithCapture(`🔁 Найден дубликат товара. Совпадает с: ${urlMatch}`);
      return {
        productName: productNameMatch,
        totalCount: 0,
        reviews: [
          {
            url,
            product: 'ДУБЛИКАТ ТОВАРА',
            comment: '',
            rating: '',
            date: '',
            user: '',
            ordinal: '',
            hash,
            urlMatch,
          },
        ],
        logs: [...getLogBuffer()],
        errorOccurred: false,
        isDuplicate: true,
      };
    }

    seenHashes.push(hash);
    seenUrls.push(url);
    hashForThisProduct = hash;

    // --- 2️⃣ Основной парсинг ---
    const reviewsUrl = getReviewsUrl(url);
    await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.nextPageTimeout });

    await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 }).catch(() =>
      logWithCapture('⚠️ Контейнер отзывов не найден при основном парсинге')
    );
    await page.waitForTimeout(3000);

    logWithCapture('🕒 Страница для парсинга загружена');

    try {
      const titleText = await page.title();
      const titleMatch = titleText.match(/([\d \s]+)\s+отзыв/i);
      if (titleMatch) {
        totalReviewsCount = parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
        logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);
      }
    } catch {}

    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      await autoScroll(page);
      await sleep(800);
      await expandAllSpoilers(page);
      await sleep(500);

      if (pageIndex > CONFIG.maxPagesPerSKU) {
        warnWithCapture(`⛔ Достигнут лимит страниц (${CONFIG.maxPagesPerSKU})`);
        break;
      }

      // --- гарантированное ожидание DOM ---
      await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 10000 }).catch(() =>
        logWithCapture('⚠️ Контейнер не найден при парсинге страницы')
      );

      const html = await page.evaluate(() => {
        const container = document.querySelector('[data-widget="webListReviews"]');
        return container ? container.innerHTML : '';
      });

      const reviews = extractReviewsFromHtml(html, mode);
      for (const review of reviews) review.hash = hashForThisProduct;

      if (mode === '3' && reviews.length === 0) {
        logWithCapture('⚠️ Отзывов не найдено, прерываю цикл');
        break;
      }

      allReviews.push(...reviews);
      collectedForSave.push(...reviews);

      logWithCapture(`📦 Всего собрано: ${allReviews.length}`);

      if (collectedForSave.length >= CONFIG.saveInterval) {
        onPartialSave({
          productName: productNameMatch,
          totalCount: totalReviewsCount,
          reviews: [...collectedForSave],
        });
        collectedForSave.length = 0;
      }

      hasNextPage = await goToNextPageByClick(page);
      pageIndex++;
    }

    if (collectedForSave.length > 0) {
      onPartialSave({
        productName: productNameMatch,
        totalCount: totalReviewsCount,
        reviews: [...collectedForSave],
      });
    }

    return {
      productName: productNameMatch,
      totalCount: totalReviewsCount,
      reviews: allReviews.map((r, i) => ({
        ...r,
        url,
        ordinal: `${i + 1}/${totalReviewsCount || allReviews.length}`,
      })),
      logs: [...getLogBuffer()],
      errorOccurred: false,
    };
  } catch (err) {
    errorWithCapture('❌ Ошибка при парсинге:', err.message);
    return {
      productName: productNameMatch,
      totalCount: 0,
      reviews: [],
      logs: [...getLogBuffer()],
      errorOccurred: true,
    };
  } finally {
    await browser.close();
    logWithCapture('🛑 Браузер закрыт');
  }
}

module.exports = { parseReviewsFromUrl, CONFIG };
