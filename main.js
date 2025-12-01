const { CONFIG } = require('./config');
const { extractReviewsFromHtml } = require('./extractors/extractReviewsFromHtml');
const {
  autoScroll,
  sleep,
  expandAllSpoilers,
  getReviewsUrl,
  logWithCapture,
  warnWithCapture,
  errorWithCapture,
  getLogBuffer,
  humanKeyboard,
  humanMouse,
  humanScroll,
  getTotalReviewsCountFromTitle,
} = require('./utils');

const { goToNextPageByClick, launchBrowserWithCookies } = require('./helpers');

const { closeBrowser, saveCookies, calculateProductHash, updateJobStatus } = require('./services');

// Основная функция парсинга
async function parseReviewsFromUrl(url, mode = '3', onPartialSave = () => {}, jobRef = null) {
  const { browser, page } = await launchBrowserWithCookies();
  const productNameMatch = url.match(/product\/([^/]+)/)?.[1] || 'Товар';

  const allReviews = [];
  const collectedForSave = [];
  let hashForThisProduct = '';
  let totalReviewsCount = 0;
  let pageIndex = 1;
  let firstScreenshotDone = false;

  try {
    // ============================================================
    // Загрузка страницы для получения hash товара
    // ============================================================
    hashForThisProduct = await calculateProductHash(url, page, mode);

    // ============================================================
    // Пропуск товара, если он был уже обработан ранее (проверка по hash)
    // + фиксация информации о дубле
    // ============================================================
    if (jobRef) {
      // Инициализируем структуру, если её ещё нет
      if (!jobRef.processedProducts) {
        jobRef.processedProducts = [];
      }

      const existingProduct = jobRef.processedProducts.find((p) => p.hash === hashForThisProduct);

      if (existingProduct) {
        const duplicateOfUrl = existingProduct.url;

        warnWithCapture(
          `⛔ Данный товар уже был обработан! Пропускаем: ${url} (совпадение с ${duplicateOfUrl})`
        );

        return {
          productName: productNameMatch,
          totalCount: 0,
          reviews: [],
          logs: [...getLogBuffer()],
          skipped: true,
          url,
          hash: hashForThisProduct,
          duplicateOfUrl,
        };
      }

      // Если хэша ещё не было — запоминаем этот товар
      jobRef.processedProducts.push({
        hash: hashForThisProduct,
        url,
      });

      // Для обратной совместимости — продолжаем заполнять processedHashes, если оно есть
      if (Array.isArray(jobRef.processedHashes)) {
        jobRef.processedHashes.push(hashForThisProduct);
      }
    }

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
        await page.screenshot({ path: CONFIG.firstScreenshotPath, fullPage: true });
        firstScreenshotDone = true;
        logWithCapture(`📸 Скриншот первой страницы: ${CONFIG.firstScreenshotPath}`);
      }
    } catch (e) {
      warnWithCapture(`⚠ Ошибка скриншота первой страницы: ${e.message}`);
    }

    // ============================================================
    // Подсчёт общего количества отзывов
    // ============================================================
    try {
      const titleText = await page.title();
      totalReviewsCount = getTotalReviewsCountFromTitle(titleText);
      logWithCapture(`📊 Отзывов всего: ${totalReviewsCount}`);
      // Обновление статуса общего количества отзывов для фронта
      updateJobStatus(jobRef, { totalReviewsCount });
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
      if (jobRef?.cancelRequested) {
        logWithCapture('⛔ Отмена! Принудительно останавливаем парсер...');
        throw new Error('Парсинг отменён пользователем');
      }

      // Обновление статуса текущей страницы для фронта
      updateJobStatus(jobRef, { currentPage: pageIndex });

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

      // Обновление количества собранных отзывов для фронта
      updateJobStatus(jobRef, { collectedReviews: collectedTotal });

      logWithCapture(`📦 Всего собрано: ${allReviews.length}`);

      if (mode === '3' && stop) {
        warnWithCapture('⛔ Режим 3: пустой комментарий, стоп');
        break;
      }

      await humanMouse(page);
      await humanScroll(page);

      if (jobRef?.cancelRequested) break;

      hasNextPage = await goToNextPageByClick(page);
      pageIndex++;

      await sleep(2000 + Math.random() * 1000);
    }

    // Скриншот последней страницы
    try {
      await sleep(1000);
      await page.screenshot({ path: CONFIG.lastScreenshotPath, fullPage: true });
      logWithCapture(`📸 Скриншот последней страницы: ${CONFIG.lastScreenshotPath}`);
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
      await page.screenshot({ path: CONFIG.lastScreenshotPath, fullPage: true });
    } catch {}

    errorWithCapture('❌ Ошибка при парсинге:', err.message);
    throw new Error(err.message);
  } finally {
    // Обновляем куки, чтобы не устаревали и закрываем браузер
    await saveCookies(page);
    await closeBrowser(browser);
  }
}

module.exports = { parseReviewsFromUrl, CONFIG };
