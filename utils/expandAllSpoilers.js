// Раскрытие спойлеров в комментариях

async function expandAllSpoilers(page) {
  try {
    const count = await page.evaluate(() => {
      const spoilers = Array.from(document.querySelectorAll('span')).filter((el) =>
        el.innerText.trim().toLowerCase().includes('читать полностью')
      );
      spoilers.forEach((el) => el.click());
      return spoilers.length;
    });
    console.log(`🔽 Раскрыто спойлеров: ${count}`);
  } catch (e) {
    console.warn('⚠ Ошибка при раскрытии спойлеров:', e.message);
  }
}

module.exports = { expandAllSpoilers };
