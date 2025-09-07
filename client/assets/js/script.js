// Main application script for Dela P2P File Sharing
class DelaApp {
    constructor() {
        this.webrtc = new WebSocketService();
        this.selectedFile = null;
        this.currentTheme = 'light';
        this.themes = ['light', 'dark', 'amoled'];
        this.isWaitingForAnswer = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupWebRTCCallbacks();
        this.loadTheme();
    }

    initializeElements() {
        // Theme elements
        this.themeToggle = document.getElementById('themeToggle');
        this.themeIcon = this.themeToggle.querySelector('.theme-icon');
        this.themeLabel = this.themeToggle.querySelector('.theme-label');

        // Connection elements
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.connectionButtons = document.getElementById('connectionButtons');
        this.createConnectionBtn = document.getElementById('createConnectionBtn');
        this.joinConnectionBtn = document.getElementById('joinConnectionBtn');

        // File elements
        this.fileDropZone = document.getElementById('fileDropZone');
        this.fileInput = document.getElementById('fileInput');
        this.selectFileBtn = document.getElementById('selectFileBtn');
        this.dropZoneTitle = document.getElementById('dropZoneTitle');
        
        this.selectedFileEl = document.getElementById('selectedFile');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.sendFileBtn = document.getElementById('sendFileBtn');
        this.removeFileBtn = document.getElementById('removeFileBtn');

        // File transfer elements
        this.fileTransfer = document.getElementById('fileTransfer');
        this.transferTitle = document.getElementById('transferTitle');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');

        // Chat elements
        this.chatIndicator = document.getElementById('chatIndicator');
        this.chatStatusText = document.getElementById('chatStatusText');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.noMessages = document.getElementById('noMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');

        // Modal elements
        this.modalOverlay = document.getElementById('modalOverlay');
        this.modalTitle = document.getElementById('modalTitle');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.createConnectionView = document.getElementById('createConnectionView');
        this.joinConnectionView = document.getElementById('joinConnectionView');
        this.qrCode = document.getElementById('qrCode');
        this.connectionCode = document.getElementById('connectionCode');
        this.copyCodeBtn = document.getElementById('copyCodeBtn');
        this.joinCodeInput = document.getElementById('joinCodeInput');
        this.connectBtn = document.getElementById('connectBtn');

        // Error elements
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
    }

    setupEventListeners() {
        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.cycleTheme());

        // Connection buttons
        this.createConnectionBtn.addEventListener('click', () => this.createConnection());
        this.joinConnectionBtn.addEventListener('click', () => this.showJoinModal());

