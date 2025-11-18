// utils/humanKeyboard.js

async function humanKeyboard(page) {
  try {
    if (Math.random() < 0.2) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200 + Math.random() * 300);
    }

    if (Math.random() < 0.1) {
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(400 + Math.random() * 500);
    }
  } catch (err) {
    console.warn('⚠ humanKeyboard error:', err.message);
  }
}

module.exports = { humanKeyboard };
