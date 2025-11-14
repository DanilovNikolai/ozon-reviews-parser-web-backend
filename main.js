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

function isFatalPageError(err) {
  const msg = String(err && err.message ? err.message : err || '').toLowerCase();
  return msg.includes('target closed') || msg.includes('detached frame');
}

async function safeScreenshot(page, path) {
  try {
    if (!page.isClosed()) {
      await page.screenshot({ path, fullPage: true });
      logWithCapture(`📸 Скриншот сохранён: ${path}`);
    }
  } catch (err) {
    warnWithCapture(`⚠ Ошибка скриншота (${path}): ${err.message}`);
  }
}

/**
 * Основная функция парсинга
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
  let fatalError = false;

  try {
    // --- 1️⃣ Получаем хэш для проверки дубликатов ---
    const hashUrl = getReviewsUrlWithSort(url, 'score_asc');
    await page.goto(hashUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });
    logWithCapture('🕒 Страница для хэша загружена');

    // антибот на этапе хэша
    const currentUrl = page.url();
    if (currentUrl.includes('captcha') || currentUrl.includes('antibot')) {
      warnWithCapture(`🚨 Ozon вернул антибот страницу (hash): ${currentUrl}`);
    }

    // Скриншот этапа хэша
    await safeScreenshot(page, '/tmp/debug_hash.png');

    // ждём блок отзывов, но не падаем, если его нет
    await page
      .waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 })
      .catch(() => warnWithCapture('⚠️ Блок отзывов не найден (hash stage)'));

    const htmlForHash = await page.evaluate(() => {
      const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
      return container.innerHTML;
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
        reviews: [],
        logs: [...getLogBuffer()],
        errorOccurred: false,
        isDuplicate: true,
      };
    }

    seenHashes.push(hash);
    seenUrls.push(url);
    hashForThisProduct = hash;

    // --- 2️⃣ Основной парсинг ---
    const html = await page.content();
    console.log('📏 Длина HTML:', html.length);
    if (html.length < 100000) {
      console.log('⚠️ Похоже, страница урезанная (антибот защита Ozon).');
    }
    if (html.includes('/captcha')) {
      console.log('🚫 Ozon показывает капчу!');
    }

    const reviewsUrl = getReviewsUrl(url);
    console.log(`🌐 Переход на страницу: ${url}`);

    await page.goto(reviewsUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });
    logWithCapture(`✅ Страница загружена: ${page.url()}`);

    const finalUrl = page.url();
    if (finalUrl.includes('captcha') || finalUrl.includes('antibot')) {
      warnWithCapture(`🚨 Ozon вернул антибот страницу при парсинге: ${finalUrl}`);
    }

    // Скриншот первой страницы отзывов
    await safeScreenshot(page, '/tmp/debug_reviews.png');

    await page
      .waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 })
      .catch(() => warnWithCapture('⚠️ Блок отзывов не найден (parse stage)'));

    await new Promise((res) => setTimeout(res, 3000 + Math.random() * 2000));

    try {
      const titleText = await page.title();
      const titleMatch = titleText.match(/([\d \s]+)\s+отзыв/i);
      if (titleMatch) {
        totalReviewsCount = parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
        logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);
      }
    } catch {}

    // --- 3️⃣ Цикл по страницам отзывов ---
    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      try {
        await autoScroll(page);
        await new Promise((res) => setTimeout(res, 500));
        await expandAllSpoilers(page);
        await new Promise((res) => setTimeout(res, 300));

        if (pageIndex > CONFIG.maxPagesPerSKU) {
          warnWithCapture(
            `⛔ Достигнут лимит страниц (${CONFIG.maxPagesPerSKU}) в рамках одной сессии`
          );
          break;
        }

        const html = await page.evaluate(() => {
          const container =
            document.querySelector('[data-widget="webListReviews"]') || document.body;
          return container.innerHTML;
        });
        const reviews = extractReviewsFromHtml(html, mode);

        for (const review of reviews) review.hash = hashForThisProduct;

        if (mode === '3' && reviews.length === 0) {
          warnWithCapture('⚠️ 0 отзывов на странице в режиме 3 — останавливаемся');
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

        await new Promise((res) => setTimeout(res, 2000 + Math.random() * 1000));
      } catch (err) {
        warnWithCapture(`⚠ Ошибка при обработке страницы #${pageIndex}: ${err.message}`);

        if (isFatalPageError(err)) {
          fatalError = true;
          warnWithCapture('⛔ Критическая ошибка страницы (detached frame / target closed)');
          // пробуем сделать финальный скриншот ошибки
          await safeScreenshot(page, '/tmp/page_error.png');
          break;
        } else {
          // нефатальная ошибка — просто выходим из цикла
          break;
        }
      }
    }

    // Скриншот последней успешной страницы (если не было фатальной ошибки)
    if (!fatalError && !page.isClosed()) {
      await safeScreenshot(page, '/tmp/page_last.png');
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
      errorOccurred: fatalError,
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
