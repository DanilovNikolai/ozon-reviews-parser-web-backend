// Преобразование ссылки товара в ссылку с /reviews перед параметрами

function getReviewsUrl(productUrl) {
  const [base, params] = productUrl.split('?');
  if (params) {
    return `${base}reviews?${params}`;
  } else {
    return `${productUrl}reviews`;
  }
}

// Преобразование ссылки товара в ссылку с параметрами сортировки по низким оценкам
function getReviewsUrlWithSort(productUrl, sort) {
  const url = new URL(getReviewsUrl(productUrl));
  if (sort) url.searchParams.set('sort', sort);
  return url.toString();
}

module.exports = { getReviewsUrl, getReviewsUrlWithSort };
