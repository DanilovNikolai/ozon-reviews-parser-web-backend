// Рекурсивно проходит по вложенностям отзывов и находит текст

function extractTextNodes(element, texts = []) {
  for (const node of element.childNodes) {
    if (node.nodeType === 3) {
      const text = node.textContent.trim();
      if (text) texts.push(text);
    } else if (node.nodeType === 1) {
      extractTextNodes(node, texts);
    }
  }
  return texts;
}

module.exports = { extractTextNodes };
