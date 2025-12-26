// Zloer - Вспомогательные функции и утилиты
// Connect. Play. Zloer - Генерация звуков через Web Audio API без внешних файлов

// ============================================================================
// AUDIO SYNTHESIZER - Генерация звуков на лету
// ============================================================================
class AudioSynth {
  constructor() {
    this.audioContext = null;
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API не поддерживается:', error);
    }
  }

  // Базовый метод для создания звука
  createTone(frequency, duration, waveType = 'sine', volume = 0.3) {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = waveType;

    // Плавное нарастание и затухание
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);

    return { oscillator, gainNode };
  }

  // Уведомление - короткий высокий сигнал
  playNotification() {
    this.createTone(800, 0.2, 'sine', 0.2);
  }

  // Присоединение - восходящий тон
  playJoin() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'sine';
    
    // Восходящий тон от 400 до 800 Гц
    oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(800, this.audioContext.currentTime + 0.5);

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.5);
  }

  // Покидание - нисходящий тон
  playLeave() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'sine';
    
    // Нисходящий тон от 600 до 200 Гц
    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(200, this.audioContext.currentTime + 0.6);

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25, this.audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.6);
  }

  // Ошибка - низкий "buzz"
  playError() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);

    // Модуляция для создания "buzz" эффекта
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    lfo.frequency.setValueAtTime(10, this.audioContext.currentTime);
    lfo.type = 'sine';
    lfoGain.gain.setValueAtTime(20, this.audioContext.currentTime);
    
    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, this.audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.8);

    lfo.start(this.audioContext.currentTime);
    oscillator.start(this.audioContext.currentTime);
    
    lfo.stop(this.audioContext.currentTime + 0.8);
    oscillator.stop(this.audioContext.currentTime + 0.8);
  }

  // GG - праздничный звук
  playGG() {
    // Последовательность нот для "победного" звука
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.createTone(freq, 0.3, 'sine', 0.2);
      }, index * 150);
    });
  }

  // Fail - грустный звук
  playFail() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'triangle';
    
    // Нисходящий тон с вибрато
    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(220, this.audioContext.currentTime + 1);

    // Добавляем вибрато
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    
    lfo.frequency.setValueAtTime(5, this.audioContext.currentTime);
    lfo.type = 'sine';
    lfoGain.gain.setValueAtTime(10, this.audioContext.currentTime);
    
    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 1);

    lfo.start(this.audioContext.currentTime);
    oscillator.start(this.audioContext.currentTime);
    
    lfo.stop(this.audioContext.currentTime + 1);
    oscillator.stop(this.audioContext.currentTime + 1);
  }

  // Level Up - восходящий арпеджио
  playLevelUp() {
    const notes = [262, 330, 392, 523, 659]; // C4, E4, G4, C5, E5
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.createTone(freq, 0.4, 'sine', 0.25);
      }, index * 100);
    });
  }

  // Horn - сигнал горна
  playHorn() {
    if (!this.audioContext) return;

    const frequencies = [349, 440, 523]; // F4, A4, C5
    
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.4);
      }, index * 200);
    });
  }
}

// ============================================================================
// MODAL MANAGER - Красивые модальные окна
// ============================================================================
class ModalManager {
  constructor() {
    this.createModalContainer();
  }

  createModalContainer() {
    // Создаем контейнер для модальных окон если его нет
    if (!document.getElementById('modalContainer')) {
      const container = document.createElement('div');
      container.id = 'modalContainer';
      container.className = 'modal-container';
      document.body.appendChild(container);
    }
  }

  showModal(title, message, type = 'info', buttons = []) {
    const container = document.getElementById('modalContainer');
    
    const modal = document.createElement('div');
    modal.className = `custom-modal ${type}`;
    
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    // Иконка в зависимости от типа
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅',
      question: '❓'
    };
    
    content.innerHTML = `
      <div class="modal-header">
        <div class="modal-icon">${icons[type] || icons.info}</div>
        <h3 class="modal-title">${title}</h3>
      </div>
      <div class="modal-body">
        <p class="modal-message">${message}</p>
      </div>
      <div class="modal-footer">
        ${buttons.length === 0 ? '<button class="btn-primary modal-btn" data-action="close">OK</button>' : 
          buttons.map(btn => `<button class="btn-${btn.type || 'primary'} modal-btn" data-action="${btn.action}">${btn.text}</button>`).join('')}
      </div>
    `;
    
    modal.appendChild(backdrop);
    modal.appendChild(content);
    container.appendChild(modal);
    
    // Анимация появления
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
    
    // Обработка кликов
    return new Promise((resolve) => {
      modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop') || 
            e.target.classList.contains('modal-btn')) {
          
          const action = e.target.dataset.action || 'close';
          
          modal.classList.remove('show');
          setTimeout(() => {
            modal.remove();
            resolve(action);
          }, 300);
        }
      });
    });
  }

  showError(title, message) {
    return this.showModal(title, message, 'error');
  }

  showWarning(title, message) {
    return this.showModal(title, message, 'warning');
  }

  showSuccess(title, message) {
    return this.showModal(title, message, 'success');
  }

  showConfirm(title, message) {
    return this.showModal(title, message, 'question', [
      { text: 'Отмена', type: 'secondary', action: 'cancel' },
      { text: 'Подтвердить', type: 'primary', action: 'confirm' }
    ]);
  }
}

// ============================================================================
// UTILITY FUNCTIONS - Вспомогательные функции
// ============================================================================

// Форматирование времени
function formatTime(date) {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Форматирование даты и времени
function formatDateTime(date) {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Генерация случайного ID
function generateId(length = 8) {
  return Math.random().toString(36).substring(2, length + 2).toUpperCase();
}

// Экранирование HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Проверка поддержки WebRTC
function checkWebRTCSupport() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.RTCPeerConnection &&
    window.RTCSessionDescription &&
    window.RTCIceCandidate
  );
}

// Определение типа устройства
function getDeviceType() {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (/mobile|android|iphone|ipad|phone/i.test(userAgent)) {
    return 'mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    return 'tablet';
  } else {
    return 'desktop';
  }
}

// Проверка HTTPS
function isSecureContext() {
  return location.protocol === 'https:' || 
         location.hostname === 'localhost' || 
         location.hostname === '127.0.0.1';
}

// Копирование текста в буфер обмена
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback для старых браузеров
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  }
}

// Дебаунс функция
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Троттлинг функция
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AudioSynth,
    ModalManager,
    formatTime,
    formatDateTime,
    generateId,
    escapeHtml,
    checkWebRTCSupport,
    getDeviceType,
    isSecureContext,
    copyToClipboard,
    debounce,
    throttle
  };
}