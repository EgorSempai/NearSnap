// Zloer - Главный модуль видеочата для геймеров
// Connect. Play. Zloer - Детальная реализация с классами и геймерскими фичами

const SOCKET_URL = '/';

// ============================================================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ
// ============================================================================
class App {
  constructor() {
    // Инициализируем Socket.IO с лучшей обработкой ошибок
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });
    
    this.rtc = new WebRTCManager(this.socket);
    this.ui = new WindowManager(this);
    this.soundboard = new Soundboard(this.socket);
    this.audioSynth = new AudioSynth();
    this.modalManager = new ModalManager();
    
    this.roomId = null;
    this.nickname = null;
    this.isHost = false;
    
    this.initEvents();
    this.checkWebRTCSupport();
    this.initSocketErrorHandling();
  }

  initSocketErrorHandling() {
    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      this.ui.showNotification('Ошибка подключения к серверу', 'error');
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO connected successfully');
      this.ui.showNotification('Подключение установлено', 'success');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      this.ui.showNotification('Соединение потеряно. Переподключение...', 'warning');
    });
  }

  initEvents() {
    // Обработка перезагрузки страницы
    window.addEventListener('beforeunload', () => {
      if (this.socket.connected) {
        this.socket.disconnect();
      }
      this.rtc.cleanup();
    });

    // Обработка потери соединения
    this.socket.on('disconnect', () => {
      this.ui.showNotification('Соединение потеряно. Переподключение...', 'warning');
      this.audioSynth.playError();
    });

    this.socket.on('reconnect', () => {
      this.ui.showNotification('Соединение восстановлено', 'success');
      this.audioSynth.playNotification();
      if (this.roomId && this.nickname) {
        // Переподключаемся к комнате
        this.socket.emit('join-room', { 
          roomId: this.roomId, 
          nickname: this.nickname 
        });
      }
    });

    // Обработка ошибок присоединения к комнате
    this.socket.on('join-error', async (data) => {
      this.audioSynth.playError();
      
      let title = 'Ошибка присоединения';
      let message = data.message;
      
      if (data.type === 'room-full') {
        title = 'Комната переполнена';
        message = 'В комнате уже максимальное количество участников (6 человек). Попробуйте позже или создайте новую комнату.';
      } else if (data.type === 'room-locked') {
        title = 'Комната заблокирована';
        message = 'Хост заблокировал комнату для новых участников.';
      }
      
      await this.modalManager.showError(title, message);
    });

    // Обработка кика
    this.socket.on('kicked', async (data) => {
      this.audioSynth.playError();
      await this.modalManager.showError(
        'Исключение из комнаты', 
        data.reason || 'Вы были исключены из комнаты'
      );
      this.leaveRoom();
    });

    // Обработка админ-команд
    this.socket.on('admin-mute-all', (data) => {
      this.audioSynth.playNotification();
      this.ui.showNotification(`${data.hostNickname} заглушил всех участников`, 'warning');
      // Автоматически выключаем микрофон
      if (this.rtc.localStream) {
        const audioTrack = this.rtc.localStream.getAudioTracks()[0];
        if (audioTrack && audioTrack.enabled) {
          this.ui.toggleMicrophone();
        }
      }
    });

    this.socket.on('room-status', (data) => {
      const status = data.locked ? 'заблокировал' : 'разблокировал';
      this.ui.showNotification(`${data.hostNickname} ${status} комнату`, 'info');
    });

    // Обработка "постучать"
    this.socket.on('nudge', (data) => {
      this.audioSynth.playError(); // Громкий звук
      this.ui.showNotification(`${data.hostNickname} постучал!`, 'warning');
      
      // Эффект тряски экрана
      document.body.classList.add('shake');
      setTimeout(() => {
        document.body.classList.remove('shake');
      }, 600);
    });
  }

  checkWebRTCSupport() {
    if (!checkWebRTCSupport()) {
      this.modalManager.showError(
        'Браузер не поддерживается',
        'Ваш браузер не поддерживает WebRTC. Пожалуйста, используйте современный браузер (Chrome, Firefox, Safari, Edge).'
      );
      return false;
    }

    // Проверяем безопасный контекст
    if (!isSecureContext()) {
      this.modalManager.showWarning(
        'Небезопасное соединение',
        'Для корректной работы камеры и микрофона рекомендуется использовать HTTPS. На некоторых устройствах функции могут быть ограничены.'
      );
    }

    return true;
  }

  async joinRoom(nickname, roomId) {
    this.nickname = nickname;
    this.roomId = roomId || generateId(6);

    try {
      console.log(`Попытка присоединения к комнате: ${this.roomId} как ${this.nickname}`);
      
      // Инициализируем локальный поток
      await this.rtc.initializeLocalStream();
      
      // Получаем часовой пояс пользователя
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Присоединяемся к комнате
      this.socket.emit('join-room', { 
        roomId: this.roomId, 
        nickname: this.nickname,
        timezone: timezone
      });
      
      // Переключаемся на экран комнаты
      console.log('Переключение на экран комнаты из App.joinRoom');
      this.ui.switchToRoom();
      
      return true;
    } catch (error) {
      console.error('Ошибка присоединения к комнате:', error);
      
      // Показываем красивое модальное окно вместо alert
      let title = 'Ошибка доступа к устройствам';
      let message = 'Не удалось получить доступ к камере или микрофону. ';
      
      if (error.name === 'NotAllowedError') {
        message += 'Пожалуйста, разрешите доступ к камере и микрофону в настройках браузера и обновите страницу.';
      } else if (error.name === 'NotFoundError') {
        message += 'Камера или микрофон не найдены. Проверьте подключение устройств.';
      } else if (error.name === 'NotReadableError') {
        message += 'Устройства заняты другим приложением. Закройте другие программы, использующие камеру/микрофон.';
      } else {
        message += 'Проверьте подключение и настройки устройств.';
      }
      
      this.audioSynth.playError();
      await this.modalManager.showError(title, message);
      
      return false;
    }
  }

  async leaveRoom() {
    const confirmed = await this.modalManager.showConfirm(
      'Покинуть комнату',
      'Вы уверены, что хотите покинуть комнату?'
    );
    
    if (confirmed === 'confirm') {
      this.rtc.cleanup();
      this.socket.disconnect();
      this.ui.switchToLobby();
      
      this.roomId = null;
      this.nickname = null;
      this.isHost = false;
      
      this.audioSynth.playLeave();
    }
  }
}

