// main.js
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

  const FIRST_SCREENSHOT_PATH = '/tmp/debug_hash.png';
  const LAST_SCREENSHOT_PATH = '/tmp/debug_reviews.png';
  let firstScreenshotDone = false;

  try {
    // --- 1️⃣ Загрузка страницы для хэша с повторами ---
    async function loadPageForHash(page, url, retries = 3) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        logWithCapture(`🔄 Загрузка страницы для хэша (попытка ${attempt}/${retries})`);

        try {
          await page.goto(url, {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: CONFIG.nextPageTimeout,
          });

          await humanMouse(page);
          await humanKeyboard(page);

          const currentUrl = page.url();

          // Проверяем антибот
          if (currentUrl.includes('captcha') || currentUrl.includes('antibot')) {
            warnWithCapture('⚠️ Попали на антибот при генерации хэша');
            await sleep(2000 + Math.random() * 3000);
            continue;
          }

          // Проверяем блок отзывов
          const selector = '[data-widget="webListReviews"]';
          const found = await page.$(selector);

          if (!found) {
            warnWithCapture('⚠️ Блок отзывов отсутствует — возможно антибот, пробуем снова');
            await sleep(2000 + Math.random() * 3000);
            continue;
          }

          // Ожидаем появление
          await page.waitForSelector(selector, { timeout: 15000 });

          logWithCapture('✅ Страница для хэша успешно загружена');
          return;
        } catch (err) {
          warnWithCapture(`⚠ Ошибка при загрузке страницы для хэша: ${err.message}`);

          if (attempt === retries) {
            throw new Error(`Не удалось загрузить страницу для хэша после ${retries} попыток`);
          }

          await sleep(2000 + Math.random() * 2500);
        }
      }
    }

    const hashUrl = getReviewsUrlWithSort(url, 'score_asc');
    await loadPageForHash(page, hashUrl);

    // Получаем HTML для хэша
    const htmlForHash = await page.evaluate(() => {
      const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
      return container.innerHTML;
    });

    const { reviews: hashReviews } = extractReviewsFromHtml(htmlForHash, mode);
    const hash = generateHashFromReviews(hashReviews);

    // Проверка дубликатов
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
      };
    }

    seenHashes.push(hash);
    seenUrls.push(url);
    hashForThisProduct = hash;

    // --- 2️⃣ Основная страница с отзывами ---
    await page.goto(getReviewsUrl(url), {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });

    logWithCapture(`✅ Страница загружена: ${page.url()}`);

    await humanMouse(page);
    await humanScroll(page);
    await humanKeyboard(page);

    const finalUrl = page.url();
    if (finalUrl.includes('captcha') || finalUrl.includes('antibot')) {
      throw new Error('Ozon вернул антибот страницу при парсинге');
    }

    await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 });

    await sleep(3000 + Math.random() * 2000);

    // 📸 Скриншот первой страницы
    try {
      if (!firstScreenshotDone) {
        await page.screenshot({ path: FIRST_SCREENSHOT_PATH, fullPage: true });
        firstScreenshotDone = true;
        logWithCapture(`📸 Скриншот первой страницы: ${FIRST_SCREENSHOT_PATH}`);
      }
    } catch (e) {
      warnWithCapture(`⚠ Не удалось сделать скриншот первой страницы: ${e.message}`);
    }

    // Количество отзывов
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

      await humanMouse(page);
      await humanScroll(page);
      await autoScroll(page);
      await humanKeyboard(page);

      if (Math.random() < 0.15) {
        logWithCapture('⏳ Пауза как у человека...');
        await sleep(3000 + Math.random() * 5000);
      }

      await expandAllSpoilers(page);
      await sleep(300);

      if (pageIndex > CONFIG.maxPagesPerSKU) {
        warnWithCapture(`⛔ Достигнут лимит страниц: ${CONFIG.maxPagesPerSKU}`);
        break;
      }

      const html = await page.evaluate(() => {
        const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
        return container.innerHTML;
      });

      // НОВОЕ: вытаскиваем и отзывы, и stop-сигнал
      const { reviews, stop } = extractReviewsFromHtml(html, mode);

      // 1) Если совсем нет отзывов — это конец списка
      if (reviews.length === 0) {
        warnWithCapture('⛔ Пустая страница — конец отзывов');
        break;
      }

      // 2) Добавляем hash и сохраняем ОТЗЫВЫ ЭТОЙ СТРАНИЦЫ В ЛЮБОМ СЛУЧАЕ
      for (const review of reviews) {
        review.hash = hashForThisProduct;
      }

      allReviews.push(...reviews);
      collectedForSave.push(...reviews);

      logWithCapture(`📦 Всего собрано: ${allReviews.length}`);

      // 📸 Скриншот последней успешно спарсенной страницы
      try {
        await page.screenshot({ path: LAST_SCREENSHOT_PATH, fullPage: true });
        logWithCapture(`📸 Скриншот страницы #${pageIndex}: ${LAST_SCREENSHOT_PATH}`);
      } catch (e) {
        warnWithCapture(`⚠ Не удалось сделать скриншот текущей страницы: ${e.message}`);
      }

      // 3) Промежуточное сохранение
      if (collectedForSave.length >= CONFIG.saveInterval) {
        onPartialSave({
          productName: productNameMatch,
          totalCount: totalReviewsCount,
          reviews: [...collectedForSave],
        });
        collectedForSave.length = 0;
      }

      // 4) Если режим 3 и из extractReviewsFromHtml пришёл stop-сигнал (первый пустой комментарий)
      if (mode === '3' && stop) {
        warnWithCapture('⛔ Режим 3: найден пустой комментарий');
        break;
      }

      // Переход на следующую страницу
      await humanMouse(page);
      await humanScroll(page);

      hasNextPage = await goToNextPageByClick(page);
      pageIndex++;

      await sleep(2000 + Math.random() * 1000);
    }

    // Последняя порция
    if (collectedForSave.length > 0) {
      onPartialSave({
        productName: productNameMatch,
        totalCount: totalReviewsCount,
        reviews: [...collectedForSave],
      });
    }

    // --- Успешный результат ---
    return {
      productName: productNameMatch,
      totalCount: totalReviewsCount,
      reviews: allReviews.map((r, i) => ({
        ...r,
        url,
        ordinal: `${i + 1}/${totalReviewsCount || allReviews.length}`,
      })),
      logs: [...getLogBuffer()],
    };
  } catch (err) {
    // Финальный скриншот при ошибке
    try {
      await page.screenshot({ path: LAST_SCREENSHOT_PATH, fullPage: true });
      logWithCapture(`📸 Финальный скриншот при ошибке: ${LAST_SCREENSHOT_PATH}`);
    } catch (e) {
      warnWithCapture(`⚠ Не удалось сделать финальный скриншот при ошибке: ${e.message}`);
    }

    errorWithCapture('❌ Ошибка при парсинге:', err.message);
    throw new Error(err.message);
  } finally {
    await browser.close();
    logWithCapture('🛑 Браузер закрыт');
  }
}

module.exports = { parseReviewsFromUrl, CONFIG };
