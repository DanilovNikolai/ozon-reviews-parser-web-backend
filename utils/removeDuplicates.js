function removeDuplicates(allRows, existingData = [], excelFileExists = true) {
  const existingSet = new Set(
    existingData.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]].join('||'))
  );

  const uniqueRows = [];
  let duplicateCount = 0;

  for (const r of allRows) {
    const key = [r[0], r[1], r[2], r[3], r[4], r[5]].join('||');

    const isMinimalRow = !r[1] && !r[2] && !r[3] && !r[4] && !r[5] && r[8];

    if (!existingSet.has(key) || isMinimalRow) {
      uniqueRows.push(r);
      if (!existingSet.has(key)) existingSet.add(key);
    } else {
      duplicateCount++;
    }
  }

  if (!excelFileExists) duplicateCount = 0;

  return { uniqueRows, duplicateCount };
}

module.exports = { removeDuplicates };
