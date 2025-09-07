// WebSocket Service for Dela P2P File Sharing (WebRTC Alternative)
class WebSocketService {
    constructor() {
        this.ws = null;
        this.roomId = null;
        this.role = null; // 'host' or 'guest'
        this.connectionState = 'disconnected';
        this.messages = [];
        this.receivedFile = null;
        
        // Event listeners (same interface as WebRTC service)
        this.onConnectionStateChange = null;
        this.onMessage = null;
        this.onFileTransferProgress = null;
        this.onError = null;
        
        // File transfer state
        this.sendingFile = null;
        this.receivingFile = null;
        this.fileChunks = [];
        this.chunkSize = 64 * 1024; // 64KB chunks
    }

    // Create connection (host creates room)
    async createConnection() {
        try {
            await this.connectToServer();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Room creation timeout'));
                }, 5000);
                
                const messageHandler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'room-created') {
                        clearTimeout(timeout);
                        this.ws.removeEventListener('message', messageHandler);
                        this.roomId = data.roomId;
                        this.role = 'host';
                        
                        resolve({
                            type: 'room',
                            roomId: data.roomId,
                            connectionCode: data.connectionCode
                        });
                    }
                };
                
                this.ws.addEventListener('message', messageHandler);
                this.ws.send(JSON.stringify({ type: 'create-room' }));
            });
        } catch (error) {
            this.handleError('Failed to create connection: ' + error.message);
            throw error;
        }
    }

    // Join connection (guest joins room)
    async joinConnection(connectionData) {
        try {
            await this.connectToServer();
            const roomId = connectionData.connectionCode || connectionData.roomId;
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Room join timeout'));
                }, 5000);
                
                const messageHandler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'room-joined') {
                        clearTimeout(timeout);
                        this.ws.removeEventListener('message', messageHandler);
                        this.roomId = roomId;
                        this.role = 'guest';
                        this.updateConnectionState('connected');
                        
                        resolve({
                            type: 'joined',
                            roomId: roomId
                        });
                    } else if (data.type === 'error') {
                        clearTimeout(timeout);
                        this.ws.removeEventListener('message', messageHandler);
                        reject(new Error(data.message));
                    }
                };
                
                this.ws.addEventListener('message', messageHandler);
                this.ws.send(JSON.stringify({ 
                    type: 'join-room', 
                    roomId: roomId 
                }));
            });
        } catch (error) {
            this.handleError('Failed to join connection: ' + error.message);
            throw error;
        }
    }

    // Connect to WebSocket server
    async connectToServer() {
        // Use environment variable for WebSocket server URL
        const serverUrl = process.env.WEBSOCKET_URL || 'wss://dela-relay-server.onrender.com'; // Default to a placeholder Render URL
        
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(serverUrl);
            
            const timeout = setTimeout(() => {
                reject(new Error('Server connection timeout'));
            }, 5000);
            
            this.ws.onopen = () => {
                clearTimeout(timeout);
                console.log('🔗 Connected to relay server');
                this.updateConnectionState('connecting');
                this.setupEventHandlers();
                resolve();
            };
            
            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                reject(new Error('Failed to connect to server'));
            };
        });
    }

    setupEventHandlers() {
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('🔌 Disconnected from server');
            this.updateConnectionState('disconnected');
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleError('Connection error occurred');
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'peer-joined':
                this.updateConnectionState('connected');
                if (this.onMessage) {
                    this.onMessage({
                        type: 'system',
                        content: 'Connection established! You can now share files and chat.',
                        timestamp: Date.now(),
                        sender: 'system',
                        isSuccess: true
                    });
                }
                break;
                
            case 'peer-disconnected':
                this.updateConnectionState('disconnected');
                if (this.onMessage) {
                    this.onMessage({
                        type: 'system',
                        content: 'Peer disconnected',
                        timestamp: Date.now(),
                        sender: 'system'
                    });
                }
                break;
                
            case 'chat-message':
                this.handleChatMessage(data);
                break;
                
            case 'file-info':
                this.handleFileInfo(data);
                break;
                
            case 'file-chunk':
                this.handleFileChunk(data);
                break;
                
            case 'file-complete':
                this.handleFileComplete();
                break;
                
            default:
                console.log('Unknown message type:', data.type);
        }
    }

    handleChatMessage(data) {
        const message = {
            content: data.content,
            timestamp: data.timestamp,
            sender: 'peer'
        };
        
        this.addMessage(message);
    }

    // Send chat message
    sendMessage(content) {
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }
        
        const message = {
            content: content,
            timestamp: Date.now(),
            sender: 'self'
        };
        
        // Add to local messages
        this.addMessage(message);
        
        // Send to peer
        this.ws.send(JSON.stringify({
            type: 'chat-message',
            content: content,
            timestamp: message.timestamp
        }));
    }

    // Send file
    async sendFile(file) {
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }
        
        this.sendingFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            chunks: Math.ceil(file.size / this.chunkSize),
            sentChunks: 0
        };
        
        // Send file info first
        this.ws.send(JSON.stringify({
            type: 'file-info',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: this.sendingFile.chunks
        }));
        
        // Update progress
        this.updateFileTransferProgress({
            type: 'sending',
            fileName: file.name,
            progress: 0
        });
        
            // Send file in chunks sequentially to maintain order
        for (let i = 0; i < this.sendingFile.chunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, file.size);
            const chunk = file.slice(start, end);
            
            // Use ArrayBuffer for more reliable encoding
            const arrayBuffer = await chunk.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const base64String = btoa(String.fromCharCode.apply(null, uint8Array));
            
            this.ws.send(JSON.stringify({
                type: 'file-chunk',
                chunkIndex: i,
                data: base64String
            }));
            
            this.sendingFile.sentChunks++;
            const progress = Math.round((this.sendingFile.sentChunks / this.sendingFile.chunks) * 100);
            
            this.updateFileTransferProgress({
                type: 'sending',
                fileName: file.name,
                progress: progress
            });
            
            // Small delay to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        
        // Send completion message after all chunks
        this.ws.send(JSON.stringify({ type: 'file-complete' }));
        this.updateFileTransferProgress({
            type: 'sent',
            fileName: file.name,
            progress: 100
        });
    }

    handleFileInfo(data) {
        this.receivingFile = {
            name: data.fileName,
            size: data.fileSize,
            type: data.fileType,
            totalChunks: data.totalChunks
        };
        
        this.fileChunks = new Array(data.totalChunks);
        
        this.updateFileTransferProgress({
            type: 'receiving',
            fileName: data.fileName,
            progress: 0
        });
    }

    handleFileChunk(data) {
        if (!this.receivingFile) return;
        
        this.fileChunks[data.chunkIndex] = data.data;
        
        const receivedChunks = this.fileChunks.filter(chunk => chunk !== undefined).length;
        const progress = Math.round((receivedChunks / this.receivingFile.totalChunks) * 100);
        
        this.updateFileTransferProgress({
            type: 'receiving',
            fileName: this.receivingFile.name,
            progress: progress
        });
    }

    handleFileComplete() {
        if (!this.receivingFile) return;
        
        try {
            console.log(`Reconstructing file: ${this.receivingFile.name}, chunks: ${this.fileChunks.length}`);
            
            // Check for missing chunks
            const missingChunks = [];
            for (let i = 0; i < this.receivingFile.totalChunks; i++) {
                if (!this.fileChunks[i]) {
                    missingChunks.push(i);
                }
            }
            
            if (missingChunks.length > 0) {
                throw new Error(`Missing chunks: ${missingChunks.join(', ')}`);
            }
            
            // Combine all chunks into a single Uint8Array
            const totalSize = this.fileChunks.reduce((total, chunk) => {
                const decoded = atob(chunk);
                return total + decoded.length;
            }, 0);
            
            const combinedArray = new Uint8Array(totalSize);
            let offset = 0;
            
            for (let i = 0; i < this.fileChunks.length; i++) {
                const chunk = this.fileChunks[i];
                if (!chunk) continue;
                
                // Decode each chunk individually
                const binaryString = atob(chunk);
                const chunkArray = new Uint8Array(binaryString.length);
                
                for (let j = 0; j < binaryString.length; j++) {
                    chunkArray[j] = binaryString.charCodeAt(j);
                }
                
                combinedArray.set(chunkArray, offset);
                offset += chunkArray.length;
            }
            
            const blob = new Blob([combinedArray], { type: this.receivingFile.type });
            
            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.receivingFile.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log(`File download triggered: ${this.receivingFile.name} (${blob.size} bytes)`);
            
            this.updateFileTransferProgress({
                type: 'received',
                fileName: this.receivingFile.name,
                progress: 100
            });
            
        } catch (error) {
            console.error('Error reconstructing file:', error);
            this.handleError(`Failed to download file: ${error.message}`);
        } finally {
            // Clean up
            this.receivingFile = null;
            this.fileChunks = [];
        }
    }

    addMessage(message) {
        this.messages.push(message);
        if (this.onMessage) {
            this.onMessage(message);
        }
    }

    updateFileTransferProgress(progress) {
        if (this.onFileTransferProgress) {
            this.onFileTransferProgress(progress);
        }
    }

    updateConnectionState(state) {
        this.connectionState = state;
        console.log('Connection state changed:', state);
        if (this.onConnectionStateChange) {
            this.onConnectionStateChange(state);
        }
    }

    handleError(message) {
        if (this.onError) {
            this.onError(message);
        }
    }

    isConnected() {
        return this.connectionState === 'connected' && 
               this.ws && 
               this.ws.readyState === WebSocket.OPEN;
    }

    getConnectionState() {
        return this.connectionState;
    }

    getMessages() {
        return this.messages;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.roomId = null;
        this.role = null;
        this.updateConnectionState('disconnected');
    }

    // Legacy method for compatibility
    async completeConnection(connectionData) {
        // Not needed in WebSocket version - connection is automatic
        return Promise.resolve();
    }
}