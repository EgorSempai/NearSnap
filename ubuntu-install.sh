#!/bin/bash

# 🐧 Автоматическая установка NearSap на Ubuntu
# Версия: 1.0

set -e

echo "🚀 Начинаем установку NearSap на Ubuntu..."
echo "================================================"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Проверка прав root
if [[ $EUID -eq 0 ]]; then
   error "Не запускайте этот скрипт от root! Используйте обычного пользователя с sudo."
fi

# Проверка Ubuntu
if ! grep -q "Ubuntu" /etc/os-release; then
    warn "Этот скрипт предназначен для Ubuntu. Продолжить? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

log "Шаг 1/8: Обновление системы..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip software-properties-common build-essential

log "Шаг 2/8: Установка Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    log "Node.js уже установлен: $(node --version)"
fi

log "Шаг 3/8: Установка PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    log "Настройка автозапуска PM2..."
    sudo pm2 startup
else
    log "PM2 уже установлен"
fi

log "Шаг 4/8: Клонирование проекта..."
if [ -d "nearsap" ]; then
    warn "Папка nearsap уже существует. Обновить? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        cd nearsap
        git pull
        cd ..
    fi
else
    # Если у вас есть репозиторий, замените URL
    log "Создаем папку проекта..."
    mkdir -p nearsap
    
    # Копируем файлы (если запускаем из папки с проектом)
    if [ -f "package.json" ]; then
        cp -r . nearsap/
        log "Файлы проекта скопированы"
    else
        error "Файлы проекта не найдены. Запустите скрипт из папки с проектом."
    fi
fi

cd nearsap

log "Шаг 5/8: Установка зависимостей..."
npm install

log "Шаг 6/8: Настройка окружения..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log "Создан файл .env из .env.example"
    else
        cat > .env << EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DOMAIN=localhost
SSL_ENABLED=false
LOG_LEVEL=info
EOF
        log "Создан базовый файл .env"
    fi
else
    log "Файл .env уже существует"
fi

log "Шаг 7/8: Настройка файрвола..."
if command -v ufw &> /dev/null; then
    sudo ufw allow ssh
    sudo ufw allow 80
    sudo ufw allow 443
    sudo ufw allow 3000
    
    # Проверяем, включен ли ufw
    if ! sudo ufw status | grep -q "Status: active"; then
        warn "Включить файрвол UFW? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            sudo ufw --force enable
        fi
    fi
else
    warn "UFW не установлен. Настройте файрвол вручную."
fi

log "Шаг 8/8: Запуск приложения..."
if pm2 list | grep -q "nearsap"; then
    log "Перезапускаем существующий процесс..."
    pm2 restart nearsap
else
    log "Запускаем новый процесс..."
    pm2 start ecosystem.config.js --env production
fi

# Сохраняем конфигурацию PM2
pm2 save

echo ""
echo "🎉 Установка завершена!"
echo "================================================"
log "Приложение запущено на порту 3000"
log "Локальный доступ: http://localhost:3000"

# Определяем IP сервера
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "unknown")
if [ "$SERVER_IP" != "unknown" ]; then
    log "Внешний доступ: http://$SERVER_IP:3000"
fi

echo ""
echo "📋 Полезные команды:"
echo "  pm2 status          - статус процессов"
echo "  pm2 logs nearsap    - просмотр логов"
echo "  pm2 restart nearsap - перезапуск"
echo "  pm2 monit          - мониторинг"
echo ""

# Проверяем, установлен ли Nginx
if command -v nginx &> /dev/null; then
    log "Nginx обнаружен. Хотите настроить прокси? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Введите ваш домен (или нажмите Enter для пропуска):"
        read -r domain
        
        if [ -n "$domain" ]; then
            log "Создаем конфигурацию Nginx для $domain..."
            
            sudo tee /etc/nginx/sites-available/nearsap > /dev/null << EOF
server {
    listen 80;
    server_name $domain www.$domain;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
            
            sudo ln -sf /etc/nginx/sites-available/nearsap /etc/nginx/sites-enabled/
            sudo rm -f /etc/nginx/sites-enabled/default
            
            if sudo nginx -t; then
                sudo systemctl restart nginx
                log "Nginx настроен! Доступ: http://$domain"
                
                # Предлагаем SSL
                if command -v certbot &> /dev/null; then
                    warn "Установить SSL сертификат? (y/N)"
                    read -r ssl_response
                    if [[ "$ssl_response" =~ ^[Yy]$ ]]; then
                        sudo certbot --nginx -d "$domain" -d "www.$domain"
                    fi
                else
                    log "Для SSL установите certbot: sudo apt install certbot python3-certbot-nginx"
                fi
            else
                error "Ошибка в конфигурации Nginx"
            fi
        fi
    fi
else
    log "Для веб-доступа установите Nginx: sudo apt install nginx"
fi

echo ""
log "Установка завершена! Проверьте работу приложения."
log "Документация: UBUNTU_INSTALL.md"