# Design Document - P2P File Sharing

## Overview

This document outlines the technical design for implementing P2P file sharing in NearSap video chat application. The feature will allow participants to send files directly to each other using WebRTC Data Channels, bypassing the server for file transfer.

## Architecture

### High-Level Architecture

```
┌─────────────────┐    WebRTC Data Channel    ┌─────────────────┐
│   Participant A │◄──────────────────────────►│   Participant B │
│                 │                            │                 │
│ ┌─────────────┐ │                            │ ┌─────────────┐ │
│ │File Transfer│ │                            │ │File Transfer│ │
│ │   Manager   │ │                            │ │   Manager   │ │
│ └─────────────┘ │                            │ └─────────────┘ │
│                 │                            │                 │
│ ┌─────────────┐ │    Socket.IO (Signaling)  │ ┌─────────────┐ │
│ │    UI       │ │◄──────────────────────────►│ │    UI       │ │
│ │  Manager    │ │                            │ │  Manager    │ │
│ └─────────────┘ │                            │ └─────────────┘ │
└─────────────────┘                            └─────────────────┘
                 ▲                                      ▲
                 │                                      │
                 └──────────► Server (Signaling) ◄──────┘
```

### Component Architecture

1. **FileTransferManager** - Core file transfer logic
2. **P2PConnection** - WebRTC Data Channel management
3. **FileChunker** - File chunking and reassembly
4. **TransferUI** - User interface components
5. **SecurityValidator** - File validation and security checks

## Technical Implementation

### 1. FileTransferManager Class

```javascript
class FileTransferManager {
  constructor(rtcManager, socket) {
    this.rtcManager = rtcManager;
    this.socket = socket;
    this.activeTransfers = new Map(); // transferId -> TransferSession
    this.dataChannels = new Map(); // socketId -> RTCDataChannel
    this.maxFileSize = 2 * 1024 * 1024 * 1024; // 2GB
    this.chunkSize = 64 * 1024; // 64KB
    this.allowedExtensions = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
      'pdf', 'doc', 'docx', 'txt', 'rtf',
      'mp3', 'wav', 'ogg', 'mp4', 'webm', 'avi',
      'zip', 'rar', '7z', 'tar', 'gz'
    ]);
    this.blockedExtensions = new Set([
      'exe', 'bat', 'cmd', 'scr', 'com', 'pif',
      'vbs', 'js', 'jar', 'msi', 'dll'
    ]);
  }
}
```

### 2. Data Channel Setup

```javascript
// In WebRTCManager class - extend existing functionality
setupDataChannels(peer, socketId) {
  // Create reliable data channel for file transfer
  const dataChannel = peer.createDataChannel('fileTransfer', {
    ordered: true,
    maxRetransmits: 3
  });
  
  dataChannel.binaryType = 'arraybuffer';
  
  dataChannel.onopen = () => {
    console.log(`Data channel opened with ${socketId}`);
    this.fileTransferManager.onDataChannelOpen(socketId, dataChannel);
  };
  
  dataChannel.onmessage = (event) => {
    this.fileTransferManager.handleDataChannelMessage(socketId, event.data);
  };
  
  dataChannel.onerror = (error) => {
    console.error(`Data channel error with ${socketId}:`, error);
  };
  
  // Handle incoming data channels
  peer.ondatachannel = (event) => {
    const channel = event.channel;
    if (channel.label === 'fileTransfer') {
      this.fileTransferManager.onDataChannelOpen(socketId, channel);
      channel.onmessage = (event) => {
        this.fileTransferManager.handleDataChannelMessage(socketId, event.data);
      };
    }
  };
}
```

### 3. File Transfer Protocol

#### Message Types

