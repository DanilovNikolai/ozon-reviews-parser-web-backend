// helpers/launchBrowser.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CONFIG } = require('../config');
const { logWithCapture } = require('../utils');

puppeteer.use(StealthPlugin());

async function launchBrowserWithCookies() {
  const userDataDir = path.join('/tmp', 'chrome_profile');

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--lang=ru-RU,ru',
  ];

  // 🌐 Проксирование (если задано в .env)
  if (process.env.PROXY_URL) {
    args.unshift(`--proxy-server=${process.env.PROXY_URL}`);
    logWithCapture(`🌐 Proxy enabled: ${process.env.PROXY_URL}`);
  }

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    userDataDir,
    args,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // 🔐 Авторизация на прокси (если требуется)
  if (process.env.PROXY_USER && process.env.PROXY_PASS) {
    try {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS,
      });
      logWithCapture('🔐 Proxy auth applied');
    } catch (err) {
      console.error('Proxy auth error:', err.message);
    }
  }

  // 🧠 Настройки браузера под “человека”
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

  // 🍪 Подключаем cookies.json
  const cookiesPath = path.join(__dirname, '../cookies.json');
  if (fs.existsSync(cookiesPath)) {
    try {
      const raw = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(raw);
      const cookiesArr = Array.isArray(cookies) ? cookies : cookies.cookies;
      if (Array.isArray(cookiesArr) && cookiesArr.length > 0) {
        await page.setCookie(...cookiesArr);
        logWithCapture(`🍪 Cookies из cookies.json (${cookiesArr.length})`);
      } else {
        logWithCapture('⚠️ cookies.json найден, но пуст');
      }
    } catch (err) {
      console.error('Ошибка чтения cookies.json:', err.message);
    }
  } else {
    logWithCapture('⚠️ cookies.json не найден');
  }

  // 👨‍💻 Простая имитация поведения пользователя
  page.humanize = async () => {
    try {
      await page.mouse.move(200 + Math.random() * 600, 300 + Math.random() * 400);
      await page.mouse.wheel({ deltaY: 300 + Math.random() * 300 });
      await page.waitForTimeout(500 + Math.random() * 1000);
    } catch {}
  };

  logWithCapture('🚀 Puppeteer launched (stealth + proxy + cookies)');
  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
