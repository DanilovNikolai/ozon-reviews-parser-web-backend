const express = require('express');
const { logWithCapture } = require('./utils');
const parserRoutes = require('./routes/parser');

const app = express();
app.use(express.json({ limit: '10mb' }));

// === Подключение путей из /routes ===
app.use('/parse', parserRoutes);

// === СТАРТ СЕРВЕРА ===
app.listen(process.env.PORT || 8080, () => {
  logWithCapture(`🟢 Parser started`);
});
