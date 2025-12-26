// PM2 конфигурация для production - Zloer
module.exports = {
  apps: [{
    name: 'zloer',
    script: 'server.js',
    instances: 'max', // Используем все CPU ядра
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Автоперезапуск при изменениях файлов (только для разработки)
    watch: false,
    // Игнорируемые файлы/папки
    ignore_watch: ['node_modules', 'logs', '.git'],
    // Логирование
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Ограничения памяти
    max_memory_restart: '500M',
    // Автоперезапуск при сбоях
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Graceful shutdown
    kill_timeout: 5000,
    // Мониторинг
    monitoring: false
  }]
};