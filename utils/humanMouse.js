// utils/humanMouse.js

async function humanMouse(page) {
  try {
    const steps = 15 + Math.floor(Math.random() * 10);
    const x = 200 + Math.random() * 1000;
    const y = 200 + Math.random() * 600;

    await page.mouse.move(x, y, { steps });
    await page.waitForTimeout(200 + Math.random() * 800);

    if (Math.random() < 0.25) {
      await page.mouse.wheel({ deltaY: 150 + Math.random() * 350 });
      await page.waitForTimeout(300 + Math.random() * 600);
    }
  } catch (err) {
    console.warn('⚠ humanMouse error:', err.message);
  }
}

module.exports = { humanMouse };
