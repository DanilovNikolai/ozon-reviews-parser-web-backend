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

const { humanMouse } = require('./utils/humanMouse');
const { humanScroll } = require('./utils/humanScroll');
const { humanKeyboard } = require('./utils/humanKeyboard');

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
    await page.goto(hashUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });
    logWithCapture('🕒 Страница для хэша загружена');

    // поведение человека
    await humanMouse(page);
    await humanKeyboard(page);

    // Проверяем, не попали ли на антибот
    const currentUrl = page.url();
    if (currentUrl.includes('captcha') || currentUrl.includes('antibot')) {
      warnWithCapture(`🚨 Ozon вернул антибот страницу: ${currentUrl}`);
    }

    // Ожидаем появления блока отзывов
    await page
      .waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 })
      .catch(() => warnWithCapture('⚠️ Блок отзывов не найден (timeout при загрузке хэша)'));

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

    // человеческое поведение
    await humanMouse(page);
    await humanScroll(page);
    await humanKeyboard(page);

    // Проверяем на антибот снова
    const finalUrl = page.url();
    if (finalUrl.includes('captcha') || finalUrl.includes('antibot')) {
      warnWithCapture(`🚨 Ozon вернул антибот страницу при парсинге: ${finalUrl}`);
    }

    // Ожидаем появления блока отзывов
    await page
      .waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 })
      .catch(() => warnWithCapture('⚠️ Блок отзывов не найден (timeout при парсинге)'));

    // Небольшая случайная задержка
    await new Promise((res) => setTimeout(res, 3000 + Math.random() * 2000));

    try {
      const titleText = await page.title();
      const titleMatch = titleText.match(/([\d \s]+)\s+отзыв/i);
      if (titleMatch) {
        totalReviewsCount = parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
        logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);
      }
    } catch {}

    // --- 3️⃣ Цикл по страницам ---
    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      // имитация поведения
      await humanMouse(page);
      await humanScroll(page);
      await autoScroll(page);
      await humanKeyboard(page);

      if (Math.random() < 0.15) {
        logWithCapture('⏳ Пауза как у человека...');
        await sleep(3000 + Math.random() * 5000);
      }

      await expandAllSpoilers(page);
      await new Promise((res) => setTimeout(res, 300));

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

      if (mode === '3' && reviews.length === 0) break;

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

      // перед переходом — человек
      await humanMouse(page);
      await humanScroll(page);

      hasNextPage = await goToNextPageByClick(page);
      pageIndex++;

      // случайная пауза
      await new Promise((res) => setTimeout(res, 2000 + Math.random() * 1000));
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
