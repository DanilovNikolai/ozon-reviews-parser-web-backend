const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma/prisma-client');
const { signToken } = require('../utils/jwt');

const router = express.Router();

// === Регистрация ===
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ success: false, error: 'User already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = signToken({ userId: user.id, role: user.role });

  res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

// === Логин ===
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const token = signToken({ userId: user.id, role: user.role });

  res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

module.exports = router;
