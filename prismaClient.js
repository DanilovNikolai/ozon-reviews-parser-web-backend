require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PgAdapter } = require('@prisma/adapter-pg');

// Передаём адаптер с прямой строкой из env
const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DIRECT_DATABASE_URL (или DATABASE_URL) не задана в .env');
}

const adapter = new PgAdapter(dbUrl);

// предотвращаем множественные подключение в dev (hot reload)
const globalAny = global;
globalAny.prisma = globalAny.prisma || new PrismaClient({ adapter });

module.exports = globalAny.prisma;
