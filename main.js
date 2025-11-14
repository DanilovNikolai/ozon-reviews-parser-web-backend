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
const fs = require('fs');

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

  // список всех скриншотов
  const screenshots = [];

  try {
    // --- 1️⃣ Получаем хэш ---
    const hashUrl = getReviewsUrlWithSort(url, 'score_asc');
    await page.goto(hashUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });
    logWithCapture('🕒 Страница для хэша загружена');

    const screenshotHash = `/tmp/debug_hash.png`;
    await page.screenshot({ path: screenshotHash, fullPage: true });
    screenshots.push(screenshotHash);
    logWithCapture('📸 Скриншот сохранён: debug_hash.png');

    // Проверка антибота
    const currentUrl = page.url();
    if (currentUrl.includes('captcha') || currentUrl.includes('antibot')) {
      warnWithCapture(`🚨 AntiBot (hash stage): ${currentUrl}`);
    }

    // Ждём блок отзывов
    await page
      .waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 })
      .catch(() => warnWithCapture('⚠️ Блок отзывов не найден (hash stage)'));

    const htmlForHash = await page.evaluate(() => {
      const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
      return container.innerHTML;
    });

    const reviewsForHash = extractReviewsFromHtml(htmlForHash, mode);
    const hash = generateHashFromReviews(reviewsForHash);

    // Проверка дубликатов
    const existingIndex = seenHashes.findIndex((h) => h === hash);
    if (existingIndex !== -1) {
      return {
        isDuplicate: true,
        screenshots,
        logs: [...getLogBuffer()],
        productName: productNameMatch,
        totalCount: 0,
        reviews: [],
      };
    }

    seenHashes.push(hash);
    seenUrls.push(url);
    hashForThisProduct = hash;

    // --- 2️⃣ Основной парсинг ---
    const reviewsUrl = getReviewsUrl(url);
    await page.goto(reviewsUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });

    logWithCapture(`🕒 Страница отзывов загружена: ${page.url()}`);

    const screenshotMain = `/tmp/debug_reviews.png`;
    await page.screenshot({ path: screenshotMain, fullPage: true });
    screenshots.push(screenshotMain);

    // AntiBot
    if (page.url().includes('captcha') || page.url().includes('antibot')) {
      warnWithCapture(`🚨 Ozon AntiBot на странице отзывов`);
    }

    // Общее количество отзывов
    try {
      const title = await page.title();
      const match = title.match(/([\d\s]+)\s+отзыв/i);
      if (match) {
        totalReviewsCount = parseInt(match[1].replace(/[^\d]/g, ''), 10);
      }
    } catch {}

    // --- 3️⃣ Цикл страниц ---
    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      // 📌 Делаем скриншот КАЖДОЙ страницы
      const screenshotPerPage = `/tmp/page_${pageIndex}.png`;
      try {
        await page.screenshot({ path: screenshotPerPage, fullPage: true });
        screenshots.push(screenshotPerPage);
      } catch (err) {
        warnWithCapture(`⚠️ Ошибка скриншота page_${pageIndex}.png: ${err.message}`);
      }

      await autoScroll(page);
      await sleep(500);
      await expandAllSpoilers(page);
      await sleep(300);

      const html = await page.evaluate(() => {
        const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
        return container.innerHTML;
      });
      const reviews = extractReviewsFromHtml(html, mode);
      reviews.forEach((r) => (r.hash = hashForThisProduct));

      allReviews.push(...reviews);
      collectedForSave.push(...reviews);

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

      await sleep(1500 + Math.random() * 1000);
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
      reviews: allReviews,
      screenshots,
      logs: [...getLogBuffer()],
      errorOccurred: false,
    };
  } catch (err) {
    errorWithCapture('❌ Ошибка парсинга:', err.message);
    return {
      productName: productNameMatch,
      totalCount: 0,
      reviews: [],
      screenshots,
      logs: [...getLogBuffer()],
      errorOccurred: true,
    };
  } finally {
    await browser.close();
    logWithCapture('🛑 Браузер закрыт');
  }
}

module.exports = { parseReviewsFromUrl, CONFIG };
