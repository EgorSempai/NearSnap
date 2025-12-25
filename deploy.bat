@echo off
REM Скрипт быстрого развертывания NearSap для Windows
REM Использование: deploy.bat [production|development]

setlocal

set MODE=%1
if "%MODE%"=="" set MODE=development

echo 🚀 Развертывание NearSap в режиме: %MODE%

REM Проверка Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js не установлен. Установите Node.js 16+ и попробуйте снова.
    exit /b 1
)

echo ✅ Node.js установлен

REM Установка зависимостей
echo 📦 Установка зависимостей...
call npm install

REM Создание директории для логов
if not exist logs mkdir logs

REM Копирование файла окружения
if not exist .env (
    echo 📝 Создание файла .env...
    copy .env.example .env
    echo ⚠️  Не забудьте настроить переменные в файле .env
)

if "%MODE%"=="production" (
    echo 🏭 Настройка production окружения...
    
    REM Проверка PM2
    where pm2 >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo 📦 Установка PM2...
        call npm install -g pm2
    )
    
    REM Остановка предыдущего процесса
    call pm2 delete nearsap 2>nul
    
    REM Запуск с PM2
    echo 🚀 Запуск приложения с PM2...
    call pm2 start ecosystem.config.js --env production
    
    REM Сохранение конфигурации
    call pm2 save
    
    echo ✅ Приложение запущено в production режиме!
    echo 📊 Мониторинг: pm2 monit
    echo 📋 Логи: pm2 logs nearsap
    echo 🔄 Перезапуск: pm2 restart nearsap
    
) else (
    echo 🛠️  Запуск в режиме разработки...
    echo 📱 Откройте http://localhost:3000 в браузере
    echo ⚠️  Для работы камеры/микрофона вне localhost нужен HTTPS!
    echo.
    echo 🌐 Для быстрого HTTPS используйте Cloudflare Tunnel:
    echo    npx cloudflared tunnel --url http://localhost:3000
    echo.
    call npm start
)

endlocal