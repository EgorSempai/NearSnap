#!/bin/bash

# Скрипт быстрого развертывания NearSap
# Использование: ./deploy.sh [production|development]

set -e

MODE=${1:-development}
echo "🚀 Развертывание NearSap в режиме: $MODE"

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установите Node.js 16+ и попробуйте снова."
    exit 1
fi

# Проверка версии Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Требуется Node.js 16+. Текущая версия: $(node -v)"
    exit 1
fi

echo "✅ Node.js версия: $(node -v)"

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install

# Создание директории для логов
mkdir -p logs

# Копирование файла окружения
if [ ! -f .env ]; then
    echo "📝 Создание файла .env..."
    cp .env.example .env
    echo "⚠️  Не забудьте настроить переменные в файле .env"
fi

if [ "$MODE" = "production" ]; then
    echo "🏭 Настройка production окружения..."
    
    # Проверка PM2
    if ! command -v pm2 &> /dev/null; then
        echo "📦 Установка PM2..."
        npm install -g pm2
    fi
    
    # Остановка предыдущего процесса (если есть)
    pm2 delete nearsap 2>/dev/null || true
    
    # Запуск с PM2
    echo "🚀 Запуск приложения с PM2..."
    pm2 start ecosystem.config.js --env production
    
    # Сохранение конфигурации PM2
    pm2 save
    
    # Настройка автозапуска
    pm2 startup
    
    echo "✅ Приложение запущено в production режиме!"
    echo "📊 Мониторинг: pm2 monit"
    echo "📋 Логи: pm2 logs nearsap"
    echo "🔄 Перезапуск: pm2 restart nearsap"
    
else
    echo "🛠️  Запуск в режиме разработки..."
    echo "📱 Откройте http://localhost:3000 в браузере"
    echo "⚠️  Для работы камеры/микрофона вне localhost нужен HTTPS!"
    echo ""
    echo "🌐 Для быстрого HTTPS используйте Cloudflare Tunnel:"
    echo "   npx cloudflared tunnel --url http://localhost:3000"
    echo ""
    npm start
fi