// ============================================================================
// WEBRTC MANAGER - Управление WebRTC соединениями
// ============================================================================
class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.peers = {}; // socketId -> RTCPeerConnection
    this.isScreenSharing = false;
    this.originalVideoTrack = null;
    this.audioContext = null;
    this.audioAnalyser = null;
    
    // STUN/TURN серверы
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { 
          urls: 'turn:185.117.154.193:3478',
          username: 'nearsnap',
          credential: 'nearsnap123'
        },
        { 
          urls: 'turns:185.117.154.193:5349',
          username: 'nearsnap', 
          credential: 'nearsnap123'
        }
      ]
    };

    this.setupSocketEvents();
  }

  setupSocketEvents() {
    // Получение списка существующих пользователей
    this.socket.on('existing-users', (users) => {
      console.log('Существующие пользователи:', users);
      users.forEach(userId => {
        this.createPeerConnection(userId, true); // true = инициатор
      });
    });

    // Новый пользователь присоединился
    this.socket.on('user-joined', (data) => {
      console.log('Пользователь присоединился:', data);
      this.createPeerConnection(data.socketId, false); // false = не инициатор
    });

    // Пользователь покинул комнату
    this.socket.on('user-left', (data) => {
      console.log('Пользователь покинул комнату:', data);
      this.removePeer(data.socketId);
    });

    // WebRTC сигналинг
    this.socket.on('signal', async (data) => {
      const { from, signal } = data;
      const peer = this.peers[from];
      
      if (!peer) {
        console.error('Peer не найден для:', from);
        return;
      }

      try {
        if (signal.type === 'offer') {
          await peer.setRemoteDescription(signal);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          
          this.socket.emit('signal', {
            to: from,
            signal: answer
          });
        } else if (signal.type === 'answer') {
          await peer.setRemoteDescription(signal);
        } else if (signal.candidate) {
          await peer.addIceCandidate(signal);
        }
      } catch (error) {
        console.error('Ошибка обработки сигнала:', error);
      }
    });
  }

  // Инициализация локального медиа-потока
  async initializeLocalStream() {
    try {
      // Проверяем доступность getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia не поддерживается в этом браузере');
      }

      const constraints = {
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Отображаем локальное видео
      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }

      // Инициализируем анализатор звука для детекции речи
      this.initAudioAnalyser();

      return this.localStream;
    } catch (error) {
      console.error('Ошибка получения медиа-потока:', error);
      
      // Показываем пользователю ошибку
      let errorMessage = 'Не удалось получить доступ к камере/микрофону. ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Разрешите доступ к камере и микрофону в настройках браузера.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'Камера или микрофон не найдены.';
      } else if (error.name === 'NotSecureError' || error.message.includes('secure')) {
        errorMessage += 'Для доступа к камере и микрофону требуется HTTPS соединение.';
      } else {
        errorMessage += 'Проверьте подключение устройств.';
      }
      
      // Создаем фиктивный поток для продолжения работы без камеры/микрофона
      this.createDummyStream();
      
      alert(errorMessage);
      throw error;
    }
  }

  // Создание фиктивного потока для работы без камеры/микрофона
  createDummyStream() {
    try {
      // Создаем canvas для фиктивного видео
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      
      // Рисуем простой фон
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ecf0f1';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Камера недоступна', canvas.width / 2, canvas.height / 2);
      
      // Создаем поток из canvas
      const videoStream = canvas.captureStream(15);
      
      // Создаем фиктивный аудио поток
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // Беззвучный
      
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(gainNode);
      gainNode.connect(destination);
      oscillator.start();
      
      // Объединяем потоки
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);
      
      this.localStream = combinedStream;
      
      // Отображаем фиктивное видео
      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = combinedStream;
      }
      
      console.log('Создан фиктивный поток для работы без камеры/микрофона');
    } catch (error) {
      console.error('Ошибка создания фиктивного потока:', error);
    }
  }

  // Инициализация анализатора звука
  initAudioAnalyser() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.audioAnalyser = this.audioContext.createAnalyser();
      
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      source.connect(this.audioAnalyser);
      
      this.audioAnalyser.fftSize = 256;
      this.startVoiceDetection();
    } catch (error) {
      console.warn('Не удалось инициализировать анализатор звука:', error);
    }
  }

  // Детекция голоса
  startVoiceDetection() {
    if (!this.audioAnalyser) return;

    const bufferLength = this.audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const detectVoice = () => {
      this.audioAnalyser.getByteFrequencyData(dataArray);
      
      // Вычисляем среднюю громкость
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      
      // Порог для детекции речи
      const threshold = 30;
      const isSpeaking = average > threshold;
      
      // Обновляем UI
      const localVideoWrapper = document.getElementById('localVideoWrapper');
      if (localVideoWrapper) {
        if (isSpeaking) {
          localVideoWrapper.classList.add('speaking');
        } else {
          localVideoWrapper.classList.remove('speaking');
        }
      }
      
      // Проверяем на громкие звуки для визуализатора шума
      if (average > 80 && window.app.ui.noiseVisualizerEnabled) {
        window.app.ui.triggerNoiseReaction('local', average);
      }
      
      requestAnimationFrame(detectVoice);
    };
    
    detectVoice();
  }

  // Создание peer connection
  createPeerConnection(socketId, isInitiator) {
    const peer = new RTCPeerConnection(this.rtcConfig);
    this.peers[socketId] = peer;

    // Добавляем локальные треки
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
    }

    // Обработка входящих треков
    peer.ontrack = (event) => {
      console.log('Получен трек от:', socketId);
      const [remoteStream] = event.streams;
      
      // Создаем анализатор звука для этого участника
      this.createAudioAnalyzer(socketId, remoteStream);
      
      window.app.ui.handleRemoteStream(socketId, remoteStream);
    };

    // Обработка ICE кандидатов
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal', {
          to: socketId,
          signal: event.candidate
        });
      }
    };

    // Обработка изменения состояния соединения
    peer.onconnectionstatechange = () => {
      console.log(`Состояние соединения с ${socketId}:`, peer.connectionState);
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        this.removePeer(socketId);
      }
    };

    // Обработка необходимости пересогласования (только для инициатора)
    if (isInitiator) {
      peer.onnegotiationneeded = async () => {
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          
          this.socket.emit('signal', {
            to: socketId,
            signal: offer
          });
        } catch (error) {
          console.error('Ошибка пересогласования:', error);
        }
      };
    }

    return peer;
  }

  // Удаление peer connection
  removePeer(socketId) {
    const peer = this.peers[socketId];
    if (peer) {
      peer.close();
      delete this.peers[socketId];
    }

    // Удаляем видео элемент через UI
    window.app.ui.removeVideoElement(socketId);
  }

  // Управление микрофоном
  toggleMicrophone() {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
    return false;
  }

  // Управление камерой
  toggleCamera() {
    if (!this.localStream) return false;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  }

  // Демонстрация экрана
  async toggleScreenShare() {
    try {
      if (!this.isScreenSharing) {
        // Начинаем демонстрацию экрана
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        const videoTrack = screenStream.getVideoTracks()[0];
        
        // Сохраняем оригинальный видео трек
        this.originalVideoTrack = this.localStream.getVideoTracks()[0];

        // Заменяем видео трек во всех peer connections
        Object.values(this.peers).forEach(peer => {
          const sender = peer.getSenders().find(s => 
            s.track && s.track.kind === 'video'
          );
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });

        // Заменяем в локальном потоке
        this.localStream.removeTrack(this.originalVideoTrack);
        this.localStream.addTrack(videoTrack);

        // Обновляем локальное видео
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
        }

        // Обработка окончания демонстрации экрана
        videoTrack.onended = () => {
          this.stopScreenShare();
        };

        this.isScreenSharing = true;
        return true;
      } else {
        // Останавливаем демонстрацию экрана
        this.stopScreenShare();
        return false;
      }
    } catch (error) {
      console.error('Ошибка демонстрации экрана:', error);
      return false;
    }
  }

  // Остановка демонстрации экрана
  stopScreenShare() {
    if (!this.isScreenSharing || !this.originalVideoTrack) return;

    // Возвращаем оригинальный видео трек
    Object.values(this.peers).forEach(peer => {
      const sender = peer.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      if (sender) {
        sender.replaceTrack(this.originalVideoTrack);
      }
    });

    // Заменяем в локальном потоке
    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    if (currentVideoTrack) {
      this.localStream.removeTrack(currentVideoTrack);
      currentVideoTrack.stop();
    }
    
    this.localStream.addTrack(this.originalVideoTrack);

    // Обновляем локальное видео
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
      localVideo.srcObject = this.localStream;
    }

    this.isScreenSharing = false;
    this.originalVideoTrack = null;
  }

  // Очистка всех соединений
  cleanup() {
    Object.values(this.peers).forEach(peer => peer.close());
    this.peers = {};
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Обновление ограничений потока
  async updateStreamConstraints(settings) {
    try {
      if (!this.localStream) return;

      // Создаем новые ограничения на основе настроек
      const constraints = {
        video: {
          width: this.getVideoResolution(settings.videoQuality).width,
          height: this.getVideoResolution(settings.videoQuality).height,
          frameRate: { ideal: parseInt(settings.frameRate) }
        },
        audio: {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl
        }
      };

      // Получаем новый поток
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Заменяем треки во всех peer connections
      Object.values(this.peers).forEach(peer => {
        const videoSender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
        const audioSender = peer.getSenders().find(s => s.track && s.track.kind === 'audio');
        
        if (videoSender && newStream.getVideoTracks()[0]) {
          videoSender.replaceTrack(newStream.getVideoTracks()[0]);
        }
        if (audioSender && newStream.getAudioTracks()[0]) {
          audioSender.replaceTrack(newStream.getAudioTracks()[0]);
        }
      });

      // Останавливаем старый поток
      this.localStream.getTracks().forEach(track => track.stop());
      
      // Обновляем локальный поток
      this.localStream = newStream;
      
      // Обновляем локальное видео
      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = newStream;
      }

      console.log('Настройки потока обновлены');
    } catch (error) {
      console.error('Ошибка обновления настроек потока:', error);
      throw error;
    }
  }

  // Получение разрешения видео по качеству
  getVideoResolution(quality) {
    const resolutions = {
      '1080p': { width: 1920, height: 1080 },
      '720p': { width: 1280, height: 720 },
      '480p': { width: 854, height: 480 },
      '360p': { width: 640, height: 360 }
    };
    
    return resolutions[quality] || resolutions['720p'];
  }

  // Создание анализатора звука для участника
  createAudioAnalyzer(socketId, stream) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      // Создаем источник звука
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // Создаем анализатор
      const analyzer = this.audioContext.createAnalyser();
      analyzer.fftSize = 256;
      analyzer.smoothingTimeConstant = 0.8;
      
      // Создаем узел усиления для индивидуальной регулировки громкости
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 1.0; // Начальная громкость 100%
      
      // Соединяем: источник -> усиление -> анализатор -> назначение
      source.connect(gainNode);
      gainNode.connect(analyzer);
      analyzer.connect(this.audioContext.destination);
      
      // Сохраняем узел усиления для участника
      const participant = window.app.ui.participants.get(socketId);
      if (participant) {
        participant.gainNode = gainNode;
      }
      
      // Запускаем мониторинг громкости
      this.startVolumeMonitoring(socketId, analyzer);
      
    } catch (error) {
      console.warn('Не удалось создать анализатор звука для', socketId, error);
    }
  }

  // Мониторинг громкости участника
  startVolumeMonitoring(socketId, analyzer) {
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVolume = () => {
      analyzer.getByteFrequencyData(dataArray);
      
      // Вычисляем среднюю громкость
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      
      // Конвертируем в децибелы (приблизительно)
      const decibels = 20 * Math.log10(average / 255);
      
      // Порог для детекции речи (-50dB)
      const isSpeaking = decibels > -50 && average > 10;
      
      // Обновляем UI
      this.updateSpeakingIndicator(socketId, isSpeaking);
      
      // Проверяем на громкие звуки для визуализатора шума
      if (average > 80 && window.app.ui.noiseVisualizerEnabled) {
        window.app.ui.triggerNoiseReaction(socketId, average);
      }
      
      // Продолжаем мониторинг
      requestAnimationFrame(checkVolume);
    };
    
    checkVolume();
  }

  // Обновление индикатора говорящего
  updateSpeakingIndicator(socketId, isSpeaking) {
    const videoElement = document.getElementById(`video-${socketId}`);
    if (videoElement) {
      if (isSpeaking) {
        videoElement.classList.add('speaking');
        // Устанавливаем как активного докладчика в режиме speaker
        if (window.app.ui.currentLayout === 'speaker') {
          window.app.ui.setActiveSpeaker(socketId);
        }
      } else {
        videoElement.classList.remove('speaking');
      }
    }
    
    // Обновляем миниатюру в режиме докладчика
    const thumbnail = document.querySelector(`[data-participant-id="${socketId}"]`);
    if (thumbnail) {
      if (isSpeaking) {
        thumbnail.classList.add('speaking');
      } else {
        thumbnail.classList.remove('speaking');
      }
    }
  }

  // Установка громкости для участника
  setParticipantVolume(socketId, volume) {
    const participant = window.app.ui.participants.get(socketId);
    if (participant && participant.gainNode) {
      // volume от 0 до 200 (0% до 200%)
      participant.gainNode.gain.value = volume / 100;
    }
  }
}

// ============================================================================
// WINDOW MANAGER - Управление UI и экранами
// ============================================================================
class WindowManager {
  constructor(app) {
    this.app = app;
    this.currentScreen = 'loginScreen';
    this.currentTheme = 'theme-default';
    this.participants = new Map(); // socketId -> { nickname, videoElement, micEnabled, camEnabled, gainNode, timezone, isTyping }
    this.isChatVisible = true;
    this.contextMenu = null;
    this.currentContextTarget = null;
    this.currentLayout = 'grid'; // 'grid' или 'speaker'
    this.activeSpeaker = null;
    this.networkMonitor = null;
    this.chatHistory = [];
    this.notificationsEnabled = false;
    
    // Новые функции
    this.typingIndicators = new Map(); // socketId -> timeout
    this.zenModeEnabled = true;
    this.zenModeTimeout = null;
    this.lastMouseActivity = Date.now();
    this.noiseVisualizerEnabled = true;
    this.isFullscreen = false;
    this.fullscreenAutoHideTimeout = null;
    
    // Маскот
    this.mascot = null;
    this.mascotClickCount = 0;
    
    this.initEventListeners();
    this.loadTheme();
    this.initPreJoinScreen();
    this.initContextMenu();
    this.initNetworkMonitor();
    this.initNotifications();
    this.loadChatHistory();
    this.loadUIScale();
    this.initTypingIndicator();
    this.initZenMode();
    this.initNoiseVisualizer();
    this.initFullscreenMode();
    this.initMobileOptimizations();
    this.initMascot();
  }

