@echo off
echo 🧪 Тестирование туннельных решений...
echo.

echo 📋 Доступные команды для туннелирования:
echo.
echo 1. npm run tunnel          - Cloudflare Tunnel (основной)
echo 2. npm run tunnel:stable   - Cloudflare Tunnel (стабильный)
echo 3. npm run tunnel:ngrok    - Ngrok (требует установки)
echo 4. npm run tunnel:lt       - LocalTunnel (автоустановка)
echo 5. .\tunnel.bat           - Автоматический выбор
echo.

echo 💡 Рекомендации при проблемах с DNS:
echo.
echo - Измените DNS на 1.1.1.1 или 8.8.8.8
echo - Отключите антивирус/файрвол временно
echo - Попробуйте мобильный интернет
echo - Используйте VPN если в корпоративной сети
echo.

echo 🔧 Для смены DNS в Windows:
echo netsh interface ip set dns "Ethernet" static 1.1.1.1
echo netsh interface ip add dns "Ethernet" 1.0.0.1 index=2
echo.

pause