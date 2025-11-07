const { JSDOM } = require('jsdom');
const { extractTextNodes } = require('./extractTextNodes');
const { logWithCapture, warnWithCapture } = require('../utils');

function extractReviewsFromHtml(html, mode = '1') {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const reviews = [];
  const reviewBlocks = document.querySelectorAll('[data-review-uuid]');
  logWithCapture(`🔍 Найдено отзывов: ${reviewBlocks.length}`);

  for (let index = 0; index < reviewBlocks.length; index++) {
    const block = reviewBlocks[index];
    try {
      const texts = extractTextNodes(block);
      const hasAvatar = !!block.querySelector('img[src*="fs-my-account-avatar"]');
      const links = Array.from(block.querySelectorAll('a'))
        .map((a) => a.textContent.trim())
        .filter(Boolean);

      let user = 'Неизвестно';
      let date = 'Неизвестно';
      let product = links[0] || 'Неизвестно';
      let comment = '';
      let rating = 'Неизвестно';

      // === Имя пользователя ===
      if (texts.length > 0) {
        if (hasAvatar) {
          user = texts[0]; // при наличии аватара — первое значение точно имя
        } else if (
          texts.length > 1 &&
          texts[0].length === 1 &&
          texts[1].length > 1 &&
          texts[0] === texts[1][0]
        ) {
          // заглушка аватара совпадает с первой буквой имени
          user = texts[1];
          texts.shift(); // удаляем заглушку
        } else {
          user = texts[0];
        }
      }

      // === Дата ===
      const dateRegex =
        /\b\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\b/i;
      const dateMatch = texts.find((t) => dateRegex.test(t));
      if (dateMatch) date = dateMatch;

      // === Удаление известной информации ===
      const knownParts = new Set([user, date, ...links]);

      // === Определение комментария ===
      // комментарий — это всё, что идёт после последней ссылки и до "Вам помог этот отзыв?"
      const textBeforeEndPrompt = [];
      let reachedEndPrompt = false;
      for (let txt of texts) {
        if (/^Вам помог/i.test(txt)) {
          reachedEndPrompt = true;
          break;
        }

        if (!knownParts.has(txt) && !/^да\s*\d*$/i.test(txt) && !/^нет\s*\d*$/i.test(txt)) {
          textBeforeEndPrompt.push(txt);
        }
      }

      // Очищаем от заглушек и коротких служебных строк
      const bannedPatterns = [
        /^Цвет товара/i,
        /^Название цвета/i,
        /^Российский размер/i,
        /^Размер производителя/i,
        /^Ответить$/i,
        /^\d{1,2}:\d{2}$/, // время
      ];

      const cleanCommentParts = textBeforeEndPrompt.filter(
        (txt) => txt.length >= 1 && !bannedPatterns.some((pattern) => pattern.test(txt))
      );

      comment = cleanCommentParts.join(' ').trim();

      // === Если комментарий пустой, но есть кнопка открытия галереи с изображением ===
      if (!comment) {
        const galleryButton = block.querySelector('button[aria-label="Открыть галерею"]');
        if (galleryButton) {
          comment = 'Пользователь загрузил изображение. Текст отсутствует.';
        }
      }

      // === Рейтинг ===
      const starSvgs = Array.from(block.querySelectorAll('svg')).slice(0, 5);

      if (starSvgs.length >= 1) {
        const firstStyle = starSvgs[0].getAttribute('style') || '';
        rating = 5;

        for (let i = 1; i < starSvgs.length; i++) {
          const currentStyle = starSvgs[i].getAttribute('style') || '';
          if (currentStyle !== firstStyle) {
            rating = i;
            break;
          }
        }
      }

      // === Режим onlyTextStrict: остановка при пустом комментарии ===
      if (mode === '3' && !comment) {
        warnWithCapture('⛔ Пустой комментарий. Останавливаем парсинг.');
        return reviews;
      }

      // === Режим onlyTextToExcel: сохраняем только с текстом ===
      if (mode === '2' && !comment) {
        continue;
      }

      reviews.push({
        user,
        product,
        rating,
        comment: comment || 'Нет текста',
        date,
      });
    } catch (err) {
      console.error(`⚠️ Ошибка при обработке отзыва #${index + 1}:`, err);
    }
  }

  return reviews;
}

module.exports = { extractReviewsFromHtml };
