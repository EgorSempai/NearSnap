@echo off
echo 🚀 Простое туннелирование для NearSap
echo.

REM Проверяем сервер
netstat -an | findstr :3000 >nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Сервер не запущен на порту 3000
    echo 🚀 Запустите: npm start
    pause
    exit /b 1
)

echo ✅ Сервер работает на localhost:3000
echo.

echo 🔄 Попытка 1: LocalTunnel (самый простой)
echo 📦 Автоматическая установка...
call npx --yes localtunnel --port 3000

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 🔄 Попытка 2: Bore (современная альтернатива)
    echo 📦 Установка через npm...
    call npx --yes @bore/cli 3000
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo 💡 Альтернативные решения:
        echo.
        echo 1. Ngrok (рекомендуется):
        echo    - Скачайте: https://ngrok.com/download
        echo    - Установите: npm install -g ngrok
        echo    - Запустите: ngrok http 3000
        echo.
        echo 2. SSH туннель (если доступен):
        echo    ssh -R 80:localhost:3000 serveo.net
        echo.
        echo 3. Облачное развертывание:
        echo    - Heroku: git push heroku main
        echo    - Vercel: vercel --prod
        echo    - Railway: railway up
        echo.
        echo 4. Локальная сеть:
        echo    - Найдите IP: ipconfig
        echo    - Откройте порт в роутере: 3000
        echo    - Доступ: http://ВАШ_IP:3000
        echo.
        pause
    )
)