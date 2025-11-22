// utils/humanScroll.js
const { sleep } = require('./sleep');

async function humanScroll(page) {
  try {
    const segments = 3 + Math.floor(Math.random() * 5);

    for (let i = 0; i < segments; i++) {
      await page.mouse.wheel({ deltaY: 200 + Math.random() * 400 });
      await sleep(200 + Math.random() * 600);
    }
  } catch (err) {
    console.warn('⚠ humanScroll error:', err.message);
  }
}

module.exports = { humanScroll };
