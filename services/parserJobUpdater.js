const prisma = require('../prisma/prisma-client');

async function updateParserJob(dbJobId, data) {
  if (!dbJobId) return;

  try {
    await prisma.parserJob.update({
      where: { id: dbJobId },
      data,
    });
  } catch (err) {
    console.error(`❌ Не удалось обновить ParserJob ${dbJobId}:`, err.message);
  }
}

module.exports = { updateParserJob };
