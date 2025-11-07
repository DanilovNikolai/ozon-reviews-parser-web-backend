const puppeteer = require('puppeteer');
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
      '--disable-software-rasterizer',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--mute-audio',
      '--no-zygote',
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  });

  const page = await browser.newPage();

  // ⚙️ Anti-bot защита — применяем как можно раньше
  await page.goto('about:blank');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    window.chrome = { runtime: {} };
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  });

  // 🍪 Загружаем cookies из переменной окружения (JSON)
  const cookiesRaw = process.env.OZON_COOKIES;
  if (cookiesRaw) {
    try {
      const cookies = JSON.parse(cookiesRaw);
      if (Array.isArray(cookies)) {
        await page.setCookie(...cookies);
      } else if (cookies.cookies) {
        await page.setCookie(...cookies.cookies);
      }
      logWithCapture(`🍪 Cookies загружены из переменной окружения`);
    } catch (err) {
      console.error('Ошибка загрузки cookies:', err.message);
    }
  } else {
    logWithCapture('⚠️ Cookies не найдены в OZON_COOKIES');
  }

  return { browser, page };
}

module.exports = { launchBrowserWithCookies };