```javascript
const MessageTypes = {
  TRANSFER_REQUEST: 'transfer_request',
  TRANSFER_ACCEPT: 'transfer_accept',
  TRANSFER_REJECT: 'transfer_reject',
  TRANSFER_START: 'transfer_start',
  CHUNK_DATA: 'chunk_data',
  CHUNK_ACK: 'chunk_ack',
  TRANSFER_COMPLETE: 'transfer_complete',
  TRANSFER_ERROR: 'transfer_error',
  TRANSFER_CANCEL: 'transfer_cancel'
};
```

#### Message Structure

```javascript
// Transfer Request
{
  type: 'transfer_request',
  transferId: 'uuid',
  fileName: 'document.pdf',
  fileSize: 1024000,
  fileType: 'application/pdf',
  checksum: 'sha256-hash',
  timestamp: Date.now()
}

// Chunk Data
{
  type: 'chunk_data',
  transferId: 'uuid',
  chunkIndex: 0,
  totalChunks: 16,
  data: ArrayBuffer,
  checksum: 'chunk-hash'
}
```

### 4. File Chunking Strategy

```javascript
class FileChunker {
  static chunkFile(file, chunkSize = 64 * 1024) {
    const chunks = [];
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      chunks.push({
        index: i,
        data: chunk,
        size: end - start
      });
    }
    
    return chunks;
  }
  
  static async calculateChecksum(data) {
    const buffer = await data.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
```

### 5. Transfer Session Management

```javascript
class TransferSession {
  constructor(transferId, file, targetSocketId, direction) {
    this.transferId = transferId;
    this.file = file;
    this.targetSocketId = targetSocketId;
    this.direction = direction; // 'sending' or 'receiving'
    this.status = 'pending'; // pending, active, completed, failed, cancelled
    this.chunks = [];
    this.receivedChunks = new Map();
    this.progress = 0;
    this.startTime = null;
    this.endTime = null;
    this.speed = 0;
    this.retryCount = 0;
    this.maxRetries = 3;
  }
  
  updateProgress() {
    if (this.direction === 'sending') {
      this.progress = (this.sentChunks / this.totalChunks) * 100;
    } else {
      this.progress = (this.receivedChunks.size / this.totalChunks) * 100;
    }
    
    // Calculate transfer speed
    if (this.startTime) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const bytesTransferred = (this.progress / 100) * this.file.size;
      this.speed = bytesTransferred / elapsed; // bytes per second
    }
  }
}
```

## User Interface Design

### 1. Drag & Drop Zone

```javascript
// Add to video wrapper elements
class DragDropHandler {
  constructor(videoElement, socketId, fileTransferManager) {
    this.videoElement = videoElement;
    this.socketId = socketId;
    this.fileTransferManager = fileTransferManager;
    this.initDragDrop();
  }
  
  initDragDrop() {
    this.videoElement.addEventListener('dragover', this.handleDragOver.bind(this));
    this.videoElement.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.videoElement.addEventListener('drop', this.handleDrop.bind(this));
  }
  
  handleDragOver(e) {
    e.preventDefault();
    this.videoElement.classList.add('drag-over');
    this.showDropIndicator();
  }
  
  handleDrop(e) {
    e.preventDefault();
    this.videoElement.classList.remove('drag-over');
    this.hideDropIndicator();
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      this.fileTransferManager.initiateTransfer(files[0], this.socketId);
    }
  }
}
```

### 2. Transfer Progress UI

```html
<!-- Transfer Progress Modal -->
<div id="transferProgressModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>📁 Передача файлов</h3>
      <button class="modal-close">&times;</button>
    </div>
    <div class="modal-body">
      <div id="activeTransfers" class="transfers-list">
        <!-- Dynamic transfer items -->
      </div>
    </div>
  </div>
</div>

<!-- Transfer Item Template -->
<div class="transfer-item" data-transfer-id="{transferId}">
  <div class="transfer-info">
    <div class="file-icon">📄</div>
    <div class="file-details">
      <div class="file-name">{fileName}</div>
      <div class="file-size">{fileSize}</div>
      <div class="transfer-participants">
        <span class="sender">{senderName}</span>
        <span class="arrow">→</span>
        <span class="receiver">{receiverName}</span>
      </div>
    </div>
  </div>
  <div class="transfer-progress">
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
    <div class="progress-text">{progress}% • {speed} • {timeRemaining}</div>
  </div>
  <div class="transfer-actions">
    <button class="btn-small btn-danger cancel-btn">Отменить</button>
  </div>
</div>
```