  initEventListeners() {
    // Форма входа
    const joinBtn = document.getElementById('joinBtn');
    const nicknameInput = document.getElementById('nicknameInput');
    const roomIdInput = document.getElementById('roomIdInput');

    if (!joinBtn || !nicknameInput || !roomIdInput) {
      console.error('Критические элементы формы входа не найдены');
      return;
    }

    // Кнопка активируется только после ввода никнейма
    nicknameInput.addEventListener('input', () => {
      joinBtn.disabled = !nicknameInput.value.trim();
    });

    joinBtn.addEventListener('click', () => this.handleJoinRoom());
    nicknameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !joinBtn.disabled) this.handleJoinRoom();
    });
    roomIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !joinBtn.disabled) this.handleJoinRoom();
    });

    // Селектор темы
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.changeTheme(e.target.value);
      });
    }

    // Кнопки управления - добавляем проверки существования
    const micToggle = document.getElementById('micToggle');
    const cameraToggle = document.getElementById('cameraToggle');
    const screenShare = document.getElementById('screenShare');
    const fullscreenToggle = document.getElementById('fullscreenToggle');
    const leaveBtn = document.getElementById('leaveBtn');

    if (micToggle) micToggle.addEventListener('click', () => this.toggleMicrophone());
    if (cameraToggle) cameraToggle.addEventListener('click', () => this.toggleCamera());
    if (screenShare) screenShare.addEventListener('click', () => this.toggleScreenShare());
    if (fullscreenToggle) fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
    if (leaveBtn) leaveBtn.addEventListener('click', () => this.leaveRoom());

    // Настройки
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsBtn = document.getElementById('settingsBtn');
    
    if (settingsToggle) settingsToggle.addEventListener('click', () => this.openSettings());
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.openSettings());

    // Переключатель режимов отображения
    const gridViewBtn = document.getElementById('gridViewBtn');
    const speakerViewBtn = document.getElementById('speakerViewBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    
    if (gridViewBtn) gridViewBtn.addEventListener('click', () => this.switchLayout('grid'));
    if (speakerViewBtn) speakerViewBtn.addEventListener('click', () => this.switchLayout('speaker'));
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    // Чат
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const toggleChat = document.getElementById('toggleChat');
    
    if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
    if (messageInput) {
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendMessage();
      });
    }
    if (toggleChat) toggleChat.addEventListener('click', () => this.toggleChatVisibility());

    // Горячие клавиши
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'm':
            e.preventDefault();
            this.toggleMicrophone();
            break;
          case 'v':
            e.preventDefault();
            this.toggleCamera();
            break;
          case 's':
            e.preventDefault();
            this.toggleScreenShare();
            break;
        }
      }
      
      // F11 для полного экрана
      if (e.key === 'F11') {
        e.preventDefault();
        this.toggleFullscreen();
      }
      
      // Escape для выхода из полного экрана
      if (e.key === 'Escape' && this.isFullscreen) {
        e.preventDefault();
        this.exitFullscreen();
      }
      
      // Закрытие контекстного меню по Escape
      if (e.key === 'Escape') {
        this.hideContextMenu();
        this.closeSettingsModal();
      }
    });

    // Инициализируем обработчики настроек
    this.initSettingsEventListeners();

    // Уведомления браузера
    const requestNotificationPermission = document.getElementById('requestNotificationPermission');
    if (requestNotificationPermission) {
      requestNotificationPermission.addEventListener('click', () => {
        this.requestNotificationPermission();
      });
    }

    // Админ панель
    const muteAllBtn = document.getElementById('muteAllBtn');
    const roomLockBtn = document.getElementById('roomLockBtn');
    const nudgeAllBtn = document.getElementById('nudgeAllBtn');
    
    if (muteAllBtn) muteAllBtn.addEventListener('click', () => this.muteAll());
    if (roomLockBtn) roomLockBtn.addEventListener('click', () => this.toggleRoomLock());
    if (nudgeAllBtn) nudgeAllBtn.addEventListener('click', () => this.nudgeAll());

    // Закрытие контекстного меню при клике вне его
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu') && !e.target.closest('.participant-item')) {
        this.hideContextMenu();
      }
    });

    // Socket события
    this.app.socket.on('room-info', (data) => this.handleRoomInfo(data));
    this.app.socket.on('user-joined', (data) => this.handleUserJoined(data));
    this.app.socket.on('user-left', (data) => this.handleUserLeft(data));
    this.app.socket.on('chat-message', (data) => this.addChatMessage(data));
    this.app.socket.on('new-host', (data) => this.handleNewHost(data));
    this.app.socket.on('kicked', () => this.handleKicked());
    this.app.socket.on('user-typing', (data) => this.handleUserTyping(data));
    this.app.socket.on('user-stop-typing', (data) => this.handleUserStopTyping(data));
  }

  // Инициализация обработчиков настроек
  initSettingsEventListeners() {
    // Модальное окно настроек
    const settingsModal = document.getElementById('settingsModal');
    const modalClose = settingsModal?.querySelector('.modal-close');
    
    if (modalClose) {
      modalClose.addEventListener('click', () => this.closeSettingsModal());
    }
    
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          this.closeSettingsModal();
        }
      });
    }

    // Вкладки настроек
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        if (tabName) {
          this.switchSettingsTab(tabName);
        }
      });
    });

    // Кнопки применения и сброса настроек
    const applyBtn = document.getElementById('applySettings');
    const resetBtn = document.getElementById('resetSettings');
    
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applySettings());
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetSettings());
    }

    // Слайдер громкости звуковых эффектов
    const soundVolumeSlider = document.getElementById('soundVolume');
    if (soundVolumeSlider) {
      soundVolumeSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        const label = document.getElementById('soundVolumeValue');
        if (label) {
          label.textContent = value + '%';
        }
      });
    }

    // Виртуальный фон
    const virtualBackgroundSelect = document.getElementById('virtualBackground');
    if (virtualBackgroundSelect) {
      virtualBackgroundSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'custom') {
          const fileInput = document.getElementById('customBackground');
          if (fileInput) {
            fileInput.click();
          }
        } else {
          this.applyVirtualBackground(value);
        }
      });
    }

    // Загрузка пользовательского фона
    const customBackgroundInput = document.getElementById('customBackground');
    if (customBackgroundInput) {
      customBackgroundInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.loadCustomBackground(file);
        }
      });
    }

    // Масштаб интерфейса
    const uiScaleSelect = document.getElementById('uiScale');
    if (uiScaleSelect) {
      uiScaleSelect.addEventListener('change', (e) => {
        this.applyUIScale(e.target.value);
      });
    }
  }

  // Инициализация экрана перед входом
  async initPreJoinScreen() {
    try {
      // Проверяем доступность getUserMedia перед попыткой получить превью
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia не поддерживается, пропускаем превью камеры');
        return;
      }

      // Показываем превью камеры в лобби
      const previewVideo = document.getElementById('localVideo');
      if (previewVideo) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: false 
        });
        previewVideo.srcObject = stream;
        
        // Сохраняем поток для последующего использования
        this.previewStream = stream;
      }
    } catch (error) {
      console.warn('Не удалось получить превью камеры:', error);
      // Не показываем ошибку пользователю на этом этапе
    }
  }

  // Обработка входа в комнату
  async handleJoinRoom() {
    const nickname = document.getElementById('nicknameInput').value.trim();
    const roomId = document.getElementById('roomIdInput').value.trim();

    if (!nickname) {
      this.showNotification('Введите ваш никнейм', 'warning');
      return;
    }

    // Маскот думает
    this.mascotThinking();

    // Блокируем кнопку во время подключения
    const joinBtn = document.getElementById('joinBtn');
    const originalText = joinBtn.textContent;
    joinBtn.disabled = true;
    joinBtn.textContent = 'Подключение...';

    // Останавливаем превью поток
    if (this.previewStream) {
      this.previewStream.getTracks().forEach(track => track.stop());
      this.previewStream = null;
    }

    const success = await this.app.joinRoom(nickname, roomId);
    
    if (!success) {
      // Восстанавливаем кнопку и превью при ошибке
      joinBtn.disabled = false;
      joinBtn.textContent = originalText;
      this.initPreJoinScreen();
    } else {
      // Маскот радуется успешному подключению
      setTimeout(() => {
        this.mascotReact('celebrating');
      }, 500);
    }
    // Если успешно - кнопка останется заблокированной, так как мы переключимся на другой экран
  }

  // Переключение на экран комнаты
  switchToRoom() {
    console.log('Переключение на экран комнаты');
    this.switchScreen('videoScreen');
    
    // Принудительно скрываем экран входа
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) {
      loginScreen.style.display = 'none !important';
      loginScreen.style.visibility = 'hidden';
      loginScreen.style.opacity = '0';
      loginScreen.style.pointerEvents = 'none';
      loginScreen.classList.remove('active');
    }
    
    // Принудительно показываем видео экран
    const videoScreen = document.getElementById('videoScreen');
    if (videoScreen) {
      videoScreen.style.display = 'flex';
      videoScreen.style.flexDirection = 'column';
      videoScreen.style.position = 'fixed';
      videoScreen.style.top = '0';
      videoScreen.style.left = '0';
      videoScreen.style.width = '100%';
      videoScreen.style.height = '100vh';
      videoScreen.style.zIndex = '10';
      videoScreen.classList.add('active');
    }
    
    // Обновляем макет для одного участника (мы)
    setTimeout(() => {
      this.updateLayout(1);
      console.log('Макет обновлен для одного участника');
    }, 100);
  }

  // Переключение на лобби
  switchToLobby() {
    console.log('Переключение на лобби');
    this.switchScreen('loginScreen');
    this.participants.clear();
    this.clearVideoGrid();
    this.clearChat();
    
    // Восстанавливаем отображение экрана входа
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) {
      loginScreen.style.display = 'flex !important';
      loginScreen.classList.add('active');
    }
    
    // Скрываем видео экран
    const videoScreen = document.getElementById('videoScreen');
    if (videoScreen) {
      videoScreen.style.display = 'none';
      videoScreen.classList.remove('active');
    }
    
    // Сбрасываем форму
    document.getElementById('nicknameInput').value = '';
    document.getElementById('roomIdInput').value = '';
    const joinBtn = document.getElementById('joinBtn');
    joinBtn.disabled = true;
    joinBtn.textContent = 'Присоединиться';
    
    this.initPreJoinScreen();
  }

  // Переключение экранов
  switchScreen(screenId) {
    console.log(`Переключение экрана на: ${screenId}`);
    
    // Принудительно скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
      screen.style.display = 'none';
      screen.style.visibility = 'hidden';
      screen.style.opacity = '0';
      screen.style.pointerEvents = 'none';
    });
    
    // Показываем нужный экран
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.classList.add('active');
      targetScreen.style.visibility = 'visible';
      targetScreen.style.opacity = '1';
      targetScreen.style.pointerEvents = 'all';
      
      if (screenId === 'loginScreen') {
        targetScreen.style.display = 'flex';
        targetScreen.style.position = 'fixed';
        targetScreen.style.zIndex = '5';
      } else if (screenId === 'videoScreen') {
        targetScreen.style.display = 'flex';
        targetScreen.style.flexDirection = 'column';
        targetScreen.style.position = 'fixed';
        targetScreen.style.zIndex = '10';
      } else {
        targetScreen.style.display = 'block';
      }
    }
    
    this.currentScreen = screenId;
  }

  // Обновление макета видео сетки
  updateLayout(participantCount) {
    const videoGrid = document.getElementById('videoGrid');
    
    // Удаляем предыдущие классы макета
    videoGrid.classList.remove('layout-1', 'layout-2', 'layout-3-4', 'layout-5-6');
    
    console.log(`Обновление макета для ${participantCount} участников`);
    
    // Применяем новый макет
    if (participantCount === 1) {
      videoGrid.classList.add('layout-1');
      console.log('Применен макет для 1 участника');
    } else if (participantCount === 2) {
      videoGrid.classList.add('layout-2');
      console.log('Применен макет для 2 участников');
    } else if (participantCount <= 4) {
      videoGrid.classList.add('layout-3-4');
      console.log('Применен макет для 3-4 участников');
    } else {
      videoGrid.classList.add('layout-5-6');
      console.log('Применен макет для 5-6 участников');
    }
  }

  // Обработка удаленного потока
  handleRemoteStream(socketId, stream) {
    const videoGrid = document.getElementById('videoGrid');
    
    // Удаляем существующий элемент если есть
    this.removeVideoElement(socketId);

    // Создаем новый видео элемент
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-wrapper remote-video video-enter';
    videoWrapper.id = `video-${socketId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';

    const nickname = document.createElement('span');
    nickname.className = 'nickname';
    const participant = this.participants.get(socketId);
    nickname.textContent = participant ? participant.nickname : `Пользователь ${socketId.substring(0, 6)}`;

    const controls = document.createElement('div');
    controls.className = 'video-controls';

    // Добавляем админ-кнопки если мы хост и это не мы
    if (this.app.isHost && socketId !== this.app.socket.id) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'control-btn kick-btn';
      kickBtn.innerHTML = '❌';
      kickBtn.title = 'Исключить пользователя';
      kickBtn.onclick = (e) => {
        e.stopPropagation();
        this.kickUser(socketId);
      };
      
      const muteBtn = document.createElement('button');
      muteBtn.className = 'control-btn mute-remote-btn';
      muteBtn.innerHTML = '🔇';
      muteBtn.title = 'Заглушить локально';
      muteBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleRemoteMute(socketId, muteBtn);
      };
      
      controls.appendChild(muteBtn);
      controls.appendChild(kickBtn);
    }

    // Добавляем ползунок громкости
    const volumeControl = document.createElement('div');
    volumeControl.className = 'volume-control';
    
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.className = 'volume-slider';
    volumeSlider.min = '0';
    volumeSlider.max = '200';
    volumeSlider.value = '100';
    
    const volumeLabel = document.createElement('span');
    volumeLabel.className = 'volume-label';
    volumeLabel.textContent = '100%';
    
    // Обработчик изменения громкости
    volumeSlider.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value);
      volumeLabel.textContent = volume + '%';
      this.app.rtc.setParticipantVolume(socketId, volume);
    });
    
    volumeControl.appendChild(volumeSlider);
    volumeControl.appendChild(volumeLabel);

    overlay.appendChild(nickname);
    overlay.appendChild(controls);
    videoWrapper.appendChild(video);
    videoWrapper.appendChild(overlay);
    videoWrapper.appendChild(volumeControl);
    videoGrid.appendChild(videoWrapper);

    // Анимация появления
    setTimeout(() => {
      videoWrapper.classList.remove('video-enter');
    }, 50);

    // Обновляем макет
    this.updateLayout(this.participants.size + 1);

    // Сохраняем ссылку на элемент
    if (this.participants.has(socketId)) {
      this.participants.get(socketId).videoElement = videoWrapper;
    }
    
    // Обновляем режим докладчика если активен
    if (this.currentLayout === 'speaker') {
      this.updateSpeakerView();
    }
  }

  // Локальное заглушение удаленного участника
  toggleRemoteMute(socketId, button) {
    const videoElement = document.getElementById(`video-${socketId}`);
    if (videoElement) {
      const video = videoElement.querySelector('video');
      if (video) {
        video.muted = !video.muted;
        button.innerHTML = video.muted ? '🔊' : '🔇';
        button.title = video.muted ? 'Включить звук' : 'Заглушить локально';
        
        const participant = this.participants.get(socketId);
        const nickname = participant ? participant.nickname : 'Участник';
        this.showNotification(
          `${nickname} ${video.muted ? 'заглушен' : 'включен'} локально`, 
          'info'
        );
      }
    }
  }

  // Удаление видео элемента
  removeVideoElement(socketId) {
    const videoElement = document.getElementById(`video-${socketId}`);
    if (videoElement) {
      videoElement.classList.add('video-exit');
      setTimeout(() => {
        videoElement.remove();
        this.updateLayout(this.participants.size + 1);
      }, 300);
    }
  }

  // Управление микрофоном
  toggleMicrophone() {
    const isEnabled = this.app.rtc.toggleMicrophone();
    const btn = document.getElementById('micToggle');
    const icon = btn.querySelector('.icon');
    
    if (isEnabled) {
      btn.classList.remove('muted');
      icon.textContent = '🎤';
      btn.title = 'Выключить микрофон (Ctrl+M)';
    } else {
      btn.classList.add('muted');
      icon.textContent = '🔇';
      btn.title = 'Включить микрофон (Ctrl+M)';
    }
  }

  // Управление камерой
  toggleCamera() {
    const isEnabled = this.app.rtc.toggleCamera();
    const btn = document.getElementById('cameraToggle');
    const icon = btn.querySelector('.icon');
    
    if (isEnabled) {
      btn.classList.remove('muted');
      icon.textContent = '📹';
      btn.title = 'Выключить камеру (Ctrl+V)';
    } else {
      btn.classList.add('muted');
      icon.textContent = '📷';
      btn.title = 'Включить камеру (Ctrl+V)';
    }
  }

  // Демонстрация экрана
  async toggleScreenShare() {
    const isSharing = await this.app.rtc.toggleScreenShare();
    const btn = document.getElementById('screenShare');
    const icon = btn.querySelector('.icon');
    const label = btn.querySelector('.label');
    
    if (isSharing) {
      btn.classList.add('active');
      icon.textContent = '🛑';
      label.textContent = 'Стоп';
      btn.title = 'Остановить демонстрацию (Ctrl+S)';
    } else {
      btn.classList.remove('active');
      icon.textContent = '🖥️';
      label.textContent = 'Экран';
      btn.title = 'Демонстрация экрана (Ctrl+S)';
    }
  }

  // Покидание комнаты
  leaveRoom() {
    this.app.leaveRoom();
  }

  // Переключение видимости чата
  toggleChatVisibility() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('toggleChat');
    
    this.isChatVisible = !this.isChatVisible;
    
    if (this.isChatVisible) {
      sidebar.classList.remove('hidden');
      toggleBtn.textContent = '💬';
    } else {
      sidebar.classList.add('hidden');
      toggleBtn.textContent = '💬';
    }
  }

  // Отправка сообщения в чат
  sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message) {
      this.app.socket.emit('chat-message', { message });
      input.value = '';
    }
  }

  // Добавление сообщения в чат
  addChatMessage(data, saveToHistory = true) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message slide-in';
    
    // Определяем тип сообщения
    if (data.from === this.app.socket.id) {
      messageDiv.classList.add('own');
    }
    
    const time = new Date(data.timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
      <div class="message-author">${this.escapeHtml(data.nickname)}</div>
      <div class="message-time">${time}</div>
      <div class="message-text">${this.escapeHtml(data.message)}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Сохраняем в историю
    if (saveToHistory) {
      this.chatHistory.push(data);
      this.saveChatHistory();
      
      // Показываем уведомление браузера если не наше сообщение
      if (data.from !== this.app.socket.id) {
        this.showBrowserNotification(
          `Сообщение от ${data.nickname}`,
          data.message,
          '💬'
        );
        
        // Проигрываем звук уведомления
        this.app.audioSynth.playNotification();
        
        // Реакция маскота на новое сообщение
        this.mascotReact('speaking');
      }
    }
  }

  // Обработчики Socket событий
  handleRoomInfo(data) {
    console.log('Получена информация о комнате:', data);
    
    this.app.roomId = data.roomId;
    this.app.isHost = data.isHost;
    
    // Убеждаемся, что мы на правильном экране
    if (this.currentScreen !== 'videoScreen') {
      console.log('Принудительное переключение на экран комнаты');
      this.switchToRoom();
    }
    
    document.getElementById('roomIdDisplay').textContent = `Комната: ${data.roomId}`;
    document.getElementById('hostIndicator').textContent = 
      data.isHost ? '👑 Вы хост' : `👑 Хост: ${data.users.find(u => u.socketId === data.host)?.nickname || 'Unknown'}`;
    
    // Показываем админ панель если мы хост
    const adminPanel = document.getElementById('adminPanel');
    if (data.isHost) {
      adminPanel.style.display = 'block';
    }

    // Обновляем список участников
    data.users.forEach(user => {
      if (user.socketId !== this.app.socket.id) {
        this.participants.set(user.socketId, { nickname: user.nickname });
      }
    });

    this.updateParticipantsList();
  }

  handleUserJoined(data) {
    this.participants.set(data.socketId, { 
      nickname: data.nickname, 
      micEnabled: true, 
      camEnabled: true,
      timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      isTyping: false
    });
    this.showNotification(`${data.nickname} присоединился к комнате`, 'info');
    this.showBrowserNotification(
      'Новый участник',
      `${data.nickname} присоединился к комнате`,
      '👋'
    );
    this.app.audioSynth.playJoin();
    this.updateParticipantsList();
    
    // Реакция маскота
    this.mascotReact('celebrating');
    
    // Обновляем режим докладчика если активен
    if (this.currentLayout === 'speaker') {
      this.updateSpeakerView();
    }
  }

  handleUserLeft(data) {
    this.participants.delete(data.socketId);
    this.showNotification(`${data.nickname} покинул комнату`, 'warning');
    this.app.audioSynth.playLeave();
    this.updateParticipantsList();
    
    // Если ушел активный докладчик, сбрасываем
    if (this.activeSpeaker === data.socketId) {
      this.activeSpeaker = null;
    }
    
    // Обновляем режим докладчика если активен
    if (this.currentLayout === 'speaker') {
      this.updateSpeakerView();
    }
  }

  handleNewHost(data) {
    this.app.isHost = data.hostId === this.app.socket.id;
    document.getElementById('hostIndicator').textContent = `👑 Хост: ${data.hostNickname}`;
    
    const adminPanel = document.getElementById('adminPanel');
    adminPanel.style.display = this.app.isHost ? 'block' : 'none';
  }

  handleKicked() {
    alert('Вы были исключены из комнаты хостом');
    this.app.leaveRoom();
  }

  // Обновление списка участников
  updateParticipantsList() {
    const list = document.getElementById('participantsList');
    const count = document.getElementById('participantCount');
    
    list.innerHTML = '';
    count.textContent = this.participants.size + 1; // +1 для нас
    
    // Добавляем себя
    const selfItem = document.createElement('div');
    selfItem.className = 'participant-item current-user';
    
    // Получаем статус наших устройств
    const micEnabled = this.app.rtc.localStream ? 
      this.app.rtc.localStream.getAudioTracks()[0]?.enabled : false;
    const camEnabled = this.app.rtc.localStream ? 
      this.app.rtc.localStream.getVideoTracks()[0]?.enabled : false;
    
    const localTime = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    selfItem.innerHTML = `
      <div class="participant-info">
        <div class="participant-name-time">
          <span class="participant-name">${this.app.nickname} (Вы) ${this.app.isHost ? '👑' : ''}</span>
          <span class="participant-time" data-participant-time="local">${localTime}</span>
        </div>
        <div class="participant-status">
          <div class="status-icon ${micEnabled ? 'mic-on' : 'mic-off'}" title="${micEnabled ? 'Микрофон включен' : 'Микрофон выключен'}">
            ${micEnabled ? '🎤' : '🔇'}
          </div>
          <div class="status-icon ${camEnabled ? 'cam-on' : 'cam-off'}" title="${camEnabled ? 'Камера включена' : 'Камера выключена'}">
            ${camEnabled ? '📹' : '📷'}
          </div>
        </div>
      </div>
    `;
    list.appendChild(selfItem);
    
    // Добавляем остальных участников
    this.participants.forEach((participant, socketId) => {
      const participantDiv = document.createElement('div');
      participantDiv.className = 'participant-item';
      
      // Получаем статус устройств участника (по умолчанию включены)
      const micEnabled = participant.micEnabled !== false;
      const camEnabled = participant.camEnabled !== false;
      const participantTime = this.getParticipantLocalTime(socketId);
      
      participantDiv.innerHTML = `
        <div class="participant-info">
          <div class="participant-name-time">
            <span class="participant-name">${participant.nickname}</span>
            <span class="participant-time" data-participant-time="${socketId}">${participantTime}</span>
          </div>
          <div class="participant-status">
            <div class="status-icon ${micEnabled ? 'mic-on' : 'mic-off'}" title="${micEnabled ? 'Микрофон включен' : 'Микрофон выключен'}">
              ${micEnabled ? '🎤' : '🔇'}
            </div>
            <div class="status-icon ${camEnabled ? 'cam-on' : 'cam-off'}" title="${camEnabled ? 'Камера включена' : 'Камера выключена'}">
              ${camEnabled ? '📹' : '📷'}
            </div>
            ${participant.isTyping ? '<div class="status-icon typing-status" title="Печатает...">✍️</div>' : ''}
          </div>
        </div>
      `;
      
      // Добавляем контекстное меню по правому клику
      participantDiv.addEventListener('contextmenu', (e) => {
        this.showContextMenu(e, socketId);
      });
      
      // Также добавляем по долгому нажатию на мобильных
      let longPressTimer;
      participantDiv.addEventListener('touchstart', (e) => {
        longPressTimer = setTimeout(() => {
          this.showContextMenu(e.touches[0], socketId);
        }, 500);
      });
      
      participantDiv.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
      });
      
      list.appendChild(participantDiv);
    });

    // Запускаем обновление времени каждую минуту
    if (!this.timeUpdateInterval) {
      this.timeUpdateInterval = setInterval(() => {
        this.updateParticipantTimes();
      }, 60000); // Каждую минуту
    }
  }

  // Кик пользователя (только для хоста)
  async kickUser(socketId) {
    if (this.app.isHost) {
      const participant = this.participants.get(socketId);
      const nickname = participant ? participant.nickname : 'пользователя';
      
      const confirmed = await this.app.modalManager.showConfirm(
        'Исключить участника',
        `Вы уверены, что хотите исключить ${nickname} из комнаты?`
      );
      
      if (confirmed === 'confirm') {
        this.app.socket.emit('admin-action', { 
          action: 'kick', 
          targetId: socketId,
          reason: `Исключен администратором ${this.app.nickname}`
        });
      }
    }
  }

  // Смена темы
  changeTheme(theme) {
    document.body.className = theme;
    this.currentTheme = theme;
    localStorage.setItem('zloer-theme', theme);
  }

  // Загрузка темы из localStorage
  loadTheme() {
    const savedTheme = localStorage.getItem('zloer-theme');
    if (savedTheme) {
      this.changeTheme(savedTheme);
      document.getElementById('themeSelect').value = savedTheme;
    }
  }

  // Показ уведомлений
  showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    
    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  // Очистка видео сетки
  clearVideoGrid() {
    const videoGrid = document.getElementById('videoGrid');
    // Оставляем только локальное видео
    const localVideo = document.getElementById('localVideoWrapper');
    videoGrid.innerHTML = '';
    if (localVideo) {
      videoGrid.appendChild(localVideo);
    }
  }

  // Очистка чата
  clearChat() {
    document.getElementById('chatMessages').innerHTML = '';
  }

  // Экранирование HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Инициализация контекстного меню
  initContextMenu() {
    this.contextMenu = document.getElementById('participantContextMenu');
    
    // Обработчики для пунктов меню
    this.contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item || !this.currentContextTarget) return;
      
      const action = item.dataset.action;
      const socketId = this.currentContextTarget;
      
      switch (action) {
        case 'kick':
          this.kickUser(socketId);
          break;
        case 'mute-local':
          this.toggleRemoteMute(socketId);
          break;
        case 'private-message':
          this.startPrivateMessage(socketId);
          break;
      }
      
      this.hideContextMenu();
    });
  }

  // Показать контекстное меню
  showContextMenu(e, socketId) {
    e.preventDefault();
    e.stopPropagation();
    
    this.currentContextTarget = socketId;
    const participant = this.participants.get(socketId);
    
    // Показываем только доступные действия
    const kickItem = this.contextMenu.querySelector('[data-action="kick"]');
    if (kickItem) {
      kickItem.style.display = this.app.isHost ? 'flex' : 'none';
    }
    
    // Позиционируем меню
    this.contextMenu.style.left = e.pageX + 'px';
    this.contextMenu.style.top = e.pageY + 'px';
    
    // Проверяем, не выходит ли меню за границы экрана
    const rect = this.contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.contextMenu.style.left = (e.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.contextMenu.style.top = (e.pageY - rect.height) + 'px';
    }
    
    this.contextMenu.classList.add('show');
  }

  // Скрыть контекстное меню
  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.classList.remove('show');
      this.currentContextTarget = null;
    }
  }

  // Переключение вкладок настроек
  switchSettingsTab(tabName) {
    console.log(`Переключение на вкладку: ${tabName}`);
    
    // Убираем активность со всех вкладок
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    
    // Активируем нужную вкладку
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const tabPanel = document.getElementById(`${tabName}-tab`);
    
    if (tabBtn) {
      tabBtn.classList.add('active');
      console.log(`Кнопка вкладки ${tabName} активирована`);
    } else {
      console.warn(`Кнопка вкладки ${tabName} не найдена`);
    }
    
    if (tabPanel) {
      tabPanel.classList.add('active');
      console.log(`Панель вкладки ${tabName} активирована`);
    } else {
      console.warn(`Панель вкладки ${tabName} не найдена`);
    }
  }

  // Применение настроек
  async applySettings() {
    try {
      console.log('Применение настроек...');
      
      // Получаем значения настроек
      const videoQuality = document.getElementById('videoQuality')?.value || '720p';
      const frameRate = document.getElementById('frameRate')?.value || '30';
      const noiseSuppression = document.getElementById('noiseSuppression')?.checked ?? true;
      const echoCancellation = document.getElementById('echoCancellation')?.checked ?? true;
      const autoGainControl = document.getElementById('autoGainControl')?.checked ?? true;
      const soundVolume = document.getElementById('soundVolume')?.value || '50';
      const uiScale = document.getElementById('uiScale')?.value || '1.0';
      const virtualBackground = document.getElementById('virtualBackground')?.value || 'none';
      
      console.log('Настройки:', {
        videoQuality, frameRate, noiseSuppression, 
        echoCancellation, autoGainControl, soundVolume,
        uiScale, virtualBackground
      });
      
      // Применяем настройки звука
      if (this.app.soundboard && this.app.soundboard.audioSynth) {
        this.app.soundboard.audioSynth.volume = soundVolume / 100;
      }
      
      // Применяем масштаб
      this.applyUIScale(uiScale);
      
      // Применяем виртуальный фон
      this.applyVirtualBackground(virtualBackground);
      
      // Сохраняем настройки в localStorage
      const settings = {
        videoQuality,
        frameRate,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        soundVolume,
        uiScale,
        virtualBackground
      };
      
      localStorage.setItem('zloer-settings', JSON.stringify(settings));
      console.log('Настройки сохранены:', settings);
      
      this.showNotification('Настройки применены', 'success');
      this.closeModal(document.getElementById('settingsModal'));
      
      // Если нужно, перезапускаем поток с новыми настройками
      if (this.app.rtc.localStream) {
        await this.app.rtc.updateStreamConstraints(settings);
      }
      
    } catch (error) {
      console.error('Ошибка применения настроек:', error);
      this.showNotification('Ошибка применения настроек', 'error');
    }
  }

  // Сброс настроек
  resetSettings() {
    // Устанавливаем значения по умолчанию
    document.getElementById('videoQuality').value = '720p';
    document.getElementById('frameRate').value = '30';
    document.getElementById('noiseSuppression').checked = true;
    document.getElementById('echoCancellation').checked = true;
    document.getElementById('autoGainControl').checked = true;
    document.getElementById('soundVolume').value = '50';
    document.getElementById('soundVolumeValue').textContent = '50%';
    
    // Удаляем сохраненные настройки
    localStorage.removeItem('zloer-settings');
    
    this.showNotification('Настройки сброшены', 'info');
  }

  // Загрузка сохраненных настроек
  loadSettings() {
    try {
      console.log('Загрузка настроек...');
      const saved = localStorage.getItem('zloer-settings');
      if (saved) {
        const settings = JSON.parse(saved);
        console.log('Загруженные настройки:', settings);
        
        // Устройства и качество
        if (settings.videoQuality) {
          const videoQuality = document.getElementById('videoQuality');
          if (videoQuality) videoQuality.value = settings.videoQuality;
        }
        if (settings.frameRate) {
          const frameRate = document.getElementById('frameRate');
          if (frameRate) frameRate.value = settings.frameRate;
        }
        
        // Звук
        if (typeof settings.noiseSuppression === 'boolean') {
          const noiseSuppression = document.getElementById('noiseSuppression');
          if (noiseSuppression) noiseSuppression.checked = settings.noiseSuppression;
        }
        if (typeof settings.echoCancellation === 'boolean') {
          const echoCancellation = document.getElementById('echoCancellation');
          if (echoCancellation) echoCancellation.checked = settings.echoCancellation;
        }
        if (typeof settings.autoGainControl === 'boolean') {
          const autoGainControl = document.getElementById('autoGainControl');
          if (autoGainControl) autoGainControl.checked = settings.autoGainControl;
        }
        if (settings.soundVolume) {
          const soundVolume = document.getElementById('soundVolume');
          const soundVolumeValue = document.getElementById('soundVolumeValue');
          if (soundVolume) soundVolume.value = settings.soundVolume;
          if (soundVolumeValue) soundVolumeValue.textContent = settings.soundVolume + '%';
        }
        
        // Внешний вид
        if (settings.uiScale) {
          const uiScale = document.getElementById('uiScale');
          if (uiScale) uiScale.value = settings.uiScale;
          this.applyUIScale(settings.uiScale);
        }
        if (settings.virtualBackground) {
          const virtualBackground = document.getElementById('virtualBackground');
          if (virtualBackground) virtualBackground.value = settings.virtualBackground;
          this.applyVirtualBackground(settings.virtualBackground);
        }
      } else {
        console.log('Сохраненные настройки не найдены');
      }
    } catch (error) {
      console.warn('Ошибка загрузки настроек:', error);
    }
  }

  // Начать личное сообщение
  startPrivateMessage(socketId) {
    const participant = this.participants.get(socketId);
    if (participant) {
      const messageInput = document.getElementById('messageInput');
      messageInput.value = `@${participant.nickname} `;
      messageInput.focus();
    }
  }

  // Блокировка/разблокировка комнаты
  toggleRoomLock() {
    if (this.app.isHost) {
      this.app.socket.emit('admin-action', {
        action: 'room-lock',
        locked: !this.roomLocked
      });
    }
  }

  // Открытие настроек
  openSettings() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    
    modal.classList.add('active');
    modal.style.display = 'flex';
    
    // Загружаем сохраненные настройки
    this.loadSettings();
    
    // Загружаем список устройств
    this.loadDevicesList();
    
    // Устанавливаем первую вкладку активной
    this.switchSettingsTab('devices');
  }

  // Закрытие модального окна настроек
  closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  // Инициализация обработчиков настроек
  initSettingsHandlers() {
    // Этот метод больше не нужен, так как обработчики добавляются в initSettingsEventListeners
    console.log('Settings handlers initialized via initSettingsEventListeners');
  }

  // Закрытие модального окна
  closeModal(modal) {
    modal.classList.remove('active');
  }

  // Загрузка списка устройств
  async loadDevicesList() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const cameraSelect = document.getElementById('cameraSelect');
      const microphoneSelect = document.getElementById('microphoneSelect');
      const speakerSelect = document.getElementById('speakerSelect');
      
      // Очищаем списки
      if (cameraSelect) {
        cameraSelect.innerHTML = '<option value="">Выберите камеру...</option>';
      }
      if (microphoneSelect) {
        microphoneSelect.innerHTML = '<option value="">Выберите микрофон...</option>';
      }
      if (speakerSelect) {
        speakerSelect.innerHTML = '<option value="">Выберите динамики...</option>';
      }
      
      devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `${device.kind} ${device.deviceId.substring(0, 8)}`;
        
        if (device.kind === 'videoinput' && cameraSelect) {
          cameraSelect.appendChild(option);
        } else if (device.kind === 'audioinput' && microphoneSelect) {
          microphoneSelect.appendChild(option);
        } else if (device.kind === 'audiooutput' && speakerSelect) {
          speakerSelect.appendChild(option);
        }
      });
    } catch (error) {
      console.error('Ошибка загрузки списка устройств:', error);
    }
  }

  // Заглушить всех (только для хоста)
  muteAll() {
    if (this.app.isHost) {
      this.app.socket.emit('admin-action', {
        action: 'mute-all'
      });
      this.showNotification('Команда заглушения отправлена всем участникам', 'info');
    }
  }

  // Переключение режимов отображения
  switchLayout(layout) {
    this.currentLayout = layout;
    
    // Обновляем кнопки
    document.querySelectorAll('.layout-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(layout === 'grid' ? 'gridViewBtn' : 'speakerViewBtn').classList.add('active');
    
    const videoGrid = document.getElementById('videoGrid');
    const speakerView = document.getElementById('speakerView');
    
    if (layout === 'grid') {
      videoGrid.style.display = 'grid';
      speakerView.style.display = 'none';
      videoGrid.classList.add('grid-view');
    } else {
      videoGrid.style.display = 'none';
      speakerView.style.display = 'flex';
      videoGrid.classList.remove('grid-view');
      this.updateSpeakerView();
    }
    
    // Сохраняем предпочтение
    localStorage.setItem('zloer-layout', layout);
  }

  // Обновление режима докладчика
  updateSpeakerView() {
    const mainSpeakerVideo = document.getElementById('mainSpeakerVideo');
    const thumbnailsContainer = document.getElementById('participantsThumbnails');
    
    // Очищаем контейнеры
    mainSpeakerVideo.innerHTML = '';
    thumbnailsContainer.innerHTML = '';
    
    // Определяем активного докладчика (говорящий или первый участник)
    let speakerElement = null;
    
    if (this.activeSpeaker) {
      const participant = this.participants.get(this.activeSpeaker);
      if (participant && participant.videoElement) {
        speakerElement = participant.videoElement.cloneNode(true);
      }
    }
    
    // Если нет активного докладчика, используем локальное видео
    if (!speakerElement) {
      const localVideo = document.getElementById('localVideoWrapper');
      if (localVideo) {
        speakerElement = localVideo.cloneNode(true);
      }
    }
    
    // Добавляем основное видео
    if (speakerElement) {
      speakerElement.classList.add('main-speaker-video');
      mainSpeakerVideo.appendChild(speakerElement);
    }
    
    // Добавляем миниатюры всех участников
    const allParticipants = [
      { id: 'local', element: document.getElementById('localVideoWrapper'), nickname: 'Вы' },
      ...Array.from(this.participants.entries()).map(([id, data]) => ({
        id, element: data.videoElement, nickname: data.nickname
      }))
    ];
    
    allParticipants.forEach(({ id, element, nickname }) => {
      if (element) {
        const thumbnail = this.createThumbnail(id, element, nickname);
        thumbnailsContainer.appendChild(thumbnail);
      }
    });
  }

  // Создание миниатюры участника
  createThumbnail(id, originalElement, nickname) {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'thumbnail-wrapper';
    thumbnail.dataset.participantId = id;
    
    // Клонируем видео
    const video = originalElement.querySelector('video');
    if (video) {
      const thumbnailVideo = video.cloneNode(true);
      thumbnailVideo.muted = true; // Миниатюры всегда без звука
      thumbnail.appendChild(thumbnailVideo);
    }
    
    // Добавляем overlay с именем
    const overlay = document.createElement('div');
    overlay.className = 'thumbnail-overlay';
    overlay.textContent = nickname;
    thumbnail.appendChild(overlay);
    
    // Обработчик клика для переключения докладчика
    thumbnail.addEventListener('click', () => {
      this.setActiveSpeaker(id);
    });
    
    return thumbnail;
  }

  // Установка активного докладчика
  setActiveSpeaker(participantId) {
    this.activeSpeaker = participantId;
    
    // Обновляем визуальные индикаторы
    document.querySelectorAll('.thumbnail-wrapper').forEach(thumb => {
      thumb.classList.remove('active-speaker');
    });
    
    const activeThumbnail = document.querySelector(`[data-participant-id="${participantId}"]`);
    if (activeThumbnail) {
      activeThumbnail.classList.add('active-speaker');
    }
    
    // Обновляем основное видео
    if (this.currentLayout === 'speaker') {
      this.updateSpeakerView();
    }
  }

  // Инициализация мониторинга сети
  initNetworkMonitor() {
    this.networkMonitor = {
      ping: 0,
      quality: 'excellent',
      lastCheck: Date.now()
    };
    
    // Проверяем состояние сети каждые 5 секунд
    setInterval(() => {
      this.checkNetworkHealth();
    }, 5000);
  }

  // Проверка состояния сети
  async checkNetworkHealth() {
    try {
      const start = Date.now();
      
      // Используем более безопасный способ проверки сети
      const response = await fetch('/', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      const ping = Date.now() - start;
      this.networkMonitor.ping = ping;
      
      // Определяем качество соединения
      let quality = 'excellent';
      if (ping > 150) {
        quality = 'poor';
      } else if (ping > 50) {
        quality = 'good';
      }
      
      this.networkMonitor.quality = quality;
      this.updateNetworkStatus();
      
    } catch (error) {
      console.warn('Ошибка проверки сети:', error);
      this.networkMonitor.quality = 'poor';
      this.networkMonitor.ping = 999;
      this.updateNetworkStatus();
    }
  }

  // Обновление индикатора состояния сети
  updateNetworkStatus() {
    const networkStatus = document.getElementById('networkStatus');
    const networkText = networkStatus.querySelector('.network-text');
    
    networkStatus.className = `network-status ${this.networkMonitor.quality}`;
    networkText.textContent = `${this.networkMonitor.ping}ms`;
    
    const icons = {
      excellent: '📶',
      good: '📶',
      poor: '📵'
    };
    
    networkStatus.querySelector('.network-icon').textContent = icons[this.networkMonitor.quality];
  }

  // Инициализация уведомлений браузера
  async initNotifications() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      this.notificationsEnabled = permission === 'granted';
      
      // Обновляем чекбокс в настройках
      const checkbox = document.getElementById('browserNotifications');
      if (checkbox) {
        checkbox.checked = this.notificationsEnabled;
      }
    }
  }

  // Запрос разрешения на уведомления
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      this.notificationsEnabled = permission === 'granted';
      
      const checkbox = document.getElementById('browserNotifications');
      if (checkbox) {
        checkbox.checked = this.notificationsEnabled;
      }
      
      if (this.notificationsEnabled) {
        this.showNotification('Уведомления браузера включены', 'success');
        this.showBrowserNotification('Zloer', 'Уведомления успешно настроены!');
      } else {
        this.showNotification('Разрешение на уведомления отклонено', 'warning');
      }
    }
  }

  // Показ уведомления браузера
  showBrowserNotification(title, body, icon = '🎮') {
    if (this.notificationsEnabled && document.hidden) {
      new Notification(title, {
        body: body,
        icon: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${icon}</text></svg>`,
        tag: 'zloer-notification'
      });
    }
  }

  // Постучать всем участникам
  nudgeAll() {
    if (this.app.isHost) {
      this.app.socket.emit('admin-action', {
        action: 'nudge-all'
      });
      this.showNotification('Постучали всем участникам', 'info');
    }
  }

  // Применение виртуального фона
  applyVirtualBackground(backgroundType) {
    console.log('Применение виртуального фона:', backgroundType);
    
    const localVideo = document.getElementById('localVideoWrapper');
    if (!localVideo) {
      console.warn('Локальное видео не найдено');
      return;
    }
    
    // Убираем все классы фонов
    localVideo.classList.remove('blur-background', 'custom-background');
    localVideo.style.backgroundImage = '';
    
    switch (backgroundType) {
      case 'blur':
        localVideo.classList.add('blur-background');
        console.log('Применено размытие');
        break;
        
      case 'custom':
        const fileInput = document.getElementById('customBackground');
        if (fileInput) fileInput.click();
        break;
        
      case 'office':
        localVideo.style.backgroundImage = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        localVideo.classList.add('custom-background');
        break;
        
      case 'nature':
        localVideo.style.backgroundImage = 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)';
        localVideo.classList.add('custom-background');
        break;
        
      case 'space':
        localVideo.style.backgroundImage = 'linear-gradient(135deg, #000428 0%, #004e92 100%)';
        localVideo.classList.add('custom-background');
        break;
        
      case 'none':
      default:
        console.log('Фон убран');
        break;
    }
  }

  // Загрузка пользовательского фона
  loadCustomBackground(file) {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const localVideo = document.getElementById('localVideoWrapper');
        if (localVideo) {
          localVideo.style.backgroundImage = `url(${e.target.result})`;
          localVideo.classList.add('custom-background');
        }
      };
      reader.readAsDataURL(file);
    }
  }

  // Применение масштаба интерфейса
  applyUIScale(scale) {
    console.log(`Применение масштаба: ${scale}`);
    
    // Убираем все классы масштабирования
    document.body.classList.remove('ui-scale-80', 'ui-scale-100', 'ui-scale-120', 'ui-scale-140');
    
    // Применяем новый масштаб
    const scaleValue = parseFloat(scale);
    
    if (scaleValue === 0.8) {
      document.body.classList.add('ui-scale-80');
    } else if (scaleValue === 1.2) {
      document.body.classList.add('ui-scale-120');
    } else if (scaleValue === 1.4) {
      document.body.classList.add('ui-scale-140');
    } else {
      document.body.classList.add('ui-scale-100');
    }
    
    // Альтернативный метод для браузеров, поддерживающих zoom
    if (CSS.supports('zoom', '1')) {
      document.body.style.zoom = scale;
    }
    
    // Сохраняем настройку
    localStorage.setItem('zloer-ui-scale', scale);
    
    console.log(`Применен масштаб: ${scale}`);
    this.showNotification(`Масштаб интерфейса: ${Math.round(scaleValue * 100)}%`, 'info');
  }

  // Загрузка истории чата
  loadChatHistory() {
    try {
      const saved = localStorage.getItem('zloer-chat-history');
      if (saved) {
        this.chatHistory = JSON.parse(saved);
        // Восстанавливаем последние 20 сообщений
        this.chatHistory.slice(-20).forEach(message => {
          this.addChatMessage(message, false); // false = не сохранять повторно
        });
      }
    } catch (error) {
      console.warn('Ошибка загрузки истории чата:', error);
    }
  }

  // Сохранение истории чата
  saveChatHistory() {
    try {
      // Сохраняем только последние 50 сообщений
      const historyToSave = this.chatHistory.slice(-50);
      localStorage.setItem('zloer-chat-history', JSON.stringify(historyToSave));
    } catch (error) {
      console.warn('Ошибка сохранения истории чата:', error);
    }
  }

  // Загрузка сохраненного масштаба
  loadUIScale() {
    try {
      const savedScale = localStorage.getItem('zloer-ui-scale');
      if (savedScale) {
        this.applyUIScale(savedScale);
        
        // Обновляем селектор в настройках
        const uiScaleSelect = document.getElementById('uiScale');
        if (uiScaleSelect) {
          uiScaleSelect.value = savedScale;
        }
      }
    } catch (error) {
      console.warn('Ошибка загрузки масштаба:', error);
    }
  }

  // ============================================================================
  // НОВЫЕ ФУНКЦИИ
  // ============================================================================

  // Инициализация индикатора печати
  initTypingIndicator() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    let typingTimeout = null;
    let isTyping = false;

    messageInput.addEventListener('input', () => {
      if (!isTyping) {
        isTyping = true;
        this.app.socket.emit('user-typing', { roomId: this.app.roomId });
      }

      // Сбрасываем таймер
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        this.app.socket.emit('user-stop-typing', { roomId: this.app.roomId });
      }, 2000);
    });

    // Останавливаем индикатор при отправке сообщения
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(typingTimeout);
        if (isTyping) {
          isTyping = false;
          this.app.socket.emit('user-stop-typing', { roomId: this.app.roomId });
        }
      }
    });
  }

  // Обработка начала печати
  handleUserTyping(data) {
    const participant = this.participants.get(data.socketId);
    if (!participant) return;

    participant.isTyping = true;
    this.updateTypingIndicator();
    this.showTypingOnVideo(data.socketId, true);

    // Автоматически убираем индикатор через 5 секунд
    if (this.typingIndicators.has(data.socketId)) {
      clearTimeout(this.typingIndicators.get(data.socketId));
    }

    const timeout = setTimeout(() => {
      this.handleUserStopTyping(data);
    }, 5000);

    this.typingIndicators.set(data.socketId, timeout);
  }

  // Обработка окончания печати
  handleUserStopTyping(data) {
    const participant = this.participants.get(data.socketId);
    if (!participant) return;

    participant.isTyping = false;
    this.updateTypingIndicator();
    this.showTypingOnVideo(data.socketId, false);

    if (this.typingIndicators.has(data.socketId)) {
      clearTimeout(this.typingIndicators.get(data.socketId));
      this.typingIndicators.delete(data.socketId);
    }
  }

  // Обновление индикатора печати в чате
  updateTypingIndicator() {
    let typingIndicator = document.getElementById('typingIndicator');
    
    const typingUsers = Array.from(this.participants.values())
      .filter(p => p.isTyping)
      .map(p => p.nickname);

    if (typingUsers.length === 0) {
      if (typingIndicator) {
        typingIndicator.remove();
      }
      return;
    }

    if (!typingIndicator) {
      typingIndicator = document.createElement('div');
      typingIndicator.id = 'typingIndicator';
      typingIndicator.className = 'typing-indicator';
      
      const chatMessages = document.getElementById('chatMessages');
      chatMessages.appendChild(typingIndicator);
    }

    let text = '';
    if (typingUsers.length === 1) {
      text = `${typingUsers[0]} печатает`;
    } else if (typingUsers.length === 2) {
      text = `${typingUsers[0]} и ${typingUsers[1]} печатают`;
    } else {
      text = `${typingUsers.length} участников печатают`;
    }

    typingIndicator.innerHTML = `
      <span class="typing-text">${text}</span>
      <span class="typing-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
    `;

    // Прокручиваем чат вниз
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Показ индикатора печати на видео
  showTypingOnVideo(socketId, isTyping) {
    const videoElement = document.getElementById(`video-${socketId}`);
    if (!videoElement) return;

    let typingBadge = videoElement.querySelector('.typing-badge');
    
    if (isTyping) {
      if (!typingBadge) {
        typingBadge = document.createElement('div');
        typingBadge.className = 'typing-badge';
        typingBadge.innerHTML = `
          <span class="typing-icon">💬</span>
          <span class="typing-dots-small">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        `;
        videoElement.appendChild(typingBadge);
      }
    } else {
      if (typingBadge) {
        typingBadge.remove();
      }
    }
  }

  // Инициализация Zen Mode
  initZenMode() {
    if (!this.zenModeEnabled) return;

    const controlsPanel = document.querySelector('.controls-panel');
    const header = document.querySelector('.header');
    const sidebar = document.querySelector('.sidebar');

    // Отслеживаем движение мыши
    document.addEventListener('mousemove', () => {
      this.lastMouseActivity = Date.now();
      this.showInterface();
      this.scheduleZenMode();
    });

    // Отслеживаем клики
    document.addEventListener('click', () => {
      this.lastMouseActivity = Date.now();
      this.showInterface();
      this.scheduleZenMode();
    });

    // Отслеживаем нажатия клавиш
    document.addEventListener('keydown', () => {
      this.lastMouseActivity = Date.now();
      this.showInterface();
      this.scheduleZenMode();
    });

    // Запускаем первоначальный таймер
    this.scheduleZenMode();
  }

  // Планирование скрытия интерфейса
  scheduleZenMode() {
    if (this.zenModeTimeout) {
      clearTimeout(this.zenModeTimeout);
    }

    this.zenModeTimeout = setTimeout(() => {
      this.hideInterface();
    }, 3000); // 3 секунды бездействия
  }

  // Скрытие интерфейса
  hideInterface() {
    if (this.currentScreen !== 'videoScreen') return;

    const controlsPanel = document.querySelector('.controls-panel');
    const header = document.querySelector('.header');
    
    if (controlsPanel) {
      controlsPanel.classList.add('zen-hidden');
    }
    if (header) {
      header.classList.add('zen-hidden');
    }

    // Добавляем класс для курсора
    document.body.classList.add('zen-mode');
  }

  // Показ интерфейса
  showInterface() {
    const controlsPanel = document.querySelector('.controls-panel');
    const header = document.querySelector('.header');
    
    if (controlsPanel) {
      controlsPanel.classList.remove('zen-hidden');
    }
    if (header) {
      header.classList.remove('zen-hidden');
    }

    document.body.classList.remove('zen-mode');
  }

  // Инициализация визуализатора шума
  initNoiseVisualizer() {
    if (!this.noiseVisualizerEnabled) return;

    // Этот метод будет вызываться из WebRTCManager при анализе звука
    console.log('Noise Visualizer инициализирован');
  }

  // Визуальная реакция на громкий звук
  triggerNoiseReaction(socketId, volume) {
    if (!this.noiseVisualizerEnabled) return;

    const videoElement = document.getElementById(`video-${socketId}`) || 
                        document.getElementById('localVideoWrapper');
    
    if (!videoElement) return;

    // Определяем интенсивность эффекта на основе громкости
    const intensity = Math.min(volume / 100, 1); // Нормализуем до 0-1

    if (intensity > 0.7) { // Очень громко - тряска
      videoElement.classList.add('noise-shake');
      setTimeout(() => {
        videoElement.classList.remove('noise-shake');
      }, 500);
    } else if (intensity > 0.5) { // Громко - увеличение
      videoElement.classList.add('noise-scale');
      setTimeout(() => {
        videoElement.classList.remove('noise-scale');
      }, 300);
    } else if (intensity > 0.3) { // Средне - пульсация
      videoElement.classList.add('noise-pulse');
      setTimeout(() => {
        videoElement.classList.remove('noise-pulse');
      }, 200);
    }
  }

  // Получение местного времени участника
  getParticipantLocalTime(socketId) {
    const participant = this.participants.get(socketId);
    if (!participant || !participant.timezone) {
      return new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    try {
      return new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: participant.timezone
      });
    } catch (error) {
      console.warn('Ошибка получения времени для часового пояса:', participant.timezone);
      return new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  // Обновление времени участников (вызывается каждую минуту)
  updateParticipantTimes() {
    this.participants.forEach((participant, socketId) => {
      const timeElement = document.querySelector(`[data-participant-time="${socketId}"]`);
      if (timeElement) {
        timeElement.textContent = this.getParticipantLocalTime(socketId);
      }
    });

    // Обновляем свое время
    const localTimeElement = document.querySelector('[data-participant-time="local"]');
    if (localTimeElement) {
      localTimeElement.textContent = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  // ============================================================================
  // ПОЛНОЭКРАННЫЙ РЕЖИМ
  // ============================================================================

  // Инициализация полноэкранного режима
  initFullscreenMode() {
    // Отслеживаем изменения полноэкранного режима браузера
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.isFullscreen) {
        this.exitFullscreen();
      }
    });

    // Обработчики для различных браузеров
    document.addEventListener('webkitfullscreenchange', () => {
      if (!document.webkitFullscreenElement && this.isFullscreen) {
        this.exitFullscreen();
      }
    });

    document.addEventListener('mozfullscreenchange', () => {
      if (!document.mozFullScreenElement && this.isFullscreen) {
        this.exitFullscreen();
      }
    });
  }

  // Переключение полноэкранного режима
  async toggleFullscreen() {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      await this.enterFullscreen();
    }
  }

  // Вход в полноэкранный режим
  async enterFullscreen() {
    try {
      const videoScreen = document.getElementById('videoScreen');
      
      // Запрашиваем полноэкранный режим браузера
      if (videoScreen.requestFullscreen) {
        await videoScreen.requestFullscreen();
      } else if (videoScreen.webkitRequestFullscreen) {
        await videoScreen.webkitRequestFullscreen();
      } else if (videoScreen.mozRequestFullScreen) {
        await videoScreen.mozRequestFullScreen();
      } else if (videoScreen.msRequestFullscreen) {
        await videoScreen.msRequestFullscreen();
      }

      // Применяем стили полноэкранного режима
      videoScreen.classList.add('fullscreen-mode');
      this.isFullscreen = true;

      // Создаем элементы управления для полного экрана
      this.createFullscreenControls();

      // Обновляем кнопки
      this.updateFullscreenButtons();

      // Показываем уведомление
      this.showFullscreenNotification('Полноэкранный режим включен. Нажмите Escape для выхода.');

      // Запускаем автоскрытие интерфейса
      this.startFullscreenAutoHide();

      console.log('Полноэкранный режим включен');
      
    } catch (error) {
      console.error('Ошибка входа в полноэкранный режим:', error);
      this.showNotification('Не удалось войти в полноэкранный режим', 'error');
    }
  }

  // Выход из полноэкранного режима
  exitFullscreen() {
    const videoScreen = document.getElementById('videoScreen');
    
    // Выходим из полноэкранного режима браузера
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }

    // Убираем стили полноэкранного режима
    videoScreen.classList.remove('fullscreen-mode', 'auto-hide');
    this.isFullscreen = false;

    // Удаляем элементы управления полного экрана
    this.removeFullscreenControls();

    // Обновляем кнопки
    this.updateFullscreenButtons();

    // Останавливаем автоскрытие
    this.stopFullscreenAutoHide();

    // Показываем уведомление
    this.showFullscreenNotification('Полноэкранный режим выключен');

    console.log('Полноэкранный режим выключен');
  }

  // Создание элементов управления для полного экрана
  createFullscreenControls() {
    // Кнопка выхода
    const exitBtn = document.createElement('button');
    exitBtn.className = 'exit-fullscreen';
    exitBtn.innerHTML = '✕';
    exitBtn.title = 'Выйти из полного экрана (Escape)';
    exitBtn.onclick = () => this.exitFullscreen();
    document.body.appendChild(exitBtn);

    // Кнопка переключения чата
    const chatToggle = document.createElement('button');
    chatToggle.className = 'fullscreen-chat-toggle';
    chatToggle.innerHTML = '💬';
    chatToggle.title = 'Показать/скрыть чат';
    chatToggle.onclick = () => this.toggleFullscreenChat();
    document.body.appendChild(chatToggle);
  }

  // Удаление элементов управления полного экрана
  removeFullscreenControls() {
    const exitBtn = document.querySelector('.exit-fullscreen');
    const chatToggle = document.querySelector('.fullscreen-chat-toggle');
    
    if (exitBtn) exitBtn.remove();
    if (chatToggle) chatToggle.remove();
  }

  // Переключение чата в полноэкранном режиме
  toggleFullscreenChat() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('visible');
  }

  // Обновление кнопок полноэкранного режима
  updateFullscreenButtons() {
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const fullscreenToggle = document.getElementById('fullscreenToggle');
    
    if (this.isFullscreen) {
      fullscreenBtn?.classList.add('active');
      fullscreenToggle?.classList.add('active');
      
      if (fullscreenToggle) {
        fullscreenToggle.querySelector('.icon').textContent = '⛶';
        fullscreenToggle.querySelector('.label').textContent = 'Выйти';
        fullscreenToggle.title = 'Выйти из полного экрана (Escape)';
      }
    } else {
      fullscreenBtn?.classList.remove('active');
      fullscreenToggle?.classList.remove('active');
      
      if (fullscreenToggle) {
        fullscreenToggle.querySelector('.icon').textContent = '⛶';
        fullscreenToggle.querySelector('.label').textContent = 'Полный экран';
        fullscreenToggle.title = 'Полный экран (F11)';
      }
    }
  }

  // Показ уведомления о полноэкранном режиме
  showFullscreenNotification(message) {
    let indicator = document.querySelector('.fullscreen-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'fullscreen-indicator';
      document.body.appendChild(indicator);
    }
    
    indicator.textContent = message;
    indicator.classList.add('show');
    
    setTimeout(() => {
      indicator.classList.remove('show');
    }, 3000);
  }

  // Запуск автоскрытия интерфейса в полном экране
  startFullscreenAutoHide() {
    const videoScreen = document.getElementById('videoScreen');
    
    const resetTimer = () => {
      videoScreen.classList.remove('auto-hide');
      
      clearTimeout(this.fullscreenAutoHideTimeout);
      this.fullscreenAutoHideTimeout = setTimeout(() => {
        if (this.isFullscreen) {
          videoScreen.classList.add('auto-hide');
        }
      }, 3000);
    };

    // Показываем интерфейс при движении мыши
    document.addEventListener('mousemove', resetTimer);
    document.addEventListener('click', resetTimer);
    document.addEventListener('keydown', resetTimer);

    // Запускаем первоначальный таймер
    resetTimer();
  }

  // Остановка автоскрытия интерфейса
  stopFullscreenAutoHide() {
    clearTimeout(this.fullscreenAutoHideTimeout);
  }

  // ============================================================================
  // МОБИЛЬНЫЕ ОПТИМИЗАЦИИ
  // ============================================================================

  // Инициализация мобильных оптимизаций
  initMobileOptimizations() {
    // Определяем мобильное устройство
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (this.isMobile) {
      console.log('Мобильное устройство обнаружено, применяем оптимизации');
      
      // Предотвращаем зум при фокусе на input
      this.preventInputZoom();
      
      // Оптимизируем сенсорное управление
      this.optimizeTouchControls();
      
      // Автоматически скрываем чат на маленьких экранах
      this.autoHideChatOnSmallScreens();
      
      // Оптимизируем видео для мобильных
      this.optimizeVideoForMobile();
      
      // Добавляем поддержку свайпов
      this.addSwipeSupport();
    }
  }

  // Предотвращение зума при фокусе на input
  preventInputZoom() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], textarea');
    inputs.forEach(input => {
      // Устанавливаем минимальный размер шрифта 16px для предотвращения зума на iOS
      if (input.style.fontSize === '' || parseInt(input.style.fontSize) < 16) {
        input.style.fontSize = '16px';
      }
    });
  }

  // Оптимизация сенсорного управления
  optimizeTouchControls() {
    // Увеличиваем область нажатия для кнопок
    const buttons = document.querySelectorAll('button, .control-btn, .btn-primary, .btn-danger');
    buttons.forEach(button => {
      button.style.minHeight = '44px';
      button.style.minWidth = '44px';
    });

    // Добавляем тактильную обратную связь
    if ('vibrate' in navigator) {
      buttons.forEach(button => {
        button.addEventListener('touchstart', () => {
          navigator.vibrate(10); // Короткая вибрация при нажатии
        });
      });
    }
  }

  // Автоматическое скрытие чата на маленьких экранах
  autoHideChatOnSmallScreens() {
    const checkScreenSize = () => {
      if (window.innerWidth < 480) {
        // На очень маленьких экранах скрываем чат по умолчанию
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && !sidebar.classList.contains('hidden')) {
          this.toggleChatVisibility();
        }
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
  }

  // Оптимизация видео для мобильных
  optimizeVideoForMobile() {
    // Уменьшаем качество видео на мобильных для экономии трафика
    const videoConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15 }
    };

    // Применяем при инициализации потока
    if (this.app.rtc && this.app.rtc.localStream) {
      console.log('Применяем мобильные настройки видео');
    }
  }

  // Добавление поддержки свайпов
  addSwipeSupport() {
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    // Обработчики свайпов
    const handleTouchStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      endX = e.changedTouches[0].clientX;
      endY = e.changedTouches[0].clientY;
      
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      
      // Проверяем, что это горизонтальный свайп
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          // Свайп вправо - показать чат
          if (sidebar && sidebar.classList.contains('hidden')) {
            this.toggleChatVisibility();
          }
        } else {
          // Свайп влево - скрыть чат
          if (sidebar && !sidebar.classList.contains('hidden')) {
            this.toggleChatVisibility();
          }
        }
      }
    };

    if (mainContent) {
      mainContent.addEventListener('touchstart', handleTouchStart, { passive: true });
      mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  }

  // Переключение чата с учетом мобильных особенностей
  toggleChatVisibility() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('toggleChat');
    
    this.isChatVisible = !this.isChatVisible;
    
    if (this.isChatVisible) {
      sidebar.classList.remove('hidden');
      if (toggleBtn) toggleBtn.textContent = '💬';
      
      // На мобильных показываем уведомление
      if (this.isMobile) {
        this.showNotification('Чат открыт. Свайп влево для закрытия', 'info');
      }
    } else {
      sidebar.classList.add('hidden');
      if (toggleBtn) toggleBtn.textContent = '💬';
      
      if (this.isMobile) {
        this.showNotification('Чат скрыт. Свайп вправо для открытия', 'info');
      }
    }
  }

  // ============================================================================
  // MASCOT SYSTEM - Интерактивный маскот Zloer Dragon
  // ============================================================================
  
  initMascot() {
    this.mascot = document.querySelector('.mascot-dragon');
    
    if (this.mascot) {
      // Клик по эмодзи маскоту
      this.mascot.addEventListener('click', () => {
        this.handleMascotClick();
      });
    }

    // Реакция маскота на события
    this.setupMascotReactions();
    
    console.log('🐲 Zloer Dragon маскот инициализирован!');
  }

  handleMascotImageClick() {
    // Анимация для оригинального изображения
    this.mascotImage.style.animation = 'mascot-image-pulse 0.5s ease-in-out';
    
    setTimeout(() => {
      this.mascotImage.style.animation = 'mascot-image-glow 3s ease-in-out infinite';
    }, 500);

    // Звуковой эффект
    if (this.app.audioSynth) {
      this.app.audioSynth.playLevelUp();
    }

    // Специальные фразы для оригинального маскота
    const phrases = [
      'Оригинальный Zloer Dragon в деле! 🐲⚡',
      'Кибер-дракон готов к битве! 🔥',
      'Connect. Play. Zloer - с мощью дракона! 💪',
      'Цифровая магия активирована! ✨',
      'Легендарный дракон на страже игр! 🛡️'
    ];
    
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.showNotification(randomPhrase, 'success');
  }

  handleMascotClick() {
    this.mascotClickCount++;
    
    // Обычная реакция
    this.mascot.classList.add('celebrating');
    setTimeout(() => {
      this.mascot.classList.remove('celebrating');
    }, 1000);

    // Пасхалка при множественных кликах
    if (this.mascotClickCount >= 10) {
      this.activateLegendaryMascot();
      this.mascotClickCount = 0;
    }

    // Звуковой эффект
    if (this.app.audioSynth) {
      this.app.audioSynth.playNotification();
    }

    // Случайные фразы маскота
    const phrases = [
      'Zloer Dragon приветствует тебя! 🐲',
      'Connect. Play. Zloer! ⚡',
      'Готов к эпичным играм? 🎮',
      'Твой цифровой дракон на страже! 🛡️',
      'Время для легендарных побед! 🏆'
    ];
    
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.showNotification(randomPhrase, 'info');
  }

  activateLegendaryMascot() {
    this.mascot.classList.add('legendary');
    this.showNotification('🌟 ЛЕГЕНДАРНЫЙ РЕЖИМ АКТИВИРОВАН! 🌟', 'success');
    
    // Убираем эффект через 10 секунд
    setTimeout(() => {
      this.mascot.classList.remove('legendary');
    }, 10000);

    // Специальный звук
    if (this.app.audioSynth) {
      this.app.audioSynth.playLevelUp();
    }
  }

  setupMascotReactions() {
    // Реакция на присоединение пользователей
    this.app.socket.on('user-joined', () => {
      this.mascotReact('celebrating');
    });

    // Реакция на сообщения в чате
    this.app.socket.on('chat-message', () => {
      this.mascotReact('speaking');
    });

    // Реакция на звуковые эффекты
    this.app.socket.on('play-sound', () => {
      this.mascotReact('excited');
    });
  }

  mascotReact(reactionType) {
    if (!this.mascot) return;

    // Убираем предыдущие классы реакций
    this.mascot.classList.remove('celebrating', 'thinking', 'speaking', 'excited');
    
    // Добавляем новую реакцию
    this.mascot.classList.add(reactionType);
    
    // Убираем через время
    setTimeout(() => {
      this.mascot.classList.remove(reactionType);
    }, reactionType === 'speaking' ? 2000 : 1000);
  }

  // Маскот думает при загрузке
  mascotThinking(duration = 3000) {
    if (!this.mascot) return;
    
    this.mascot.classList.add('thinking');
    setTimeout(() => {
      this.mascot.classList.remove('thinking');
    }, duration);
  }
}

