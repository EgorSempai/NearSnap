@echo off
REM Скрипт запуска туннеля для Windows
setlocal

echo 🌐 Запуск туннеля для NearSap...
echo.

REM Проверяем, запущен ли сервер
echo 🔍 Проверяем, запущен ли сервер на порту 3000...
netstat -an | findstr :3000 >nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Сервер не запущен на порту 3000
    echo 🚀 Запустите сначала: npm start
    echo.
    pause
    exit /b 1
)

echo ✅ Сервер работает на порту 3000
echo.

REM Проверяем DNS
echo 🔍 Проверяем DNS соединение...
ping -n 1 1.1.1.1 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Проблемы с интернет соединением
    echo 💡 Проверьте подключение к интернету
    echo.
)

echo 🔄 Попытка 1: Cloudflare Tunnel (быстрая проверка)
timeout /t 3 /nobreak >nul
npx cloudflared tunnel --url http://localhost:3000 --region auto --retries 1 --edge-ip-version 4 2>nul

if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Cloudflare Tunnel недоступен (DNS проблема)
    echo 🔄 Переходим к альтернативам...
    goto :try_alternatives
)

if %ERRORLEVEL% NEQ 0 (
    :try_alternatives
    echo.
    echo ❌ Cloudflare Tunnel недоступен (DNS проблема)
    echo 💡 Используем альтернативные решения...
    echo.
    
    REM Проверяем ngrok
    where ngrok >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo 🔄 Попытка 2: Ngrok (рекомендуется установить)
        echo 📦 Установите ngrok: npm install -g ngrok
        echo 🌐 Или скачайте: https://ngrok.com/download
        echo.
        ngrok http 3000
    ) else (
        echo 🔄 Попытка 2: LocalTunnel (автоустановка)
        echo 📦 Устанавливаем localtunnel...
        call npx localtunnel --port 3000 --subdomain nearsap-%RANDOM%
        
        if %ERRORLEVEL% NEQ 0 (
            echo.
            echo 🔄 Попытка 3: Serveo (SSH туннель)
            echo 💡 Если у вас есть SSH клиент:
            echo ssh -R 80:localhost:3000 serveo.net
            echo.
            echo ❌ Все автоматические туннели недоступны
            echo.
            echo 💡 Ручные решения:
            echo    1. Установите ngrok: https://ngrok.com/download
            echo    2. Используйте VPN для обхода блокировок
            echo    3. Попробуйте мобильный интернет
            echo    4. Настройте port forwarding на роутере
            echo    5. Используйте облачный сервер (VPS)
            echo.
            echo 🌐 Локальный доступ: http://localhost:3000
            echo.
            pause
        )
    )
)

endlocal