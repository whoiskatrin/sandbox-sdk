import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = 8080;

const server = createServer();
const wss = new WebSocketServer({ server });

console.log(`🔌 WebSocket server starting on port ${PORT}...`);

const connections = new Set();

wss.on('connection', (ws, request) => {
  console.log(`[WebSocket] New connection from ${request.socket.remoteAddress}`);
  connections.add(ws);
  
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established',
    timestamp: new Date().toISOString(),
    connectionId: Math.random().toString(36).substr(2, 9)
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Received message:`, message);
      
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
            originalMessage: message
          }));
          break;
          
        case 'preview_request':
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'preview_response',
              requestId: message.requestId,
              url: message.url,
              status: 'ready',
              previewUrl: `http://localhost:3000/preview/${message.requestId}`,
              timestamp: new Date().toISOString()
            }));
          }, 1000);
          break;
          
        case 'broadcast':
          const broadcastMessage = {
            type: 'broadcast_message',
            message: message.message,
            from: message.from || 'anonymous',
            timestamp: new Date().toISOString()
          };
          
          connections.forEach(client => {
            if (client !== ws && client.readyState === client.OPEN) {
              client.send(JSON.stringify(broadcastMessage));
            }
          });
          
          ws.send(JSON.stringify({
            type: 'broadcast_sent',
            message: 'Message broadcasted to all clients',
            timestamp: new Date().toISOString()
          }));
          break;
          
        case 'echo':
          ws.send(JSON.stringify({
            type: 'echo_response',
            originalMessage: message,
            timestamp: new Date().toISOString()
          }));
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
            timestamp: new Date().toISOString()
          }));
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON message',
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WebSocket] Connection closed: ${code} ${reason}`);
    connections.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Connection error:', error);
    connections.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📊 Server ready to accept WebSocket connections`);
  console.log(`🔧 Supported message types: ping, preview_request, broadcast, echo`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  connections.forEach(ws => ws.close(1000, 'Server shutting down'));
  server.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});
