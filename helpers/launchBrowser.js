const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { CONFIG } = require('../config');
const { logWithCapture } = require('../utils');

puppeteer.use(StealthPlugin());

async function launchBrowserWithCookies() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--disable-blink-features=AutomationControlled',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Настройки окружения
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  });

  // Мимикрия под обычного пользователя
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    window.chrome = { runtime: {} };
  });

  // Если есть cookies — загружаем из /tmp
  const cookiesPath = path.join('/tmp', 'cookies.json');
  if (fs.existsSync(cookiesPath)) {
    const raw = fs.readFileSync(cookiesPath, 'utf8');
    const cookies = JSON.parse(raw);
    await page.setCookie(...(Array.isArray(cookies) ? cookies : cookies.cookies));
    logWithCapture(`🍪 Cookies загружены из ${cookiesPath}`);
  }

  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
