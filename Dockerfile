# Базовый образ Node.js LTS
FROM node:20-slim

# Устанавливаем системные зависимости для Puppeteer / Chromium
RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates fonts-liberation libx11-xcb1 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 libxi6 libxtst6 \
    libnss3 libxrandr2 libasound2 libatk1.0-0 libcups2 libdrm2 libgbm1 \
    libpango-1.0-0 libpangocairo-1.0-0 libgtk-3-0 libxss1 lsb-release xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Создаём рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем весь проект
COPY . .

# Экспортируем порт приложения
EXPOSE 8080

# Переменные окружения (можно переопределить через .env)
ENV PORT=8080

# Команда запуска
CMD ["node", "app.js"]
