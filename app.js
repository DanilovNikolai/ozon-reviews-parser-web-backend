const express = require('express');
const { logWithCapture } = require('./utils');
const parserRoutes = require('./routes/parser');
const authRoutes = require('./routes/auth');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// === Подключение путей ===
app.use('/parse', parserRoutes);
app.use('/auth', authRoutes);

// === СТАРТ СЕРВЕРА ===
app.listen(process.env.PORT || 8080, () => {
  logWithCapture(`🟢 Parser started`);
});
