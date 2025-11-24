// main.js
const fs = require('fs');
const path = require('path');
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

// Безопасный evaluate с таймаутом
async function safeEvaluate(page, fn, timeout = 15000) {
  return Promise.race([
    page.evaluate(fn),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('evaluate timeout exceeded')), timeout)
    ),
  ]);
}

// Основная функция парсинга
async function parseReviewsFromUrl(url, mode = '3', onPartialSave = () => {}, jobRef = null) {
  const { browser, page } = await launchBrowserWithCookies();
  const productNameMatch = url.match(/product\/([^/]+)/)?.[1] || 'Товар';

  let hashForThisProduct = '';
  const allReviews = [];
  const collectedForSave = [];

  let totalReviewsCount = 0;
  let pageIndex = 1;
  let firstScreenshotDone = false;

  const FIRST_SCREENSHOT_PATH = '/tmp/debug_hash.png';
  const LAST_SCREENSHOT_PATH = '/tmp/debug_reviews.png';

  try {
    // ============================================================
    // Загрузка страницы для ХЭША
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
            warnWithCapture('⚠️ Попали на антибот при генерации хэша');
            await sleep(2000 + Math.random() * 3000);
            continue;
          }

          const selector = '[data-widget="webListReviews"]';
          if (!(await page.$(selector))) {
            warnWithCapture('⚠️ Нет блока отзывов — возможно антибот');
            await sleep(2000 + Math.random() * 3000);
            continue;
          }

          await page.waitForSelector(selector, { timeout: 15000 });

          logWithCapture('✅ Страница для хэша загружена');
          return;
        } catch (err) {
          warnWithCapture(`⚠ Ошибка при загрузке хэша: ${err.message}`);
          if (attempt === retries) {
            throw new Error('Не удалось загрузить страницу для хэша');
          }
          await sleep(2000 + Math.random() * 2500);
        }
      }
    }

    const hashUrl = getReviewsUrlWithSort(url, 'score_asc');
    await loadPageForHash(page, hashUrl);

    const htmlForHash = await safeEvaluate(
      page,
      () => {
        const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
        return container.innerHTML;
      },
      10000
    );

    const { reviews: hashReviews } = extractReviewsFromHtml(htmlForHash, mode);
    const hash = generateHashFromReviews(hashReviews);
    hashForThisProduct = hash;

    // ============================================================
    // Основная страница отзывов
    // ============================================================
    await page.goto(getReviewsUrl(url), {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: CONFIG.nextPageTimeout,
    });

    logWithCapture(`✅ Страница загружена: ${page.url()}`);

    await humanMouse(page);
    await humanScroll(page);
    await humanKeyboard(page);

    await sleep(800 + Math.random() * 1200);

    if (Math.random() < 0.2) {
      logWithCapture('⏳ Думаю как человек перед чтением...');
      await sleep(2000 + Math.random() * 3000);
    }

    if (page.url().includes('captcha') || page.url().includes('antibot')) {
      throw new Error('Ozon вернул антибот страницу на основной странице');
    }

    await page.waitForSelector('[data-widget="webListReviews"]', { timeout: 20000 });

    await sleep(1500);

    // Скриншот первой страницы
    try {
      if (!firstScreenshotDone) {
        await page.screenshot({ path: FIRST_SCREENSHOT_PATH, fullPage: true });
        firstScreenshotDone = true;
        logWithCapture(`📸 Скриншот первой страницы: ${FIRST_SCREENSHOT_PATH}`);
      }
    } catch (e) {
      warnWithCapture(`⚠ Ошибка скриншота первой страницы: ${e.message}`);
    }

    // ============================================================
    // Подсчёт общего количества отзывов
    // ============================================================
    try {
      const titleText = await page.title();
      const titleMatch = titleText.match(/([\d\s]+)\s+отзыв/i);
      if (titleMatch) {
        totalReviewsCount = parseInt(titleMatch[1].replace(/[^\d]/g, ''), 10);
        logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);

        if (jobRef) {
          jobRef.totalReviewsCount = totalReviewsCount;
          jobRef.updatedAt = Date.now();
        }
      }
    } catch {
      warnWithCapture('⚠ Не удалось определить количество отзывов по заголовку');
    }

    // ============================================================
    // Основной цикл по страницам
    // ============================================================
    let hasNextPage = true;
    let collectedTotal = 0;

    while (hasNextPage) {
      // ===== Проверка отмены =====
      if (jobRef && jobRef.cancelRequested) {
        logWithCapture('⛔ Отмена! Принудительно останавливаем парсер...');
        break;
      }

      // Обновление статуса для фронта
      if (jobRef) {
        jobRef.currentPage = pageIndex;
        jobRef.updatedAt = Date.now();
      }

      logWithCapture(`📄 Парсим страницу #${pageIndex}`);

      await humanMouse(page);
      await humanScroll(page);

      await sleep(300 + Math.random() * 600);

      await autoScroll(page);
      await humanKeyboard(page);

      if (Math.random() < 0.2) {
        logWithCapture('⏳ Человек задумался...');
        await sleep(3000 + Math.random() * 5000);
      }

      await expandAllSpoilers(page);
      await sleep(350);

      if (pageIndex > CONFIG.maxPagesPerSKU) {
        warnWithCapture(`⛔ Лимит страниц: ${CONFIG.maxPagesPerSKU}`);
        break;
      }

      const html = await page.evaluate(() => {
        const container = document.querySelector('[data-widget="webListReviews"]') || document.body;
        return container.innerHTML;
      });

      const { reviews, stop } = extractReviewsFromHtml(html, mode);

      if (reviews.length === 0) {
        warnWithCapture('⛔ Пустая страница — отзывы кончились');
        break;
      }

      // Привязываем хэш
      for (const r of reviews) r.hash = hashForThisProduct;

      allReviews.push(...reviews);
      collectedForSave.push(...reviews);
      collectedTotal += reviews.length;

      // Обновление прогресса отзывов в задаче
      if (jobRef) {
        jobRef.collectedReviews = collectedTotal;
        jobRef.updatedAt = Date.now();
      }

      logWithCapture(`📦 Всего собрано: ${allReviews.length}`);

      if (mode === '3' && stop) {
        warnWithCapture('⛔ Режим 3: пустой комментарий, стоп');
        break;
      }

      await humanMouse(page);
      await humanScroll(page);

      if (jobRef && jobRef.cancelRequested) break;

      hasNextPage = await goToNextPageByClick(page);
      pageIndex++;

      await sleep(2000 + Math.random() * 1000);
    }

    // Скриншот последней страницы
    try {
      await sleep(1000);
      await page.screenshot({ path: LAST_SCREENSHOT_PATH, fullPage: true });
      logWithCapture(`📸 Скриншот последней страницы: ${LAST_SCREENSHOT_PATH}`);
    } catch (e) {
      warnWithCapture(`⚠ Ошибка скриншота последней: ${e.message}`);
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
    };
  } catch (err) {
    try {
      await sleep(500);
      await page.screenshot({ path: LAST_SCREENSHOT_PATH, fullPage: true });
    } catch {}

    errorWithCapture('❌ Ошибка при парсинге:', err.message);
    throw new Error(err.message);
  } finally {
    // Обновляем куки
    try {
      const cookies = await page.cookies();
      fs.writeFileSync(path.join(__dirname, 'cookies.json'), JSON.stringify(cookies, null, 2));
      logWithCapture(`💾 Cookies updated (${cookies.length})`);
    } catch (err) {
      logWithCapture(`⚠ Ошибка обновления cookies: ${err.message}`);
    }

    try {
      await browser.close();
      logWithCapture('🛑 Браузер закрыт');
    } catch {
      const browserProcess = browser.process();
      if (browserProcess) browserProcess.kill('SIGKILL');
    }
  }
}

module.exports = { parseReviewsFromUrl, CONFIG };