// ============================================================================
// SOUNDBOARD - Геймерские звуковые эффекты
// ============================================================================
class Soundboard {
  constructor(socket) {
    this.socket = socket;
    this.audioSynth = new AudioSynth();
    this.sounds = {
      'gg': () => this.audioSynth.playGG(),
      'fail': () => this.audioSynth.playFail(),
      'level-up': () => this.audioSynth.playLevelUp(),
      'horn': () => this.audioSynth.playHorn()
    };
    
    this.initSoundboard();
    this.setupSocketEvents();
  }

  initSoundboard() {
    // Создаем панель саундборда
    const controlsPanel = document.querySelector('.controls-panel');
    const soundboardDiv = document.createElement('div');
    soundboardDiv.className = 'soundboard-panel';
    soundboardDiv.innerHTML = `
      <h4>🎵 Звуковые эффекты</h4>
      <div class="soundboard-buttons">
        <button class="sound-btn" data-sound="gg">GG! 🎉</button>
        <button class="sound-btn" data-sound="fail">Fail 😅</button>
        <button class="sound-btn" data-sound="level-up">Level Up! ⬆️</button>
        <button class="sound-btn" data-sound="horn">Horn 📯</button>
      </div>
    `;
    
    controlsPanel.appendChild(soundboardDiv);
    
    // Добавляем обработчики событий
    soundboardDiv.addEventListener('click', (e) => {
      if (e.target.classList.contains('sound-btn')) {
        const soundName = e.target.dataset.sound;
        this.playSound(soundName, true); // true = отправить другим
      }
    });
  }

  setupSocketEvents() {
    this.socket.on('play-sound', (data) => {
      this.playSound(data.sound, false); // false = не отправлять другим
      window.app.ui.showNotification(`${data.nickname} проиграл звук: ${data.sound}`, 'info');
    });
  }

  playSound(soundName, sendToOthers = false) {
    if (this.sounds[soundName]) {
      try {
        // Проигрываем звук локально
        this.sounds[soundName]();
        
        // Отправляем звук другим участникам
        if (sendToOthers) {
          this.socket.emit('play-sound', { 
            sound: soundName,
            nickname: window.app.nickname 
          });
        }
      } catch (error) {
        console.error('Ошибка воспроизведения звука:', error);
      }
    }
  }
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  console.log('🎮 Zloer инициализирован и готов к работе!');
  console.log('Connect. Play. Zloer - Доступ к приложению: window.app');
  console.log('Доступ к UI: window.app.ui');
});

// Обработка ошибок
window.addEventListener('error', (event) => {
  console.error('Глобальная ошибка:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Необработанное отклонение промиса:', event.reason);
});