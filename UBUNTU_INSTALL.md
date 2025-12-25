# 🐧 Установка NearSap на Ubuntu Server

## 🚀 Быстрая установка (одной командой)

```bash
# Скачайте и запустите автоматический скрипт
curl -fsSL https://raw.githubusercontent.com/your-repo/nearsap/main/deploy.sh | bash
```

## 📋 Пошаговая установка

### 1. Обновление системы

```bash
# Обновляем пакеты
sudo apt update && sudo apt upgrade -y

# Устанавливаем необходимые утилиты
sudo apt install -y curl wget git unzip software-properties-common
```

### 2. Установка Node.js

```bash
# Добавляем официальный репозиторий Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Устанавливаем Node.js
sudo apt install -y nodejs

# Проверяем версии
node --version  # должно быть v18+
npm --version
```

### 3. Установка PM2 (менеджер процессов)

```bash
# Устанавливаем PM2 глобально
sudo npm install -g pm2

# Настраиваем автозапуск
sudo pm2 startup
```

### 4. Клонирование проекта

```bash
# Переходим в домашнюю директорию
cd ~

# Клонируем репозиторий (замените на ваш URL)
git clone https://github.com/your-username/nearsap.git

# Переходим в папку проекта
cd nearsap
```

### 5. Установка зависимостей

```bash
# Устанавливаем зависимости проекта
npm install

# Создаем файл окружения
cp .env.example .env
```

### 6. Настройка окружения

```bash
# Редактируем файл .env
nano .env
```

Настройте следующие параметры:

```env
# Основные настройки
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Домен вашего сервера
DOMAIN=your-domain.com

# SSL настройки (если используете HTTPS)
SSL_ENABLED=false
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem

# Логирование
LOG_LEVEL=info
LOG_FILE=/var/log/nearsap.log
```

### 7. Настройка файрвола

```bash
# Разрешаем SSH (если еще не разрешен)
sudo ufw allow ssh

# Разрешаем HTTP и HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Разрешаем порт приложения (если нужен прямой доступ)
sudo ufw allow 3000

# Включаем файрвол
sudo ufw enable

# Проверяем статус
sudo ufw status
```

### 8. Запуск приложения

```bash
# Запускаем через PM2
npm run pm2:start

# Проверяем статус
pm2 status

# Смотрим логи
pm2 logs nearsap
```

## 🌐 Настройка веб-сервера (Nginx)

### Установка Nginx

```bash
# Устанавливаем Nginx
sudo apt install -y nginx

# Запускаем и включаем автозапуск
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Настройка виртуального хоста

```bash
# Создаем конфигурацию сайта
sudo nano /etc/nginx/sites-available/nearsap
```

Добавьте следующую конфигурацию:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Перенаправление на HTTPS (если используете SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebRTC и Socket.IO настройки
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Server $host;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Статические файлы
    location /css/ {
        alias /home/ubuntu/nearsap/public/css/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /js/ {
        alias /home/ubuntu/nearsap/public/js/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /images/ {
        alias /home/ubuntu/nearsap/public/images/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Активация сайта

```bash
# Создаем символическую ссылку
sudo ln -s /etc/nginx/sites-available/nearsap /etc/nginx/sites-enabled/

# Удаляем дефолтный сайт
sudo rm /etc/nginx/sites-enabled/default

# Проверяем конфигурацию
sudo nginx -t

# Перезапускаем Nginx
sudo systemctl restart nginx
```

## 🔒 Настройка SSL (Let's Encrypt)

```bash
# Устанавливаем Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получаем SSL сертификат
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Проверяем автообновление
sudo certbot renew --dry-run
```

## 📊 Мониторинг и логи

### Просмотр логов

```bash
# Логи приложения
pm2 logs nearsap

# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Системные логи
sudo journalctl -u nginx -f
```

### Мониторинг ресурсов

```bash
# Мониторинг PM2
pm2 monit

# Использование ресурсов
htop
df -h
free -h
```

## 🔧 Полезные команды

### Управление приложением

```bash
# Перезапуск
pm2 restart nearsap

# Остановка
pm2 stop nearsap

# Удаление из PM2
pm2 delete nearsap

# Обновление кода
cd ~/nearsap
git pull
npm install
pm2 restart nearsap
```

### Управление Nginx

```bash
# Перезапуск
sudo systemctl restart nginx

# Перезагрузка конфигурации
sudo systemctl reload nginx

# Проверка статуса
sudo systemctl status nginx
```

## 🚨 Устранение неполадок

### Проверка портов

```bash
# Проверяем, что приложение слушает порт
sudo netstat -tlnp | grep :3000

# Проверяем Nginx
sudo netstat -tlnp | grep :80
```

### Проверка процессов

```bash
# Статус PM2
pm2 status

# Процессы Node.js
ps aux | grep node
```

### Проверка логов на ошибки

```bash
# Последние ошибки приложения
pm2 logs nearsap --err

# Ошибки Nginx
sudo tail -n 50 /var/log/nginx/error.log
```

## 🎯 Автоматическое развертывание

Создайте скрипт `update.sh`:

```bash
#!/bin/bash
cd ~/nearsap
git pull
npm install
pm2 restart nearsap
sudo systemctl reload nginx
echo "✅ Приложение обновлено!"
```

Сделайте его исполняемым:

```bash
chmod +x update.sh
```

## 📋 Чеклист установки

- [ ] Обновлена система Ubuntu
- [ ] Установлен Node.js 18+
- [ ] Установлен PM2
- [ ] Склонирован репозиторий
- [ ] Установлены зависимости
- [ ] Настроен .env файл
- [ ] Настроен файрвол
- [ ] Запущено приложение через PM2
- [ ] Установлен и настроен Nginx
- [ ] Настроен SSL (опционально)
- [ ] Проверена работа сайта

## 🌍 Доступ к приложению

После успешной установки ваш NearSap будет доступен по адресу:

- **HTTP:** `http://your-domain.com`
- **HTTPS:** `https://your-domain.com` (если настроен SSL)
- **IP:** `http://your-server-ip` (если нет домена)

## 🎉 Готово!

Ваш видеочат NearSap теперь работает на Ubuntu сервере! 

Для получения помощи обращайтесь к документации в файлах:
- `DEPLOYMENT.md` - общее руководство по развертыванию
- `QUICK_START.md` - быстрый старт
- `TUNNEL_TROUBLESHOOTING.md` - решение проблем с туннелированием