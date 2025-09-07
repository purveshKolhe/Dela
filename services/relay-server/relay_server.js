// Simple WebSocket Relay Server for Dela P2P File Sharing
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Serve the static files from the client folder
app.use(express.static(path.join(__dirname, '../../client')));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/index.html'));
});

// WebSocket server
const wss = new WebSocket.Server({ 
    server,
    maxPayload: 100 * 1024 * 1024 // 100MB max payload
});

// Store active connections
const connections = new Map(); // roomId -> { host, guest }
const rooms = new Map(); // roomId -> room data

console.log('🚀 Dela Relay Server Starting...');

wss.on('connection', (ws, req) => {
    console.log('📱 New client connected from', req.socket.remoteAddress);
    
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('❌ Invalid message format:', error);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid message format' 
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('📱 Client disconnected');
        handleDisconnect(ws);
    });
    
    ws.on('error', (error) => {
        console.error('🔥 WebSocket error:', error);
    });
});

function handleMessage(ws, data) {
    const { type, roomId } = data;
    
    switch (type) {
        case 'create-room':
            createRoom(ws, data);
            break;
            
        case 'join-room':
            joinRoom(ws, data);
            break;
            
        case 'chat-message':
            relayMessage(ws, data, 'chat-message');
            break;
            
        case 'file-info':
            relayMessage(ws, data, 'file-info');
            break;
            
        case 'file-chunk':
            relayMessage(ws, data, 'file-chunk');
            break;
            
        case 'file-complete':
            relayMessage(ws, data, 'file-complete');
            break;
            
        default:
            console.log('🤔 Unknown message type:', type);
    }
}

function createRoom(ws, data) {
    const roomId = generateRoomId();
    
    rooms.set(roomId, {
        host: ws,
        guest: null,
        created: Date.now()
    });
    
    ws.roomId = roomId;
    ws.role = 'host';
    
    console.log(`🏠 Room ${roomId} created`);
    
    ws.send(JSON.stringify({
        type: 'room-created',
        roomId: roomId,
        connectionCode: roomId // Simple connection code is just the room ID
    }));
}

function joinRoom(ws, data) {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room not found'
        }));
        return;
    }
    
    if (room.guest) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room is full'
        }));
        return;
    }
    
    room.guest = ws;
    ws.roomId = roomId;
    ws.role = 'guest';
    
    console.log(`🚪 Client joined room ${roomId}`);
    
    // Notify both clients
    room.host.send(JSON.stringify({
        type: 'peer-joined',
        message: 'Someone joined your room!'
    }));
    
    ws.send(JSON.stringify({
        type: 'room-joined',
        message: 'Connected successfully!'
    }));
}

function relayMessage(ws, data, messageType) {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    
    const peer = ws.role === 'host' ? room.guest : room.host;
    if (!peer) return;
    
    // Relay the message to the peer
    peer.send(JSON.stringify({
        ...data,
        type: messageType
    }));
}

function handleDisconnect(ws) {
    if (!ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room) return;
    
    // Notify the other peer
    const peer = ws.role === 'host' ? room.guest : room.host;
    if (peer) {
        peer.send(JSON.stringify({
            type: 'peer-disconnected',
            message: 'Peer disconnected'
        }));
    }
    
    // Clean up the room
    rooms.delete(ws.roomId);
    console.log(`🧹 Room ${ws.roomId} cleaned up`);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Heartbeat to keep connections alive
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log('💀 Terminating dead connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// Clean up old rooms
const cleanup = setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    for (const [roomId, room] of rooms.entries()) {
        if (now - room.created > maxAge) {
            console.log(`🧹 Cleaning up old room ${roomId}`);
            rooms.delete(roomId);
        }
    }
}, 10 * 60 * 1000); // Every 10 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 Dela Relay Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('⏹️  Shutting down gracefully...');
    clearInterval(heartbeat);
    clearInterval(cleanup);
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});