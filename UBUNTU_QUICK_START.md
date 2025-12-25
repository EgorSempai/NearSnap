# 🐧 Ubuntu - Быстрый старт

## ⚡ Автоматическая установка (5 минут)

```bash
# 1. Скачайте проект
git clone <your-repo-url> nearsap
cd nearsap

# 2. Запустите автоустановку
chmod +x ubuntu-install.sh
./ubuntu-install.sh

# 3. Готово! Приложение работает на порту 3000
```

## 🔧 Ручная установка (10 минут)

### Шаг 1: Подготовка системы
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nodejs npm
```

### Шаг 2: Установка PM2
```bash
sudo npm install -g pm2
```

### Шаг 3: Настройка проекта
```bash
cd nearsap
npm install
cp .env.example .env
```

### Шаг 4: Запуск
```bash
pm2 start ecosystem.config.js --env production
pm2 startup
pm2 save
```

## 🌐 Настройка веб-доступа

### С Nginx (рекомендуется)
```bash
# Установка
sudo apt install nginx

# Конфигурация
sudo nano /etc/nginx/sites-available/nearsap
```

Добавьте:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Активация
sudo ln -s /etc/nginx/sites-available/nearsap /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### SSL сертификат
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🔥 Файрвол
```bash
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 📊 Управление

### Полезные команды
```bash
pm2 status          # Статус процессов
pm2 logs nearsap    # Просмотр логов
pm2 restart nearsap # Перезапуск
pm2 monit          # Мониторинг ресурсов
```

### Обновление приложения
```bash
cd nearsap
git pull
npm install
pm2 restart nearsap
```

## 🎯 Результат

После установки ваш NearSap доступен по адресу:
- **Локально:** http://localhost:3000
- **По IP:** http://your-server-ip:3000  
- **По домену:** http://your-domain.com (с Nginx)
- **HTTPS:** https://your-domain.com (с SSL)

## 🆘 Помощь

При проблемах смотрите:
- [UBUNTU_INSTALL.md](UBUNTU_INSTALL.md) - подробная инструкция
- [DEPLOYMENT.md](DEPLOYMENT.md) - общее руководство
- [TUNNEL_TROUBLESHOOTING.md](TUNNEL_TROUBLESHOOTING.md) - решение проблем

**Время установки:** 5-15 минут  
**Сложность:** Легко 🟢