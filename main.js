// main.js — улучшенная стабильная версия
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
    // --- 1️⃣ Получаем хэш для проверки дубликатов ---
    const hashUrl = getReviewsUrlWithSort(url, 'score_asc');
    try {
      await page.goto(hashUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.nextPageTimeout,
      });
      await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 });
      await sleep(2000 + Math.random() * 1500);
      logWithCapture('🕒 Страница для хэша загружена');
    } catch (err) {
      warnWithCapture(`⚠️ Не удалось полностью загрузить страницу для хэша: ${err.message}`);
    }

    await page.screenshot({ path: '/tmp/debug_hash.png', fullPage: true });
    logWithCapture('📸 Скриншот сохранён: /tmp/debug_hash.png');

    // Проверяем антибот
    const currentUrl = page.url();
    if (currentUrl.includes('captcha') || currentUrl.includes('antibot')) {
      warnWithCapture(`🚨 Ozon вернул антибот страницу: ${currentUrl}`);
    }

    // Извлекаем HTML для хэша
    const htmlForHash = await page.evaluate(() => {
      const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
      return container.innerHTML;
    });

    const reviewsForHash = extractReviewsFromHtml(htmlForHash, mode);
    const hash = generateHashFromReviews(reviewsForHash);

    // Проверяем дубликаты
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
    logWithCapture(`🌐 Переход на страницу: ${reviewsUrl}`);

    try {
      await page.goto(reviewsUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.nextPageTimeout,
      });
      await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 });
      await sleep(3000 + Math.random() * 2000);
      logWithCapture(`✅ Страница загружена: ${page.url()}`);
    } catch (err) {
      warnWithCapture(`⚠️ Ошибка загрузки страницы отзывов: ${err.message}`);
    }

    // Проверяем на антибот
    const finalUrl = page.url();
    if (finalUrl.includes('captcha') || finalUrl.includes('antibot')) {
      warnWithCapture(`🚨 Ozon вернул антибот страницу при парсинге: ${finalUrl}`);
    }

    // Делаем скриншот для отладки
    await page.screenshot({ path: '/tmp/debug_reviews.png', fullPage: true });
    logWithCapture('📸 Скриншот сохранён: /tmp/debug_reviews.png');

    // Извлекаем общее количество отзывов
    try {
      const titleText = await page.title();
      const titleMatch = titleText.match(/([\d\s]+)\s+отзыв/i);
      if (titleMatch) {
        totalReviewsCount = parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
        logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);
      }
    } catch {
      warnWithCapture('⚠️ Не удалось определить количество отзывов по заголовку');
    }

    // --- 3️⃣ Цикл по страницам отзывов ---
    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      try {
        await autoScroll(page);
        await sleep(800 + Math.random() * 500);
        await expandAllSpoilers(page);
        await sleep(300 + Math.random() * 300);
      } catch (err) {
        warnWithCapture(`⚠️ Ошибка при скролле/спойлерах: ${err.message}`);
      }

      if (pageIndex > CONFIG.maxPagesPerSKU) {
        warnWithCapture(`⛔ Достигнут лимит страниц (${CONFIG.maxPagesPerSKU})`);
        break;
      }

      const html = await page.evaluate(() => {
        const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
        return container.innerHTML;
      });

      const reviews = extractReviewsFromHtml(html, mode);
      for (const review of reviews) review.hash = hashForThisProduct;

      if (reviews.length === 0) {
        warnWithCapture('⚠️ 0 отзывов на странице — возможно, контент не прогрузился');
        await sleep(3000);
        const retryHtml = await page.evaluate(() => document.body.innerHTML);
        const retryReviews = extractReviewsFromHtml(retryHtml, mode);
        if (retryReviews.length === 0) break;
        allReviews.push(...retryReviews);
      } else {
        allReviews.push(...reviews);
      }

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

      try {
        hasNextPage = await goToNextPageByClick(page);
      } catch (err) {
        warnWithCapture(`⚠️ Ошибка перехода на следующую страницу: ${err.message}`);
        hasNextPage = false;
      }

      pageIndex++;
      await sleep(2000 + Math.random() * 1500);
    }

    // --- Финальное сохранение ---
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
