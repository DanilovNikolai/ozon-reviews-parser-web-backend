// Автоскролл

const { CONFIG } = require('../config');
const { sleep } = require('./sleep');

async function autoScroll(page) {
  let lastScrollHeight = 0;
  let sameHeightCounter = 0;
  for (let i = 0; i < CONFIG.maxScrollAttempts; i++) {
    try {
      const scrollHeight = await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
        return document.body.scrollHeight;
      });
      if (scrollHeight === lastScrollHeight) {
        sameHeightCounter++;
      } else {
        sameHeightCounter = 0;
        lastScrollHeight = scrollHeight;
      }
      if (sameHeightCounter >= 5) break;
      await sleep(CONFIG.scrollDelay);
    } catch (err) {
      console.warn('⚠ Пропущен шаг скролла:', err.message);
      await sleep(CONFIG.scrollDelay * 2);
    }
  }
  console.log('✅ Скроллинг завершён');
}

module.exports = { autoScroll };
