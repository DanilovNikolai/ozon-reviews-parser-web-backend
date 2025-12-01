const fs = require('fs');
const path = require('path');
const { logWithCapture } = require('../utils');

const saveCookies = async (page) => {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(path.join(__dirname, 'cookies.json'), JSON.stringify(cookies, null, 2));
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
