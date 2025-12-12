require('dotenv').config();

const prisma = require('./prisma-client');
const bcrypt = require('bcrypt');

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'example';

  // Проверяем, существует ли admin
  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('Создан администратор:', user.id);
  } else {
    console.log('Admin уже существует — пропускаем');
  }
}

main()
  .catch((e) => {
    console.error('Ошибка в seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
