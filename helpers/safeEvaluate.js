// Безопасный evaluate с таймаутом

async function safeEvaluate(page, fn, timeout = 15000) {
  return Promise.race([
    page.evaluate(fn),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('evaluate timeout exceeded')), timeout)
    ),
  ]);
}

module.exports = { safeEvaluate };
