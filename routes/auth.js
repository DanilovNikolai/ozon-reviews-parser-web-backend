const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma/prisma-client');
const { signToken } = require('../utils/jwt');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

// === Регистрация ===
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Введите email и пароль' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ success: false, error: 'Данный пользователь уже существует' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = signToken({ userId: user.id, role: user.role });

  res.cookie('accessToken', token, COOKIE_OPTIONS);

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
});

// === Логин ===
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Введите email и пароль' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ success: false, error: 'Неправильный email или пароль' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ success: false, error: 'Неправильный email или пароль' });
  }

  const token = signToken({ userId: user.id, role: user.role });

  res.cookie('accessToken', token, COOKIE_OPTIONS);

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
});

// === Текущий пользователь ===
router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) {
    return res.status(401).json({ success: false, error: 'Пользователь не найден' });
  }

  return res.json({ success: true, user });
});

// === Logout ===
router.post('/logout', (req, res) => {
  res.clearCookie('accessToken');
  return res.json({ success: true });
});

module.exports = router;
