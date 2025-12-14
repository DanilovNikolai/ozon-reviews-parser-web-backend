# Node LTS
FROM node:20-slim

# 1) Зависимости для Chromium + Xvfb
RUN apt-get update && apt-get install -y \
    xvfb xauth \
    ca-certificates curl gnupg fonts-liberation \
    libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxi6 libxtst6 \
    libnss3 libxrandr2 libasound2 libatk1.0-0 libcups2 libdrm2 libgbm1 \
    libpango-1.0-0 libpangocairo-1.0-0 libgtk-3-0 libxss1 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2️) Копируем всё (включая prisma/schema.prisma)
COPY . .

# 3️) Устанавливаем зависимости
RUN npm install

# 4️) Генерируем Prisma Client
RUN npx prisma generate

# 5) создаём постоянный профиль chromium
RUN mkdir -p /app/chrome-data

EXPOSE 8080

# Node — PID1
CMD ["bash", "-lc", "Xvfb :99 -screen 0 1920x1080x24 & export DISPLAY=:99 && node app.js"]
