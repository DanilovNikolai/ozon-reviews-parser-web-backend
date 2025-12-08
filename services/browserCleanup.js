const fs = require('fs');
const path = require('path');
const { logWithCapture } = require('../utils');

const saveCookies = async (page) => {
  try {
    const cookies = await page.cookies();
    // сохраняем в корень проекта, рядом с cookies.json, который читает launchBrowserWithCookies
    const cookiesPath = path.join(__dirname, '../cookies.json');
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    logWithCapture(`💾 Cookies updated (${cookies.length})`);
  } catch (err) {
    logWithCapture(`⚠ Ошибка обновления cookies: ${err.message}`);
  }
};

const closeBrowser = async (browser) => {
  try {
    await browser.close();
    logWithCapture('🛑 Браузер закрыт');
  } catch {
    const browserProcess = browser.process();
    if (browserProcess) browserProcess.kill('SIGKILL');
  }
};

module.exports = { saveCookies, closeBrowser };
