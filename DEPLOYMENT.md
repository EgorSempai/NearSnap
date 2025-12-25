# 🚀 Развертывание NearSap на сервере

## Важно! Требования HTTPS

⚠️ **КРИТИЧЕСКИ ВАЖНО**: Для работы камеры и микрофона вне localhost браузеры **требуют HTTPS соединение**. Это требование безопасности, которое нельзя обойти.

## Варианты развертывания

### 1. 🔷 VPS/Dedicated Server (Рекомендуется)

#### Требования:
- Ubuntu 20.04+ / Debian 10+ / CentOS 8+
- Node.js 16+
- Nginx (для HTTPS)
- Домен с DNS записями
- Минимум 1GB RAM

#### Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка Nginx
sudo apt install -y nginx

# Установка Certbot для SSL
sudo apt install -y certbot python3-certbot-nginx

# Установка PM2 для управления процессом
sudo npm install -g pm2
```

#### Шаг 2: Загрузка проекта

```bash
# Создание директории
sudo mkdir -p /var/www/nearsap
cd /var/www/nearsap

# Клонирование проекта (или загрузка через FTP/SCP)
# Если у вас есть Git репозиторий:
git clone https://github.com/your-username/nearsap.git .

# Или загрузите файлы через SCP:
# scp -r /path/to/nearsap/* user@your-server:/var/www/nearsap/

# Установка зависимостей
npm install

# Установка прав
sudo chown -R $USER:$USER /var/www/nearsap
```

#### Шаг 3: Настройка Nginx

```bash
# Создание конфигурации Nginx
sudo nano /etc/nginx/sites-available/nearsap
```

Вставьте следующую конфигурацию:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket поддержка для Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Активация конфигурации
sudo ln -s /etc/nginx/sites-available/nearsap /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
```

#### Шаг 4: Получение SSL сертификата

```bash
# Получение бесплатного SSL от Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Certbot автоматически настроит HTTPS и перенаправление
```

#### Шаг 5: Запуск приложения с PM2

```bash
cd /var/www/nearsap

# Запуск приложения
pm2 start server.js --name nearsap

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save

# Просмотр логов
pm2 logs nearsap

# Мониторинг
pm2 monit
```

#### Шаг 6: Настройка файрвола

```bash
# Разрешение HTTP и HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

### 2. 🟦 Heroku (Простое развертывание)

#### Шаг 1: Подготовка проекта

Создайте файл `Procfile` в корне проекта:

```
web: node server.js
```

Обновите `package.json`:

```json
{
  "engines": {
    "node": "18.x",
    "npm": "9.x"
  },
  "scripts": {
    "start": "node server.js"
  }
}
```

#### Шаг 2: Развертывание

```bash
# Установка Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Вход в Heroku
heroku login

# Создание приложения
heroku create nearsap-app

# Развертывание
git init
git add .
git commit -m "Initial commit"
git push heroku main

# Открытие приложения
heroku open
```

**Важно**: Heroku автоматически предоставляет HTTPS!

---

### 3. 🟩 DigitalOcean App Platform

#### Через веб-интерфейс:

1. Зайдите на https://cloud.digitalocean.com/apps
2. Нажмите "Create App"
3. Подключите GitHub репозиторий или загрузите код
4. Выберите Node.js
5. Настройте:
   - Build Command: `npm install`
   - Run Command: `npm start`
   - Port: 3000
6. Нажмите "Deploy"

**Важно**: DigitalOcean автоматически предоставляет HTTPS!

---

### 4. 🔶 AWS EC2

#### Шаг 1: Создание EC2 инстанса

1. Зайдите в AWS Console
2. Создайте EC2 инстанс (Ubuntu 20.04)
3. Настройте Security Group:
   - SSH (22)
   - HTTP (80)
   - HTTPS (443)
   - Custom TCP (3000) - для разработки

#### Шаг 2: Подключение и настройка

```bash
# Подключение к серверу
ssh -i your-key.pem ubuntu@your-ec2-ip

