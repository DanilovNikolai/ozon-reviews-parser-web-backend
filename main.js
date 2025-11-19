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
  clearLogBuffer,
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
    // ============================================================
    // 1️⃣ Загрузка страницы для хэша с повторами
    // ============================================================
    async function loadPageForHash(page, url, retries = 3) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        logWithCapture(`🔄 Загрузка страницы для хэша (попытка ${attempt}/${retries})`);

        try {
          await page.goto(url, {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: CONFIG.nextPageTimeout,
          });

          const currentUrl = page.url();

          if (currentUrl.includes('captcha') || currentUrl.includes('antibot')) {
            warnWithCapture('⚠️ Попали на антибот при генерации хэша, пробуем снова…');
            await sleep(2000 + Math.random() * 3000);
            continue;
          }

          const selector = '[data-widget="webListReviews"]';
          const found = await page.$(selector);
          if (!found) {
            warnWithCapture('⚠️ Нет блока отзывов — возможно антибот');
            await sleep(2000 + Math.random() * 3000);
            continue;
          }

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

    const htmlForHash = await page.evaluate(() => {
      const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
      return container.innerHTML;
    });

    const { reviews: hashReviews } = extractReviewsFromHtml(htmlForHash, mode);
    const hash = generateHashFromReviews(hashReviews);

    const existingIndex = seenHashes.findIndex((h) => h === hash);
    if (existingIndex !== -1) {
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
            urlMatch: seenUrls[existingIndex],
          },
        ],
        logs: [...getLogBuffer()],
      };
    }

    seenHashes.push(hash);
    seenUrls.push(url);
    hashForThisProduct = hash;

    // ============================================================
    // 2️⃣ Основная страница отзывов
    // ============================================================
    await page.goto(getReviewsUrl(url), {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });

    logWithCapture(`✅ Страница загружена: ${page.url()}`);

    // человеческое поведение
    await humanMouse(page);
    await humanScroll(page);
    await humanKeyboard(page);

    // небольшая случайная задержка
    await sleep(800 + Math.random() * 1200);

    // в 20% случаев "человек думает"
    if (Math.random() < 0.2) {
      logWithCapture('⏳ Думаю как человек перед началом чтения...');
      await sleep(2000 + Math.random() * 3000);
    }

    const finalUrl = page.url();
    if (finalUrl.includes('captcha') || finalUrl.includes('antibot')) {
      throw new Error('Ozon вернул антибот страницу при парсинге');
    }

    await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 });

    // небольшая стабилизация DOM
    await sleep(1500);

    // 📸 СКРИНШОТ ПЕРВОЙ РЕАЛЬНОЙ СТРАНИЦЫ
    try {
      if (!firstScreenshotDone) {
        await page.screenshot({ path: FIRST_SCREENSHOT_PATH, fullPage: true });
        firstScreenshotDone = true;
        logWithCapture(`📸 Скриншот первой страницы: ${FIRST_SCREENSHOT_PATH}`);
      }
    } catch (e) {
      warnWithCapture(`⚠ Не удалось сделать скриншот первой страницы: ${e.message}`);
    }

    // ============================================================
    // Количество отзывов
    // ============================================================
    try {
      const titleText = await page.title();
      const titleMatch = titleText.match(/([\d \s]+)\s+отзыв/i);
      if (titleMatch) {
        totalReviewsCount = parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
        logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);
      }
    } catch {}

    // ============================================================
    // 3️⃣ Цикл по страницам
    // ============================================================
    let pageIndex = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      if (hasNextPage) {
        // имитация «посмотрел на новую страницу»
        await sleep(500 + Math.random() * 800);
        await humanMouse(page);
      }
      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      // поведение человека
      await humanMouse(page);
      await humanScroll(page);

      // небольшая пауза
      await sleep(300 + Math.random() * 600);

      await autoScroll(page);
      await humanKeyboard(page);

      // 20% шанс "человек думает"
      if (Math.random() < 0.2) {
        logWithCapture('⏳ Человек задумался на странице...');
        await sleep(3000 + Math.random() * 5000);
      }

      await expandAllSpoilers(page);
      await sleep(350);

      if (pageIndex > CONFIG.maxPagesPerSKU) {
        warnWithCapture(`⛔ Достигнут лимит страниц: ${CONFIG.maxPagesPerSKU}`);
        break;
      }

      const html = await page.evaluate(() => {
        const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
        return container.innerHTML;
      });

      const { reviews, stop } = extractReviewsFromHtml(html, mode);

      if (reviews.length === 0) {
        warnWithCapture('⛔ Пустая страница — отзывы закончились');
        break;
      }

      // сохраняем ВСЁ со страницы
      for (const r of reviews) r.hash = hashForThisProduct;
      allReviews.push(...reviews);
      collectedForSave.push(...reviews);

      logWithCapture(`📦 Всего собрано: ${allReviews.length}`);

      // Промежуточное сохранение
      if (collectedForSave.length >= CONFIG.saveInterval) {
        onPartialSave({
          productName: productNameMatch,
          totalCount: totalReviewsCount,
          reviews: [...collectedForSave],
        });
        collectedForSave.length = 0;
      }

      // Режим 3 — стоп после сохранения страницы
      if (mode === '3' && stop) {
        warnWithCapture('⛔ Режим 3: найден пустой комментарий');
        break;
      }

      // имитация человека перед переходом
      await humanMouse(page);
      await humanScroll(page);

      hasNextPage = await goToNextPageByClick(page);
      pageIndex++;

      // пауза как в старом скрипте: 2–3 секунды
      await sleep(2000 + Math.random() * 1000);
    }

    // последняя порция
    if (collectedForSave.length > 0) {
      onPartialSave({
        productName: productNameMatch,
        totalCount: totalReviewsCount,
        reviews: [...collectedForSave],
      });
    }

    // 📸 СКРИНШОТ ПОСЛЕДНЕЙ СТРАНИЦЫ
    try {
      await sleep(1200);
      await page.screenshot({ path: LAST_SCREENSHOT_PATH, fullPage: true });
      logWithCapture(`📸 Скриншот последней страницы: ${LAST_SCREENSHOT_PATH}`);
    } catch (e) {
      warnWithCapture(`⚠ Не удалось сделать скриншот последней страницы: ${e.message}`);
    }

    // УСПЕШНО
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
    try {
      await sleep(500);
      await page.screenshot({ path: LAST_SCREENSHOT_PATH, fullPage: true });
      logWithCapture(`📸 Финальный скриншот при ошибке: ${LAST_SCREENSHOT_PATH}`);
    } catch {}

    errorWithCapture('❌ Ошибка при парсинге:', err.message);
    throw new Error(err.message);
  } finally {
    await browser.close();
    logWithCapture('🛑 Браузер закрыт');
  }
}

module.exports = { parseReviewsFromUrl, CONFIG };