### 3. File Receive Notification

```javascript
// Enhanced notification system for file transfers
class FileTransferNotifications {
  static showReceiveRequest(senderName, fileName, fileSize, transferId) {
    return window.app.modalManager.showModal(
      'Входящий файл',
      `${senderName} хочет отправить вам файл:\n\n📄 ${fileName}\n📊 ${this.formatFileSize(fileSize)}`,
      'question',
      [
        { text: 'Отклонить', type: 'secondary', action: 'reject' },
        { text: 'Принять', type: 'primary', action: 'accept' }
      ]
    );
  }
  
  static formatFileSize(bytes) {
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
```

## Security Implementation

### 1. File Validation

```javascript
class SecurityValidator {
  static validateFile(file) {
    const errors = [];
    
    // Size check
    if (file.size > 2 * 1024 * 1024 * 1024) { // 2GB
      errors.push('Файл слишком большой (максимум 2 ГБ)');
    }
    
    // Extension check
    const extension = file.name.split('.').pop().toLowerCase();
    const blockedExtensions = ['exe', 'bat', 'cmd', 'scr', 'com', 'pif', 'vbs', 'js', 'jar', 'msi', 'dll'];
    
    if (blockedExtensions.includes(extension)) {
      errors.push('Тип файла запрещен из соображений безопасности');
    }
    
    // Name validation
    if (file.name.length > 255) {
      errors.push('Имя файла слишком длинное');
    }
    
    if (!/^[a-zA-Z0-9._\-\s()[\]{}]+$/.test(file.name)) {
      errors.push('Имя файла содержит недопустимые символы');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static async scanFileContent(file) {
    // Basic content validation
    const firstChunk = file.slice(0, 1024);
    const buffer = await firstChunk.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Check for executable signatures
    const executableSignatures = [
      [0x4D, 0x5A], // PE executable
      [0x7F, 0x45, 0x4C, 0x46], // ELF executable
      [0xCA, 0xFE, 0xBA, 0xBE], // Mach-O executable
    ];
    
    for (const signature of executableSignatures) {
      if (this.matchesSignature(bytes, signature)) {
        return {
          safe: false,
          reason: 'Файл содержит исполняемый код'
        };
      }
    }
    
    return { safe: true };
  }
  
  static matchesSignature(bytes, signature) {
    if (bytes.length < signature.length) return false;
    
    for (let i = 0; i < signature.length; i++) {
      if (bytes[i] !== signature[i]) return false;
    }
    
    return true;
  }
}
```

### 2. Transfer Encryption (Optional Enhancement)

```javascript
// For future implementation - encrypt file chunks
class TransferEncryption {
  static async generateKeyPair() {
    return await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  static async encryptChunk(data, publicKey) {
    return await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      data
    );
  }
}
```

## Error Handling & Recovery

### 1. Connection Recovery

```javascript
class TransferRecovery {
  static async resumeTransfer(transferSession) {
    // Identify missing chunks
    const missingChunks = [];
    for (let i = 0; i < transferSession.totalChunks; i++) {
      if (!transferSession.receivedChunks.has(i)) {
        missingChunks.push(i);
      }
    }
    
    // Request retransmission
    if (missingChunks.length > 0) {
      transferSession.requestChunkRetransmission(missingChunks);
    }
  }
  
  static handleTransferTimeout(transferSession) {
    if (transferSession.retryCount < transferSession.maxRetries) {
      transferSession.retryCount++;
      setTimeout(() => {
        this.resumeTransfer(transferSession);
      }, 2000 * transferSession.retryCount); // Exponential backoff
    } else {
      transferSession.status = 'failed';
      transferSession.error = 'Transfer timeout - maximum retries exceeded';
    }
  }
}
```