# Следуйте инструкциям из раздела VPS выше
```

#### Шаг 3: Настройка домена

1. Создайте Elastic IP в AWS
2. Привяжите к EC2 инстансу
3. Настройте DNS записи домена на Elastic IP

---

### 5. 🟪 Docker (Контейнеризация)

#### Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

#### Создайте `docker-compose.yml`:

```yaml
version: '3.8'

services:
  nearsap:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
```

#### Запуск:

```bash
# Сборка и запуск
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

---

### 6. 🌐 Cloudflare Tunnel (Бесплатно!)

Самый простой способ получить HTTPS без настройки сервера!

#### Шаг 1: Установка cloudflared

```bash
# Windows
# Скачайте с https://github.com/cloudflare/cloudflared/releases

# Linux
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

#### Шаг 2: Запуск туннеля

```bash
# Запуск приложения
npm start

# В другом терминале запустите туннель
cloudflared tunnel --url http://localhost:3000
```

Вы получите публичный HTTPS URL вида: `https://random-name.trycloudflare.com`

**Преимущества**:
- ✅ Бесплатно
- ✅ Автоматический HTTPS
- ✅ Не нужен домен
- ✅ Работает за NAT/файрволом

---

## 🔧 Переменные окружения

Создайте файл `.env` для production:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

Обновите `server.js`:

```javascript
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 NearSap сервер запущен на ${HOST}:${PORT}`);
});
```

---

## 📊 Мониторинг и логирование

### PM2 мониторинг:

```bash
# Установка PM2 Plus (бесплатный мониторинг)
pm2 install pm2-logrotate

# Настройка ротации логов
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Nginx логи:

```bash
# Просмотр логов доступа
sudo tail -f /var/log/nginx/access.log

# Просмотр логов ошибок
sudo tail -f /var/log/nginx/error.log
```

---

## 🔒 Безопасность

### 1. Настройка файрвола

```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 2. Обновление зависимостей

```bash
# Проверка уязвимостей
npm audit

# Автоматическое исправление
npm audit fix
```

### 3. Ограничение rate limiting

Добавьте в Nginx конфигурацию:

```nginx
limit_req_zone $binary_remote_addr zone=nearsap:10m rate=10r/s;

server {
    location / {
        limit_req zone=nearsap burst=20;
        # ... остальная конфигурация
    }
}
```

---

## 🎯 Рекомендации по выбору

| Вариант | Сложность | Стоимость | HTTPS | Рекомендуется для |
|---------|-----------|-----------|-------|-------------------|
| **VPS + Nginx** | ⭐⭐⭐ | $5-20/мес | ✅ | Production |
| **Heroku** | ⭐ | $7/мес | ✅ | Быстрый старт |
| **DigitalOcean** | ⭐⭐ | $5/мес | ✅ | Простота + контроль |
| **AWS EC2** | ⭐⭐⭐⭐ | $5-50/мес | ✅ | Масштабируемость |
| **Docker** | ⭐⭐⭐ | Зависит | ⚠️ | Контейнеризация |
| **Cloudflare Tunnel** | ⭐ | Бесплатно | ✅ | Тестирование |

---

## 🚀 Быстрый старт (Рекомендуется)

Для быстрого развертывания используйте **Cloudflare Tunnel**:

```bash
# 1. Запустите приложение
npm start

# 2. В другом терминале
cloudflared tunnel --url http://localhost:3000

# 3. Получите публичный HTTPS URL
# Готово! Делитесь ссылкой с друзьями
```

Для production используйте **VPS + Nginx + Let's Encrypt** - это самый надежный и профессиональный вариант.

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи: `pm2 logs nearsap`
2. Проверьте статус: `pm2 status`
3. Проверьте Nginx: `sudo nginx -t`
4. Проверьте файрвол: `sudo ufw status`

Удачного развертывания! 🎉
