// utils/autoScroll.js
const { sleep } = require('./sleep');

async function autoScroll(page) {
  try {
    const scrollSteps = 5 + Math.floor(Math.random() * 10);

    for (let i = 0; i < scrollSteps; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * (0.4 + Math.random() * 0.6));
      });

      await sleep(200 + Math.random() * 600);

      if (Math.random() < 0.2) {
        await page.mouse.wheel({ deltaY: 100 + Math.random() * 300 });
      }
    }
  } catch (err) {
    console.warn('⚠ autoScroll error:', err.message);
  }
}

module.exports = { autoScroll };
