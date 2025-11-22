# Node LTS
FROM node:20-slim

# 1) Системные зависимости для Chrome/Puppeteer + Xvfb для headful-режима
RUN apt-get update && apt-get install -y \
    xvfb xauth \
    ca-certificates curl gnupg fonts-liberation \
    libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxi6 libxtst6 \
    libnss3 libxrandr2 libasound2 libatk1.0-0 libcups2 libdrm2 libgbm1 \
    libpango-1.0-0 libpangocairo-1.0-0 libgtk-3-0 libxss1 lsb-release xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# 2) Рабочая директория
WORKDIR /app

# 3) Устанавливаем зависимости проекта (puppeteer подтянет Chromium)
COPY package*.json ./
RUN npm install

# 4) Копируем исходники
COPY . .

# 5) Экспорт порта
EXPOSE 8080

# 5.1) Persistent Chrome profile
RUN mkdir -p /app/chrome-data

# 6) Запуск через Xvfb (виртуальный дисплей :99), чтобы headless:false работал
#   -screen 0 1920x1080x24 — создаём экран 1920x1080, глубина 24
CMD bash -lc "xvfb-run -a -s \"-screen 0 1920x1080x24\" node app.js"

