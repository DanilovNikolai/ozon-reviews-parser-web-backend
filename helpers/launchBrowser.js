// helpers/launchBrowser.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CONFIG } = require('../config');
const { logWithCapture } = require('../utils');
const path = require('path');

puppeteer.use(StealthPlugin());

async function launchBrowserWithCookies() {
  const userDataDir = path.join('/tmp', 'chrome_profile');

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=ru-RU,ru',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // Настраиваем user-agent и заголовки
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  });

  // Дополнительные антибот-настройки
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.navigator.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
  });

  // Загружаем куки
  const cookiesRaw = process.env.OZON_COOKIES;
  if (cookiesRaw) {
    try {
      const cookies = JSON.parse(cookiesRaw);
      const cookiesArray = Array.isArray(cookies) ? cookies : cookies.cookies;
      if (Array.isArray(cookiesArray) && cookiesArray.length > 0) {
        await page.setCookie(...cookiesArray);
        logWithCapture(`🍪 Cookies загружены из переменной окружения (${cookiesArray.length} шт.)`);
      } else {
        logWithCapture('⚠️ В переменной OZON_COOKIES нет валидных cookies');
      }
    } catch (err) {
      console.error('Ошибка загрузки cookies:', err.message);
    }
  }

  // Проверим, применились ли куки
  const activeCookies = await page.cookies('https://www.ozon.ru');
  logWithCapture(`🍪 Активных cookie: ${activeCookies.length}`);

  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
