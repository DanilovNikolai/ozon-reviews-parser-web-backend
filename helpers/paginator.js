const { logWithCapture, warnWithCapture, sleep } = require('../utils');
const { CONFIG } = require('../config');

async function goToNextPageByClick(page) {
  const getPageNumber = (url) => {
    const match = url.match(/[?&]page=(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  };

  const currentUrl = page.url();
  const currentPageNumber = getPageNumber(currentUrl);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const nextPageLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const next = links.find((link) => link.innerText.trim().toLowerCase() === 'дальше');
      return next ? next.href : null;
    });

    if (nextPageLink) {
      const nextPageNumber = getPageNumber(nextPageLink);

      if (nextPageNumber === currentPageNumber) {
        throw new Error(`❌ Зацикливание: номер страницы не изменился (${currentPageNumber})`);
      }

      if (nextPageNumber !== currentPageNumber + 1) {
        throw new Error(
          `❌ Неправильный переход: ожидалась страница ${
            currentPageNumber + 1
          }, но получена ${nextPageNumber}`
        );
      }

      logWithCapture(`🖱️ Переход на страницу: ${nextPageLink}`);
      await page.goto(nextPageLink, {
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.nextPageTimeout,
      });
      return true;
    } else {
      warnWithCapture(`⚠ Попытка ${attempt}: кнопка "Дальше" не найдена`);
      if (attempt < 3) {
        logWithCapture('⏳ Ждём перед повтором...');
        await sleep(1500);
      }
    }
  }

  logWithCapture('⛔ Кнопка "Дальше" не найдена. Конец отзывов.');
  return false;
}

module.exports = { goToNextPageByClick };
