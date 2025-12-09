const { launchBrowserWithCookies } = require('../helpers');
const { saveCookies, closeBrowser } = require('../services');
const { logWithCapture, warnWithCapture, errorWithCapture } = require('../utils');
const { createLock, isActiveLock, removeLock } = require('../utils/lockManager');
const {
  humanMouse,
  humanScroll,
  humanKeyboard,
  autoScroll,
  sleep,
  getFormattedTimestamp,
} = require('../utils');

const COOKIE_TTL_MIN = Number(process.env.COOKIE_LOCK_TTL_MIN || 10);
const PARSER_LOCK = 'parser';
const COOKIE_LOCK = 'cookies';

async function refreshCookies() {
  try {
    logWithCapture(`🔄 [${getFormattedTimestamp()}][COOKIE REFRESH] Старт обновления куков...`);

    // 1 — Парсер активен? Пропускаем
    if (isActiveLock(PARSER_LOCK)) {
      logWithCapture(
        `⏳ [${getFormattedTimestamp()}][COOKIE REFRESH] Парсер работает → обновление пропущено.`
      );
      return;
    }

    // 2 — Уже идёт обновление?
    if (isActiveLock(COOKIE_LOCK)) {
      logWithCapture(
        `⏳ [${getFormattedTimestamp()}][COOKIE REFRESH] cookies.lock активен → пропуск`
      );
      return;
    }

    createLock(COOKIE_LOCK, COOKIE_TTL_MIN, { type: 'cookie-refresh' });

    // 3 — Запускаем браузер с ТВОЕЙ логикой антибота
    const { browser, page } = await launchBrowserWithCookies();

    logWithCapture(`🌍 [${getFormattedTimestamp()}][COOKIE REFRESH] Переходим на профиль…`);

    // Важнее, чем главная страница
    await page.goto('https://www.ozon.ru/my/main', {
      waitUntil: 'networkidle0',
      timeout: 25000,
    });

    // 4 — Проверка на антибот
    const url1 = page.url();
    if (url1.includes('antibot') || url1.includes('captcha')) {
      warnWithCapture(
        `⚠ [${getFormattedTimestamp()}][COOKIE REFRESH] антибот → пробуем ещё раз через 10 сек…`
      );
      await sleep(10000);
    }

    // 5 — Имитация человека
    await humanMouse(page);
    await sleep(500 + Math.random() * 1000);
    await humanScroll(page);
    await sleep(1000 + Math.random() * 2000);
    await humanKeyboard(page);

    // Немного прокрутить вниз
    await autoScroll(page);
    await sleep(800);

    // 6 — Снова проверяем антибот
    const url2 = page.url();
    if (url2.includes('antibot') || url2.includes('captcha')) {
      throw new Error('Антибот всё ещё активен, куки обновлять нельзя');
    }

    // 7 — УСПЕШНО → сохраняем свежие куки
    await saveCookies(page);
    logWithCapture(`✅ [${getFormattedTimestamp()}][COOKIE REFRESH] Куки обновлены!`);

    await closeBrowser(browser);
  } catch (err) {
    errorWithCapture(`❌ [${getFormattedTimestamp()}][COOKIE REFRESH] Ошибка: ${err.message}`);
  } finally {
    removeLock(COOKIE_LOCK);
  }
}

refreshCookies();
