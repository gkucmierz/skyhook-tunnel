import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { startTunnel, rewriteLocation, splitIntoChunks } from '../src/client.js';

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
    const body = JSON.stringify({ status: 'ok' });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3000',
    });
    res.end(body);
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

test('rewriteLocation converts local redirects to relative paths', () => {
  const cases = [
    { input: 'http://127.0.0.1:3000/dashboard', host: '127.0.0.1', port: 3000, expected: '/dashboard' },
    { input: 'http://localhost:3000/auth/callback?code=xyz', host: '127.0.0.1', port: 3000, expected: '/auth/callback?code=xyz' },
    { input: 'http://[::1]:3000/settings', host: '127.0.0.1', port: 3000, expected: '/settings' },
    { input: 'http://localhost:3000?search=1', host: '127.0.0.1', port: 3000, expected: '/?search=1' },
    { input: 'http://localhost:3000', host: '127.0.0.1', port: 3000, expected: '/' },
    { input: 'http://192.168.1.55:8080/api', host: '192.168.1.55', port: 8080, expected: '/api' },
    { input: 'https://accounts.google.com/oauth', host: '127.0.0.1', port: 3000, expected: 'https://accounts.google.com/oauth' },
    { input: '/login', host: '127.0.0.1', port: 3000, expected: '/login' },
    // Security & Port Isolation: NEVER rewrite redirects to a different local port
    { input: 'http://localhost:8080/secret', host: '127.0.0.1', port: 3000, expected: 'http://localhost:8080/secret' },
    { input: 'http://127.0.0.1:6379/keys', host: '127.0.0.1', port: 3000, expected: 'http://127.0.0.1:6379/keys' },
    // Security: NEVER match attacker domains masquerading as localhost
    { input: 'http://localhost.attacker.com/steal', host: '127.0.0.1', port: 3000, expected: 'http://localhost.attacker.com/steal' },
    { input: 'http://localhost@attacker.com/steal', host: '127.0.0.1', port: 3000, expected: 'http://localhost@attacker.com/steal' },
  ];

  for (const tc of cases) {
    const actual = rewriteLocation(tc.input, tc.host, tc.port);
    assert.equal(actual, tc.expected, `rewriteLocation("${tc.input}")`);
  }
});

test('splitIntoChunks correctly partitions large payloads without data corruption', () => {
  // Case 1: Buffer smaller than chunk size
  const smallBuf = Buffer.from('hello world');
  const smallChunks = splitIntoChunks(smallBuf, 64);
  assert.equal(smallChunks.length, 1);
  assert.equal(smallChunks[0].toString(), 'hello world');

  // Case 2: Buffer exactly matching chunk size
  const exactBuf = Buffer.alloc(100, 'A');
  const exactChunks = splitIntoChunks(exactBuf, 100);
  assert.equal(exactChunks.length, 1);
  assert.equal(exactChunks[0].length, 100);

  // Case 3: Buffer larger than chunk size (150 KB split into 64 KB chunks)
  const largeBuf = Buffer.alloc(150 * 1024, 'X');
  const largeChunks = splitIntoChunks(largeBuf, 64 * 1024);
  assert.equal(largeChunks.length, 3);
  assert.equal(largeChunks[0].length, 64 * 1024);
  assert.equal(largeChunks[1].length, 64 * 1024);
  assert.equal(largeChunks[2].length, 22 * 1024);

  // Verify full data integrity on reassembly
  const reassembled = Buffer.concat(largeChunks);
  assert.deepEqual(reassembled, largeBuf);

  // Case 4: Empty buffer
  const emptyChunks = splitIntoChunks(Buffer.alloc(0), 1024);
  assert.equal(emptyChunks.length, 0);
});



