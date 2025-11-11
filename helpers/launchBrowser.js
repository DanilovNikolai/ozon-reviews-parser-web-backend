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

  const browser = await puppeteer.launch({
    headless: CONFIG.headless, // можно переключать в config.js (true/false)
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

  // === Настройка user-agent и заголовков ===
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  });

  // === Маскировка признаков автоматизации ===
  await page.evaluateOnNewDocument(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      window.chrome = { runtime: {} };
    } catch (e) {}
  });

  // === Загружаем cookies из файла ===
  const cookiesPath = path.join(__dirname, '../cookies.json');
  if (fs.existsSync(cookiesPath)) {
    try {
      const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
      const cookies = JSON.parse(cookiesData);
      const cookiesArray = Array.isArray(cookies) ? cookies : cookies.cookies;

      if (Array.isArray(cookiesArray) && cookiesArray.length > 0) {
        await page.setCookie(...cookiesArray);
        logWithCapture(`🍪 Cookies загружены из cookies.json (${cookiesArray.length} шт.)`);
      } else {
        logWithCapture('⚠️ Файл cookies.json пуст или невалидный');
      }
    } catch (err) {
      console.error('❌ Ошибка при чтении cookies.json:', err.message);
    }
  } else {
    logWithCapture('⚠️ Файл cookies.json не найден, продолжаем без cookies');
  }

  // === Проверяем, что cookies реально применились ===
  const activeCookies = await page.cookies('https://www.ozon.ru');
  logWithCapture(`🍪 Активных cookie: ${activeCookies.length}`);

  // === Добавляем лёгкую эмуляцию действий пользователя ===
  page.humanize = async () => {
    try {
      await page.mouse.move(300 + Math.random() * 400, 300 + Math.random() * 200);
      await page.mouse.wheel({ deltaY: 400 + Math.random() * 200 });
      await page.waitForTimeout(500 + Math.random() * 1000);
    } catch (e) {}
  };

  logWithCapture('🚀 Puppeteer запущен (stealth mode)');
  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
