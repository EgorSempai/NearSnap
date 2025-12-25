const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Загрузка переменных окружения
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const server = http.createServer(app);

// Настройка CORS для production
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : ["http://localhost:3000", "https://localhost:3000"];

const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? corsOrigins : "*",
    methods: ["GET", "POST"]
  }
});

// Хранение состояния в памяти
const rooms = new Map(); // roomId -> { users: Set(socketId), host: socketId }
const userMap = new Map(); // socketId -> { roomId, nickname }

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO обработчики
io.on('connection', (socket) => {
  console.log(`Пользователь подключился: ${socket.id}`);

  // Присоединение к комнате
  socket.on('join-room', (data) => {
    const { roomId, nickname, timezone } = data;
    
    // Проверяем лимит участников (максимум из переменной окружения или 6)
    const MAX_PARTICIPANTS = parseInt(process.env.MAX_PARTICIPANTS) || 6;
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        host: socket.id,
        locked: false
      });
    }

    const room = rooms.get(roomId);
    
    // Проверяем, не заблокирована ли комната
    if (room.locked && !room.users.has(socket.id)) {
      socket.emit('join-error', { 
        type: 'room-locked',
        message: 'Комната заблокирована для новых участников' 
      });
      return;
    }
    
    // Проверяем лимит участников
    if (room.users.size >= MAX_PARTICIPANTS && !room.users.has(socket.id)) {
      socket.emit('join-error', { 
        type: 'room-full',
        message: `Комната переполнена. Максимум участников: ${MAX_PARTICIPANTS}` 
      });
      return;
    }
    
    // Получаем список существующих пользователей
    const existingUsers = Array.from(room.users);
    
    // Добавляем пользователя в комнату
    room.users.add(socket.id);
    userMap.set(socket.id, { roomId, nickname, timezone: timezone || 'UTC' });
    
    // Присоединяемся к Socket.IO комнате
    socket.join(roomId);
    
    // Отправляем новому пользователю список существующих участников
    socket.emit('existing-users', existingUsers);
    
    // Уведомляем существующих пользователей о новом участнике
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      nickname: nickname,
      timezone: timezone || 'UTC'
    });
    
    // Отправляем информацию о комнате
    socket.emit('room-info', {
      roomId: roomId,
      host: room.host,
      isHost: socket.id === room.host,
      locked: room.locked || false,
      users: Array.from(room.users).map(userId => ({
        socketId: userId,
        nickname: userMap.get(userId)?.nickname || 'Unknown',
        timezone: userMap.get(userId)?.timezone || 'UTC'
      }))
    });

    console.log(`${nickname} (${socket.id}) присоединился к комнате ${roomId} (${room.users.size}/${MAX_PARTICIPANTS})`);
  });

  // Универсальное событие для WebRTC сигналинга
  socket.on('signal', (data) => {
    const { to, signal } = data;
    socket.to(to).emit('signal', {
      from: socket.id,
      signal: signal
    });
  });

  // Сообщения чата
  socket.on('chat-message', (data) => {
    const user = userMap.get(socket.id);
    if (user) {
      const messageData = {
        from: socket.id,
        nickname: user.nickname,
        message: data.message,
        timestamp: new Date().toISOString()
      };
      
      // Отправляем сообщение всем в комнате
      io.to(user.roomId).emit('chat-message', messageData);
      console.log(`Сообщение от ${user.nickname}: ${data.message}`);
    }
  });

  // Звуковые эффекты
  socket.on('play-sound', (data) => {
    const user = userMap.get(socket.id);
    if (user) {
      // Отправляем звук всем остальным в комнате
      socket.to(user.roomId).emit('play-sound', {
        sound: data.sound,
        nickname: user.nickname
      });
      console.log(`${user.nickname} проиграл звук: ${data.sound}`);
    }
  });

  // Индикатор печати
  socket.on('user-typing', (data) => {
    const user = userMap.get(socket.id);
    if (user && user.roomId === data.roomId) {
      socket.to(user.roomId).emit('user-typing', {
        socketId: socket.id,
        nickname: user.nickname
      });
    }
  });

  socket.on('user-stop-typing', (data) => {
    const user = userMap.get(socket.id);
    if (user && user.roomId === data.roomId) {
      socket.to(user.roomId).emit('user-stop-typing', {
        socketId: socket.id,
        nickname: user.nickname
      });
    }
  });

  // Кик пользователя (только для хоста с проверкой на сервере)
  socket.on('kick-user', (data) => {
    const user = userMap.get(socket.id);
    if (!user) return;
    
    const room = rooms.get(user.roomId);
    if (!room) return;
    
    // КРИТИЧЕСКИ ВАЖНО: Проверяем, что отправитель действительно хост
    if (room.host !== socket.id) {
      console.warn(`Попытка кика не от хоста: ${socket.id} пытался кикнуть в комнате ${user.roomId}`);
      socket.emit('error', { message: 'У вас нет прав для этого действия' });
      return;
    }
    
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      const targetUser = userMap.get(data.targetId);
      console.log(`Хост ${user.nickname} кикнул ${targetUser?.nickname || 'Unknown'} из комнаты ${user.roomId}`);
      
      targetSocket.emit('kicked', { 
        reason: 'Вы были исключены из комнаты хостом',
        hostNickname: user.nickname 
      });
      targetSocket.disconnect();
    }
  });

  // Админ-действия (расширенная версия)
  socket.on('admin-action', (data) => {
    const user = userMap.get(socket.id);
    if (!user) return;
    
    const room = rooms.get(user.roomId);
    if (!room || room.host !== socket.id) {
      socket.emit('error', { message: 'У вас нет прав администратора' });
      return;
    }
    
    const { action, targetId, reason } = data;
    
    switch (action) {
      case 'kick':
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) {
          const targetUser = userMap.get(targetId);
          console.log(`Админ-действие: ${user.nickname} кикнул ${targetUser?.nickname || 'Unknown'}`);
          
          targetSocket.emit('kicked', { 
            reason: reason || 'Вы были исключены из комнаты администратором',
            hostNickname: user.nickname 
          });
          targetSocket.disconnect();
        }
        break;
        
      case 'mute-all':
        // Отправляем команду всем участникам заглушить микрофоны
        socket.to(user.roomId).emit('admin-mute-all', {
          hostNickname: user.nickname
        });
        console.log(`Админ-действие: ${user.nickname} заглушил всех в комнате ${user.roomId}`);
        break;
        
      case 'room-lock':
        // Блокируем комнату от новых участников
        room.locked = data.locked;
        io.to(user.roomId).emit('room-status', {
          locked: room.locked,
          hostNickname: user.nickname
        });
        console.log(`Админ-действие: ${user.nickname} ${room.locked ? 'заблокировал' : 'разблокировал'} комнату`);
        break;
        
      case 'nudge-all':
        // Отправляем "постучать" всем участникам
        socket.to(user.roomId).emit('nudge', {
          hostNickname: user.nickname
        });
        console.log(`Админ-действие: ${user.nickname} постучал всем в комнате ${user.roomId}`);
        break;
        
      default:
        socket.emit('error', { message: 'Неизвестное админ-действие' });
    }
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    const user = userMap.get(socket.id);
    if (user) {
      const room = rooms.get(user.roomId);
      if (room) {
        // Удаляем пользователя из комнаты
        room.users.delete(socket.id);
        
        // Если это был хост, передаем права следующему участнику
        if (room.host === socket.id && room.users.size > 0) {
          const newHost = Array.from(room.users)[0];
          room.host = newHost;
          
          // Уведомляем о новом хосте
          io.to(user.roomId).emit('new-host', {
            hostId: newHost,
            hostNickname: userMap.get(newHost)?.nickname || 'Unknown'
          });
        }
        
        // Если комната пуста, удаляем её
        if (room.users.size === 0) {
          rooms.delete(user.roomId);
        } else {
          // Уведомляем остальных об отключении
          socket.to(user.roomId).emit('user-left', {
            socketId: socket.id,
            nickname: user.nickname
          });
        }
      }
      
      userMap.delete(socket.id);
      console.log(`${user.nickname} (${socket.id}) отключился`);
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 NearSnap сервер запущен на ${HOST}:${PORT}`);
  console.log(`📱 Откройте http://localhost:${PORT} в браузере`);
  console.log(`🌍 Режим: ${process.env.NODE_ENV || 'development'}`);
});