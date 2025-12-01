const { CONFIG } = require('../config');
const { logWithCapture, warnWithCapture, sleep } = require('../utils');

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

module.exports = { loadPageForHash };