        // File handling
        this.fileDropZone.addEventListener('click', () => this.fileInput.click());
        this.fileDropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.fileDropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.fileDropZone.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.selectFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.fileInput.click();
        });
        this.sendFileBtn.addEventListener('click', () => this.sendFile());
        this.removeFileBtn.addEventListener('click', () => this.clearSelectedFile());

        // Chat
        this.messageInput.addEventListener('keypress', (e) => this.handleMessageKeyPress(e));
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Modal
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) this.closeModal();
        });
        this.copyCodeBtn.addEventListener('click', () => this.copyConnectionCode());
        this.connectBtn.addEventListener('click', () => this.handleConnectAction());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });
    }

    setupWebRTCCallbacks() {
        this.webrtc.onConnectionStateChange = (state) => {
            this.updateConnectionStatus(state);
        };

        this.webrtc.onMessage = (message) => {
            this.addMessage(message);
        };

        this.webrtc.onFileTransferProgress = (progress) => {
            this.updateFileTransferProgress(progress);
        };

        this.webrtc.onError = (error) => {
            this.showError(error);
        };
    }

    // Theme management
    loadTheme() {
        const saved = localStorage.getItem('dela-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.currentTheme = saved || (prefersDark ? 'dark' : 'light');
        this.applyTheme();

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('dela-theme')) {
                this.currentTheme = e.matches ? 'dark' : 'light';
                this.applyTheme();
            }
        });
    }

    cycleTheme() {
        const currentIndex = this.themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % this.themes.length;
        this.currentTheme = this.themes[nextIndex];
        this.applyTheme();
        localStorage.setItem('dela-theme', this.currentTheme);
    }

    applyTheme() {
        document.body.className = `${this.currentTheme}-theme`;
        
        const icons = { light: '☀️', dark: '🌙', amoled: '⚫' };
        const labels = { light: 'Light', dark: 'Dark', amoled: 'AMOLED' };
        
        this.themeIcon.textContent = icons[this.currentTheme];
        this.themeLabel.textContent = labels[this.currentTheme];
    }

    // Connection management
    async createConnection() {
        try {
            const connectionData = await this.webrtc.createConnection();
            this.showCreateModal(connectionData);
            this.isWaitingForAnswer = true;
        } catch (error) {
            this.showError('Failed to create connection: ' + error.message);
        }
    }

    async showCreateModal(connectionData) {
        this.modalTitle.textContent = 'Share Connection Code';
        this.createConnectionView.classList.remove('hidden');
        this.joinConnectionView.classList.add('hidden');
        
        const codeString = JSON.stringify(connectionData);
        this.connectionCode.value = codeString;
        
        this.qrCode.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">Generating QR Code...</p>';
        
        try {
            await this.generateQRCode(codeString);
        } catch (error) {
            console.error('QR code generation failed:', error);
            this.qrCode.innerHTML = `<p style="padding: 20px; text-align: center; color: #666;">QR Code failed to load.<br>Please copy the text code instead.</p>`;
        }
        
        const waitingText = this.createConnectionView.querySelector('.waiting-text');
        waitingText.textContent = 'Share this code with someone to connect instantly. No answer code needed!';
        
        this.modalOverlay.classList.remove('hidden');
    }

    showJoinModal() {
        this.modalTitle.textContent = 'Join Connection';
        this.joinConnectionView.classList.remove('hidden');
        this.createConnectionView.classList.add('hidden');
        this.joinCodeInput.value = '';
        this.joinCodeInput.placeholder = 'Paste the connection code you received here...';
        this.connectBtn.textContent = 'Connect';
        this.modalOverlay.classList.remove('hidden');
    }

    handleConnectAction() {
        if (this.isWaitingForAnswer) {
            this.completeConnection();
        } else {
            this.joinConnection();
        }
    }

    async joinConnection() {
        try {
            const codeString = this.joinCodeInput.value.trim();
            if (!codeString) {
                throw new Error('Please paste a connection code');
            }

            const offerData = JSON.parse(codeString);
            const connectionData = await this.webrtc.joinConnection(offerData);
            
            // Connection initiated - success message will come from data channel opening
            console.log('WebRTC signaling initiated, waiting for data channel...');
            this.resetModalState();
            this.modalOverlay.classList.add('hidden');
            
        } catch (error) {
            this.showError('Failed to join connection: ' + error.message);
        }
    }

    async completeConnection() {
        try {
            const connectionString = this.joinCodeInput.value.trim();
            if (!connectionString) {
                throw new Error('Please paste the connection code you received');
            }

            const connectionData = JSON.parse(connectionString);
            await this.webrtc.completeConnection(connectionData);
            
            this.isWaitingForAnswer = false;
            this.resetModalState();
            this.modalOverlay.classList.add('hidden');
            
        } catch (error) {
            this.showError('Failed to complete connection: ' + error.message);
        }
    }

    copyConnectionCode() {
        const textToCopy = this.isWaitingForAnswer && this.joinCodeInput.value 
            ? this.joinCodeInput.value 
            : this.connectionCode.value;
            
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = this.copyCodeBtn.textContent;
            this.copyCodeBtn.textContent = 'Copied!';
            setTimeout(() => {
                this.copyCodeBtn.textContent = originalText;
            }, 2000);
            
            if (this.connectBtn.textContent === 'Copy Answer Code') {
                setTimeout(() => {
                    this.showError('Answer code copied! Share it with the connection creator to establish the connection.', 'info');
                    this.closeModal();
                }, 1000);
            }
        }).catch(err => {
            this.showError('Failed to copy to clipboard');
        });
    }

    closeModal() {
        this.modalOverlay.classList.add('hidden');
        
        this.createConnectionView.classList.add('hidden');
        this.joinConnectionView.classList.add('hidden');
        
        // Always reset modal state when closing - no more loops
        this.resetModalState();
    }
    
    showAnswerInputModal() {
        this.modalTitle.textContent = 'Complete Connection';
        this.joinConnectionView.classList.remove('hidden');
        this.createConnectionView.classList.add('hidden');
        this.joinCodeInput.value = '';
        this.joinCodeInput.placeholder = 'Paste the answer code you received here...';
        this.connectBtn.textContent = 'Complete Connection';
        
        const instructions = this.joinConnectionView.querySelector('p');
        instructions.textContent = 'Paste the answer code you received to complete the connection:';
        
        this.modalOverlay.classList.remove('hidden');
    }
    
    resetModalState() {
        this.isWaitingForAnswer = false;
        this.connectBtn.textContent = 'Connect';
        this.joinCodeInput.placeholder = 'Paste connection code here...';
        this.joinCodeInput.value = '';
        this.connectionCode.value = '';
        this.qrCode.innerHTML = '';
    }

    updateConnectionStatus(state) {
        this.statusIndicator.className = `status-indicator ${state}`;
        this.chatIndicator.className = `chat-indicator ${state}`;
        
        const statusTexts = {
            'disconnected': 'Not Connected',
            'connecting': 'Connecting...',
            'connected': 'Connected'
        };
        
        const chatStatusTexts = {
            'disconnected': 'Disconnected',
            'connecting': 'Connecting...',
            'connected': 'Connected'
        };

        this.statusText.textContent = statusTexts[state] || state;
        this.chatStatusText.textContent = chatStatusTexts[state] || state;
        
        const isConnected = state === 'connected';
        this.connectionButtons.style.display = isConnected ? 'none' : 'flex';
        this.sendFileBtn.disabled = !isConnected || !this.selectedFile;
        this.messageInput.disabled = !isConnected;
        this.sendBtn.disabled = !isConnected;
        this.messageInput.placeholder = isConnected ? 
            'Type a message...' : 'Connect to start chatting';
            
        if (isConnected) {
            this.closeModal();
            this.isWaitingForAnswer = false;
        }
    }

    // File handling
    handleDragOver(e) {
        e.preventDefault();
        this.fileDropZone.classList.add('drag-over');
        this.dropZoneTitle.textContent = 'Drop your file here';
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.fileDropZone.classList.remove('drag-over');
        this.dropZoneTitle.textContent = 'Share a file';
    }

    handleDrop(e) {
        e.preventDefault();
        this.fileDropZone.classList.remove('drag-over');
        this.dropZoneTitle.textContent = 'Share a file';
        
        const files = Array.from(e.dataTransfer.files);
        this.handleFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.handleFiles(files);
    }

    handleFiles(files) {
        if (files.length === 0) return;

        const file = files[0];
        const MAX_SIZE = 1024 * 1024 * 1024; // 1GB

        if (file.size > MAX_SIZE) {
            this.showError(`File size exceeds 1GB limit. Selected file is ${this.formatFileSize(file.size)}.`);
            return;
        }

        this.selectedFile = file;
        this.showSelectedFile();
        this.hideError();
    }

    showSelectedFile() {
        this.fileDropZone.classList.add('hidden');
        this.selectedFileEl.classList.remove('hidden');
        
        this.fileName.textContent = this.selectedFile.name;
        this.fileSize.textContent = this.formatFileSize(this.selectedFile.size);
        
        this.sendFileBtn.disabled = !this.webrtc.isConnected();
    }

    clearSelectedFile() {
        this.selectedFile = null;
        this.selectedFileEl.classList.add('hidden');
        this.fileDropZone.classList.remove('hidden');
        this.fileInput.value = '';
        this.hideFileTransfer();
    }

    async sendFile() {
        if (!this.selectedFile || !this.webrtc.isConnected()) return;

        try {
            await this.webrtc.sendFile(this.selectedFile);
        } catch (error) {
            this.showError('Failed to send file: ' + error.message);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // File transfer progress
    updateFileTransferProgress(progress) {
        const titles = {
            'sending': `Sending ${progress.fileName}...`,
            'receiving': `Receiving ${progress.fileName}...`,
            'sent': `✓ Sent ${progress.fileName}`,
            'received': `✓ Downloaded ${progress.fileName}`
        };

        this.transferTitle.textContent = titles[progress.type] || 'Transferring...';
        this.progressFill.style.width = `${progress.progress}%`;
        this.progressText.textContent = `${progress.progress}%`;

        if (progress.progress === 0 || progress.type === 'sending' || progress.type === 'receiving') {
            this.showFileTransfer();
        }

        if (progress.progress === 100) {
            setTimeout(() => {
                this.hideFileTransfer();
            }, 3000);
        }
    }

    showFileTransfer() {
        this.fileTransfer.classList.remove('hidden');
    }

    hideFileTransfer() {
        this.fileTransfer.classList.add('hidden');
    }

    // Chat handling
    handleMessageKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.webrtc.isConnected()) return;

        try {
            this.webrtc.sendMessage(content);
            this.messageInput.value = '';
        } catch (error) {
            this.showError('Failed to send message: ' + error.message);
        }
    }

    addMessage(message) {
        // Handle system messages differently - show as success notification
        if (message.type === 'system' && message.isSuccess) {
            this.showError(message.content, 'success');
            return;
        }

        if (this.noMessages && !this.noMessages.classList.contains('hidden')) {
            this.noMessages.classList.add('hidden');
        }

        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.sender}`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.textContent = message.content;

        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = this.formatTime(message.timestamp);

        messageContent.appendChild(messageBubble);
        messageContent.appendChild(messageTime);
        messageEl.appendChild(messageContent);

        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    // Error handling
    showError(message, type = 'error') {
        console.log(`${type.toUpperCase()}: ${message}`);
        this.errorText.textContent = message;
        
        this.errorMessage.className = `error-message ${type === 'success' ? 'success-message' : type === 'info' ? 'info-message' : ''}`;
        this.errorMessage.classList.remove('hidden');
        
        const hideDelay = type === 'error' ? 8000 : 4000;
        setTimeout(() => {
            this.hideError();
        }, hideDelay);
    }

    hideError() {
        this.errorMessage.classList.add('hidden');
        this.errorMessage.className = 'error-message'; // Reset to default
    }

    // Debug helper to test data channel readiness
    testDataChannel() {
        if (!this.webrtc.dataChannel) {
            this.showError('No data channel established', 'error');
            return false;
        }
        
        const state = this.webrtc.dataChannel.readyState;
        console.log('Data channel state:', state);
        
        if (state !== 'open') {
            this.showError(`Data channel not ready (state: ${state})`, 'error');
            return false;
        }
        
        this.showError('Data channel is ready!', 'success');
        return true;
    }

    async generateQRCode(text) {
        try {
            // Try Python backend first
            // Use environment variable for QR API URL, default to a placeholder Render URL
            const QR_API_URL = process.env.QR_API_URL || 'https://dela-qr-service.onrender.com';
            const response = await fetch(`${QR_API_URL}/generate_qr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.qrCode.innerHTML = `<img src="${data.image}" alt="QR Code" style="max-width: 200px; max-height: 200px;">`;
                    return;
                }
            }
        } catch (error) {
            console.warn('Python QR server not available, trying client-side generation:', error);
        }

        // Fallback to client-side generation
        try {
            await this.ensureQRCodeLibrary();
            await QRCode.toCanvas(this.qrCode, text, {
                width: 200,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
        } catch (error) {
            throw new Error('Both server and client QR generation failed');
        }
    }

    ensureQRCodeLibrary() {
        return new Promise((resolve, reject) => {
            if (typeof QRCode !== 'undefined') {
                return resolve();
            }

            let attempts = 0;
            const interval = setInterval(() => {
                if (typeof QRCode !== 'undefined') {
                    clearInterval(interval);
                    resolve();
                } else if (attempts > 20) {
                    clearInterval(interval);
                    reject(new Error('QRCode library failed to load after multiple attempts.'));
                }
                attempts++;
            }, 100);
        });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new DelaApp();
    
    // Expose debugging functions to console for testing
    window.DelaDebug = {
        app: app,
        testDataChannel: () => app.testDataChannel(),
        getConnectionState: () => app.webrtc.getConnectionState(),
        getMessages: () => app.webrtc.getMessages(),
        sendTestMessage: (msg = 'Test message') => {
            try {
                return app.webrtc.sendMessage(msg);
            } catch (error) {
                console.error('Test message failed:', error);
                return false;
            }
        },
        simulateFileSelection: () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.click();
            return 'File selection dialog opened';
        },
        checkWebRTCSupport: () => {
            const support = {
                RTCPeerConnection: !!window.RTCPeerConnection,
                getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
                DataChannel: !!window.RTCDataChannel,
                WebRTC: !!window.RTCPeerConnection && !!window.RTCDataChannel
            };
            console.table(support);
            return support;
        },
        forceReconnect: () => {
            app.webrtc.disconnect();
            setTimeout(() => {
                console.log('Ready to create new connection');
            }, 1000);
            return 'Connection reset';
        }
    };
    
    // Log available debug commands
    console.log('🔧 Dela Debug Commands Available:');
    console.log('DelaDebug.testDataChannel() - Test data channel readiness');
    console.log('DelaDebug.getConnectionState() - Get current connection state');
    console.log('DelaDebug.sendTestMessage() - Send a test chat message');
    console.log('DelaDebug.checkWebRTCSupport() - Check browser WebRTC support');
    console.log('DelaDebug.forceReconnect() - Force disconnect and reset');
    console.log('DelaDebug.simulateFileSelection() - Open file selection dialog');
});