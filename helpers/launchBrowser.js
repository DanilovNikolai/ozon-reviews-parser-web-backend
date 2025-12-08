const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CONFIG } = require('../config');
const { logWithCapture, warnWithCapture } = require('../utils');
const { isActiveLock } = require('../utils/lockManager');

puppeteer.use(StealthPlugin());

// Пул настоящих браузерных user-agent
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0',
];

const randomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Проверка валидности сессии и антибота
async function validateSession(page) {
  try {
    await page.goto('https://www.ozon.ru/?__rr=1', {
      waitUntil: 'domcontentloaded',
      timeout: 12000,
    });

    const finalUrl = page.url();

    if (finalUrl.includes('antibot') || finalUrl.includes('captcha')) {
      logWithCapture('⛔ Cookies invalid — clearing cookies.json');

      fs.writeFileSync(path.join(__dirname, '../cookies.json'), '[]');

      return false;
    }

    return true;
  } catch (err) {
    warnWithCapture(`⚠ Session validation failed: ${err.message}`);
    return false;
  }
}

async function launchBrowserWithCookies() {
  // Постоянный Chrome профиль
  const userDataDir = '/app/chrome-data';

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

  // Прокси
  if (process.env.PROXY_URL) {
    args.unshift(`--proxy-server=${process.env.PROXY_URL}`);
    logWithCapture(`🌐 Proxy enabled`);
  }

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    userDataDir,
    args,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // Авторизация на прокси
  if (process.env.PROXY_USER && process.env.PROXY_PASS) {
    try {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS,
      });
      logWithCapture(`🔐 Proxy auth OK`);
    } catch (err) {
      warnWithCapture(`❌ Proxy auth failed: ${err.message}`);
    }
  }

  // Настройки браузера
  const ua = randomUserAgent();
  await page.setUserAgent(ua);

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    window.chrome = { runtime: {} };
  });

  // Загрузка cookies.json
  const cookiesPath = path.join(__dirname, '../cookies.json');

  if (fs.existsSync(cookiesPath)) {
    try {
      const raw = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(raw);
      const cookiesArr = Array.isArray(cookies) ? cookies : cookies.cookies;

      if (Array.isArray(cookiesArr) && cookiesArr.length > 0) {
        await page.setCookie(...cookiesArr);
        logWithCapture(`🍪 Cookies loaded (${cookiesArr.length})`);
      } else {
        logWithCapture('⚠ cookies.json is empty');
      }
    } catch (err) {
      warnWithCapture(`⚠ Cookies load error: ${err.message}`);
    }
  } else {
    warnWithCapture('⚠ cookies.json not found — starting without cookies');
  }

  // Если это обновление куков — НЕ чистим cookies, даже если антибот
  if (!isActiveLock('cookies')) {
    await validateSession(page);
  }

  // Проверка IP
  try {
    await page.goto('https://ipinfo.io/json', {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });

    const ipData = await page.evaluate(() => document.body.innerText);
    const parsed = JSON.parse(ipData);

    logWithCapture(`🌍 IP: ${parsed.ip}, Country: ${parsed.country}`);
  } catch (err) {
    warnWithCapture(`⚠ IP check failed: ${err.message}`);
  }

  logWithCapture('🚀 Puppeteer ready (stealth + proxy + cookies + random UA)');
  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