### 2. Error Types

```javascript
const TransferErrors = {
  CONNECTION_LOST: 'connection_lost',
  CHUNK_CORRUPTION: 'chunk_corruption',
  FILE_TOO_LARGE: 'file_too_large',
  INVALID_FILE_TYPE: 'invalid_file_type',
  STORAGE_FULL: 'storage_full',
  TRANSFER_TIMEOUT: 'transfer_timeout',
  SECURITY_VIOLATION: 'security_violation',
  USER_CANCELLED: 'user_cancelled'
};
```

## Performance Optimizations

### 1. Adaptive Chunk Size

```javascript
class AdaptiveChunking {
  static calculateOptimalChunkSize(connectionQuality, fileSize) {
    let chunkSize = 64 * 1024; // Default 64KB
    
    if (connectionQuality === 'excellent') {
      chunkSize = Math.min(256 * 1024, fileSize / 100); // Up to 256KB
    } else if (connectionQuality === 'poor') {
      chunkSize = 16 * 1024; // Down to 16KB
    }
    
    return Math.max(16 * 1024, Math.min(chunkSize, 256 * 1024));
  }
}
```

### 2. Concurrent Transfers

```javascript
// Limit concurrent transfers to prevent overwhelming
const MAX_CONCURRENT_TRANSFERS = 3;
const MAX_CONCURRENT_CHUNKS = 5;
```

## Integration Points

### 1. WebRTCManager Extension

```javascript
// Add to existing WebRTCManager class
initFileTransfer() {
  this.fileTransferManager = new FileTransferManager(this, this.socket);
  
  // Extend peer connection setup
  Object.values(this.peers).forEach((peer, socketId) => {
    this.setupDataChannels(peer, socketId);
  });
}
```

### 2. UI Integration

```javascript
// Add to WindowManager class
initFileTransferUI() {
  // Add drag & drop to all video elements
  document.querySelectorAll('.video-wrapper').forEach(wrapper => {
    const socketId = wrapper.id.replace('video-', '');
    if (socketId !== 'localVideoWrapper') {
      new DragDropHandler(wrapper, socketId, this.app.rtc.fileTransferManager);
    }
  });
  
  // Add file transfer button to context menu
  this.addFileTransferContextMenu();
}
```

## Testing Strategy

### 1. Unit Tests
- File chunking and reassembly
- Checksum validation
- Security validation
- Progress calculation

### 2. Integration Tests
- Data channel establishment
- End-to-end file transfer
- Error recovery scenarios
- UI interactions

### 3. Performance Tests
- Large file transfers (up to 2GB)
- Multiple concurrent transfers
- Network interruption recovery
- Memory usage optimization

## Deployment Considerations

### 1. Browser Compatibility
- Chrome 76+ (full support)
- Firefox 72+ (full support)
- Safari 14+ (limited support)
- Edge 79+ (full support)

### 2. Network Requirements
- WebRTC Data Channels support
- STUN/TURN servers for NAT traversal
- Minimum 1 Mbps for reasonable transfer speeds

### 3. Storage Considerations
- Files saved to browser's Downloads folder
- Temporary storage during transfer
- Cleanup of incomplete transfers

## Future Enhancements

1. **Resume Interrupted Transfers** - Save transfer state to localStorage
2. **File Encryption** - End-to-end encryption for sensitive files
3. **Folder Transfers** - Support for transferring entire folders
4. **Transfer History** - Keep history of completed transfers
5. **Bandwidth Throttling** - Limit transfer speed to preserve video quality
6. **File Preview** - Preview images/documents before accepting
7. **Batch Transfers** - Send multiple files in one operation

## Conclusion

This design provides a robust, secure, and user-friendly P2P file sharing system that integrates seamlessly with the existing NearSap video chat application. The implementation prioritizes security, performance, and user experience while maintaining the application's gaming-focused aesthetic and functionality.