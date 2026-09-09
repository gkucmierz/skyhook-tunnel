import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { startTunnel } from '../src/client.js';

test('WebSocket tunneling forwards messages and closes cleanly', async (t) => {
  // 1. Setup local target server with WebSocket support
  const localHttpServer = http.createServer();
  const localWss = new WebSocketServer({ server: localHttpServer });

  localWss.on('connection', (socket) => {
    socket.on('message', (msg) => {
      socket.send(`echo: ${msg.toString()}`);
    });
  });

  await new Promise((resolve) => localHttpServer.listen(0, '127.0.0.1', resolve));
  const localPort = localHttpServer.address().port;

  // 2. Setup mock gateway server
  const gatewayHttpServer = http.createServer();
  const gatewayWss = new WebSocketServer({ server: gatewayHttpServer });

  const receivedPackets = [];
  const clientWsPromise = new Promise((resolve) => {
    gatewayWss.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const pkt = JSON.parse(raw.toString());
        receivedPackets.push(pkt);
      });
      resolve(socket);
    });
  });

  await new Promise((resolve) => gatewayHttpServer.listen(0, '127.0.0.1', resolve));
  const gatewayPort = gatewayHttpServer.address().port;

  // 3. Connect tunnel client
  const tunnel = startTunnel({
    port: localPort,
    localHost: '127.0.0.1',
    subdomain: 'test-app',
    server: `127.0.0.1:${gatewayPort}`,
    secure: false,
    onError: (err) => console.error('tunnel client error:', err),
  });

  // Wait for tunnel connection
  const gatewayClientWs = await clientWsPromise;
  assert.ok(gatewayClientWs, 'Tunnel should connect to gateway');

  // Gateway sends REGISTER_ACK immediately (same as Go server)
  gatewayClientWs.send(JSON.stringify({
    type: 'REGISTER_ACK',
    ack: {
      success: true,
      subdomain: 'test-app',
      url: 'http://test-app.localhost:17356',
    },
  }));

  // Small tick to process ACK
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 4. Send WS_OPEN from Gateway to Tunnel
  gatewayClientWs.send(JSON.stringify({
    type: 'WS_OPEN',
    ws_open: {
      stream_id: 'ws-stream-42',
      url: '/ws',
      headers: {},
    },
  }));

  await new Promise((resolve) => setTimeout(resolve, 100));

  // 5. Send WS_MESSAGE from Gateway to Tunnel
  gatewayClientWs.send(JSON.stringify({
    type: 'WS_MESSAGE',
    ws_message: {
      stream_id: 'ws-stream-42',
      data: 'hello from browser',
      is_binary: false,
    },
  }));

  // Wait for echo response from local server through tunnel
  await new Promise((resolve) => setTimeout(resolve, 150));

  const echoPkt = receivedPackets.find(
    (p) => p.type === 'WS_MESSAGE' && p.ws_message?.stream_id === 'ws-stream-42'
  );
  assert.ok(echoPkt, 'Gateway should receive echoed WS_MESSAGE packet');
  assert.equal(echoPkt.ws_message.data, 'echo: hello from browser');

  // 6. Send WS_CLOSE from Gateway
  gatewayClientWs.send(JSON.stringify({
    type: 'WS_CLOSE',
    ws_close: {
      stream_id: 'ws-stream-42',
      code: 1000,
      reason: 'test done',
    },
  }));

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Clean up
  tunnel.close();
  localWss.close();
  gatewayWss.close();
  await new Promise((resolve) => localHttpServer.close(resolve));
  await new Promise((resolve) => gatewayHttpServer.close(resolve));
});

test('HTTP request propagates X-Forwarded headers and sets local Host', async (t) => {
  let receivedHeaders = null;
  const localHttpServer = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3000',
    });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  await new Promise((resolve) => localHttpServer.listen(0, '127.0.0.1', resolve));
  const localPort = localHttpServer.address().port;

  const gatewayHttpServer = http.createServer();
  const gatewayWss = new WebSocketServer({ server: gatewayHttpServer });

  const receivedPackets = [];
  const clientWsPromise = new Promise((resolve) => {
    gatewayWss.on('connection', (socket) => {
      socket.on('message', (raw) => {
        receivedPackets.push(JSON.parse(raw.toString()));
      });
      resolve(socket);
    });
  });

  await new Promise((resolve) => gatewayHttpServer.listen(0, '127.0.0.1', resolve));
  const gatewayPort = gatewayHttpServer.address().port;

  const tunnel = startTunnel({
    port: localPort,
    localHost: '127.0.0.1',
    subdomain: 'header-test',
    server: `127.0.0.1:${gatewayPort}`,
    secure: false,
    onError: (err) => console.error('tunnel client error:', err),
  });

  const gatewayClientWs = await clientWsPromise;
  gatewayClientWs.send(JSON.stringify({
    type: 'REGISTER_ACK',
    ack: { success: true, subdomain: 'header-test', url: 'http://header-test.localhost:17356' },
  }));

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Send REQUEST packet with X-Forwarded headers
  gatewayClientWs.send(JSON.stringify({
    type: 'REQUEST',
    request: {
      stream_id: 'req-header-1',
      method: 'GET',
      url: '/api/test',
      headers: {
        'User-Agent': ['TestProxy/1.0'],
        'X-Forwarded-For': ['198.51.100.1'],
        'X-Forwarded-Host': ['header-test.localhost:17356'],
        'X-Forwarded-Proto': ['http'],
        'X-Forwarded-Port': ['17356'],
        'X-Real-Ip': ['198.51.100.1'],
      },
    },
  }));

  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(receivedHeaders, 'Local server should have received request');
  assert.equal(receivedHeaders['x-forwarded-for'], '198.51.100.1');
  assert.equal(receivedHeaders['x-forwarded-host'], 'header-test.localhost:17356');
  assert.equal(receivedHeaders['x-forwarded-proto'], 'http');
  assert.equal(receivedHeaders['x-forwarded-port'], '17356');
  assert.equal(receivedHeaders['x-real-ip'], '198.51.100.1');
  assert.equal(receivedHeaders['host'], `127.0.0.1:${localPort}`);

  const resPkt = receivedPackets.find((p) => p.type === 'RESPONSE' && p.response?.stream_id === 'req-header-1');
  assert.ok(resPkt, 'Gateway should receive RESPONSE packet');
  assert.equal(resPkt.response.status_code, 200);

  tunnel.close();
  gatewayWss.close();
  await new Promise((resolve) => localHttpServer.close(resolve));
  await new Promise((resolve) => gatewayHttpServer.close(resolve));
});

