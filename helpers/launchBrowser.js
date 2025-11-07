const puppeteer = require('puppeteer');
const fs = require('fs');
const { CONFIG } = require('../config');
const { logWithCapture } = require('../utils');

async function launchBrowserWithCookies() {
  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    window.chrome = { runtime: {} };
  });

  // Загружаем куки из Railway переменной
  const cookiesRaw = process.env.OZON_COOKIES;
  if (cookiesRaw) {
    try {
      const cookies = JSON.parse(cookiesRaw);
      await page.setCookie(...(Array.isArray(cookies) ? cookies : cookies.cookies));
      logWithCapture(`🍪 Cookies загружены из переменной окружения`);
    } catch (err) {
      console.error('Ошибка загрузки cookies:', err.message);
    }
  }

  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
