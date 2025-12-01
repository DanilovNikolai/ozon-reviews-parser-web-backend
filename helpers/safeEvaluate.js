// Безопасный evaluate с таймаутом

export async function safeEvaluate(page, fn, timeout = 15000) {
  return Promise.race([
    page.evaluate(fn),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('evaluate timeout exceeded')), timeout)
    ),
  ]);
}
