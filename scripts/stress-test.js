#!/usr/bin/env node

import http from 'node:http';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { startTunnel } from '../cli/src/client.js';

// Parse CLI flags
const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'auto' }, // auto | mock | live
    concurrency: { type: 'string', short: 'c', default: '50' },
    requests: { type: 'string', short: 'n', default: '1000' },
    tunnels: { type: 'string', short: 't', default: '' },
    hold: { type: 'string', default: '5' }, // seconds to hold idle tunnels (0 / forever for indefinite)
    forever: { type: 'boolean', default: false }, // hold tunnels open indefinitely until Ctrl+C
    duration: { type: 'string', short: 'd', default: '0' },
    scenario: { type: 'string', short: 's', default: 'all' }, // all | http | stream | ws | tunnels | idle
    server: { type: 'string', default: '127.0.0.1:17356' },
    subdomain: { type: 'string', default: 'stress-test' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
\x1b[36m\x1b[1m⚡ Skyhook Tunnel - Automated Stress & Concurrency Test Suite\x1b[0m

Usage:
  node scripts/stress-test.js [options]
  npm run test:stress -- [options]

Options:
  --mode <auto|mock|live>  Execution mode (default: auto)
  -c, --concurrency <N>    Number of concurrent client workers (default: 50)
  -n, --requests <N>       Total number of requests for HTTP tests (default: 1000)
  -t, --tunnels <N>        Number of tunnels for idle capacity scenario (default: 100)
  --hold <sec>             Seconds to hold idle tunnels (use 0 or "forever" for indefinite)
  --forever                Hold idle tunnels indefinitely until Ctrl+C or 'q'
  -d, --duration <sec>     Run for specified seconds instead of fixed count
  -s, --scenario <name>    Scenario: all | http | stream | ws | tunnels | idle (default: all)
  --server <host:port>     Live Go gateway address (default: 127.0.0.1:17356)
  --subdomain <name>       Subdomain to register (default: stress-test)
  -h, --help               Show this help message

Examples:
  npm run test:stress                                   # Run full test suite
  npm run test:stress:tunnels                          # Open 100 idle tunnels (5s hold)
  npm run test:stress:tunnels -- --forever             # Hold 100 idle tunnels indefinitely
  npm run test:stress -- -s tunnels -t 250 --forever   # Hold 250 idle tunnels indefinitely
  npm run test:stress -- -s tunnels -t 100 --hold 0    # Hold 100 idle tunnels indefinitely
  npm run test:stress -- -s http -c 100 -n 5000         # 5000 HTTP requests with 100 concurrency
`);
  process.exit(0);
}

const concurrency = Math.max(1, parseInt(values.concurrency, 10) || 50);
const totalRequests = Math.max(1, parseInt(values.requests, 10) || 1000);
const totalTunnels = Math.max(1, parseInt(values.tunnels || (values.scenario === 'tunnels' || values.scenario === 'idle' ? values.requests : '100'), 10) || 100);

const isForever = Boolean(
  values.forever ||
  values.hold === '0' ||
  values.hold === '-1' ||
  values.hold === 'forever' ||
  values.hold === 'infinite'
);
const holdSeconds = isForever ? 0 : Math.max(1, parseInt(values.hold, 10) || 5);
const selectedScenario = values.scenario.toLowerCase();

// Helper: Calculate statistical percentiles
function calculateStats(latencies, bytesTransferred, durationMs) {
  if (latencies.length === 0) {
    return { count: 0, min: '0.00', max: '0.00', avg: '0.00', p50: '0.00', p90: '0.00', p99: '0.00', rps: '0.0', mbps: '0.00' };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const rps = durationMs > 0 ? (sorted.length / (durationMs / 1000)) : 0;
  const mbps = durationMs > 0 ? ((bytesTransferred / (1024 * 1024)) / (durationMs / 1000)) : 0;

  return {
    count: sorted.length,
    min: min.toFixed(2),
    max: max.toFixed(2),
    avg: avg.toFixed(2),
    p50: p50.toFixed(2),
    p90: p90.toFixed(2),
    p99: p99.toFixed(2),
    rps: rps.toFixed(1),
    mbps: mbps.toFixed(2),
  };
}

// Helper: Format ANSI HTTP metrics table
function printMetricsTable(title, stats, failedCount, totalBytes) {
  const total = stats.count + failedCount;
  const errRate = total > 0 ? ((failedCount / total) * 100).toFixed(1) : '0.0';
  const dataMb = (totalBytes / (1024 * 1024)).toFixed(2);

  console.log(`\n\x1b[1m\x1b[36m┌─────────────────────────────────────────────────────────────┐\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m \x1b[1m${title.padEnd(59)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┬──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Metric                       \x1b[1m\x1b[36m│\x1b[0m Value                        \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┼──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Total Requests               \x1b[1m\x1b[36m│\x1b[0m ${total.toString().padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Successful                   \x1b[1m\x1b[36m│\x1b[0m \x1b[32m${stats.count.toString().padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Failed / Errors              \x1b[1m\x1b[36m│\x1b[0m \x1b[${failedCount > 0 ? '31' : '32'}m${(failedCount + ` (${errRate}%)`).padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Requests / sec (RPS)         \x1b[1m\x1b[36m│\x1b[0m \x1b[35m\x1b[1m${(stats.rps + ' req/s').padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Data Throughput              \x1b[1m\x1b[36m│\x1b[0m ${(stats.mbps + ' MB/s (' + dataMb + ' MB)').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┼──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Latency Min / Max            \x1b[1m\x1b[36m│\x1b[0m ${(stats.min + 'ms / ' + stats.max + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Latency Avg                  \x1b[1m\x1b[36m│\x1b[0m ${(stats.avg + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Latency P50 (Median)         \x1b[1m\x1b[36m│\x1b[0m ${(stats.p50 + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Latency P90                  \x1b[1m\x1b[36m│\x1b[0m ${(stats.p90 + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Latency P99                  \x1b[1m\x1b[36m│\x1b[0m \x1b[1m${(stats.p99 + 'ms').padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m└──────────────────────────────┴──────────────────────────────┘\x1b[0m\n`);
}

// Helper: Format ANSI Tunnel Capacity metrics table
function printTunnelMetricsTable(report) {
  const { title, totalRequested, connected, failed, droppedDuringHold, connectStats, holdLabel, teardownMs, peakHeap } = report;
  const successRate = totalRequested > 0 ? ((connected / totalRequested) * 100).toFixed(1) : '0.0';

  console.log(`\n\x1b[1m\x1b[36m┌─────────────────────────────────────────────────────────────┐\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m \x1b[1m${title.padEnd(59)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┬──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Metric                       \x1b[1m\x1b[36m│\x1b[0m Value                        \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┼──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Tunnels Requested            \x1b[1m\x1b[36m│\x1b[0m ${totalRequested.toString().padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Successfully Established     \x1b[1m\x1b[36m│\x1b[0m \x1b[32m${(connected + ` (${successRate}%)`).padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Failed to Connect            \x1b[1m\x1b[36m│\x1b[0m \x1b[${failed > 0 ? '31' : '32'}m${failed.toString().padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Dropped During Hold          \x1b[1m\x1b[36m│\x1b[0m \x1b[${droppedDuringHold > 0 ? '31' : '32'}m${droppedDuringHold.toString().padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Tunnel Connect Rate          \x1b[1m\x1b[36m│\x1b[0m \x1b[35m\x1b[1m${(connectStats.rps + ' tunnels/s').padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┼──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Connect Latency Min / Max    \x1b[1m\x1b[36m│\x1b[0m ${(connectStats.min + 'ms / ' + connectStats.max + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Connect Latency Avg          \x1b[1m\x1b[36m│\x1b[0m ${(connectStats.avg + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Connect Latency P50 (Median) \x1b[1m\x1b[36m│\x1b[0m ${(connectStats.p50 + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Connect Latency P99          \x1b[1m\x1b[36m│\x1b[0m \x1b[1m${(connectStats.p99 + 'ms').padEnd(28)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m├──────────────────────────────┼──────────────────────────────┤\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Hold Duration (Zero Traffic) \x1b[1m\x1b[36m│\x1b[0m ${holdLabel.padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Peak Memory Footprint        \x1b[1m\x1b[36m│\x1b[0m ${(peakHeap + ' MB').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m│\x1b[0m Teardown Time                \x1b[1m\x1b[36m│\x1b[0m ${(teardownMs + 'ms').padEnd(28)} \x1b[1m\x1b[36m│\x1b[0m`);
  console.log(`\x1b[1m\x1b[36m└──────────────────────────────┴──────────────────────────────┘\x1b[0m\n`);
}

// 1. Setup Local Mock Target Server (providing fast 200, json, streaming, and ws echo)
async function setupMockTarget() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/fast') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('OK');
      return;
    }

    if (url.pathname === '/json') {
      const payload = JSON.stringify({
        status: 'healthy',
        timestamp: Date.now(),
        service: 'skyhook-stress-target',
        data: 'A'.repeat(1024), // 1 KB payload
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
      return;
    }

    if (url.pathname === '/stream') {
      const sizeKb = parseInt(url.searchParams.get('kb') || '256', 10);
      const totalBytes = sizeKb * 1024;
      const chunkSize = 64 * 1024;
      const chunks = Math.ceil(totalBytes / chunkSize);

      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'transfer-encoding': 'chunked',
      });

      let sent = 0;
      const chunkBuf = Buffer.alloc(chunkSize, 'S');
      const timer = setInterval(() => {
        if (sent >= chunks) {
          clearInterval(timer);
          res.end();
          return;
        }
        res.write(chunkBuf);
        sent++;
      }, 5);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket) => {
    socket.on('message', (data, isBinary) => {
      socket.send(data, { binary: isBinary });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    server,
    wss,
    port,
    close: async () => {
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// 2. Setup Mock Gateway Server (when running standalone without live Go binary)
async function setupMockGateway() {
  const activeTunnels = new Map(); // subdomain -> WebSocket
  const pendingRequests = new Map();
  let streamCounter = 0;

  const server = http.createServer((req, res) => {
    // Look up tunnel by Host header (e.g. subdomain.localhost)
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0] || '';
    const tunnelWs = activeTunnels.get(subdomain) || activeTunnels.values().next().value;

    if (!tunnelWs || tunnelWs.readyState !== WebSocket.OPEN) {
      res.writeHead(502);
      res.end('Tunnel not connected');
      return;
    }

    const streamId = `req-${++streamCounter}-${Date.now()}`;
    const reqChunks = [];

    req.on('data', (c) => reqChunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(reqChunks).toString('utf8');

      pendingRequests.set(streamId, {
        res,
        onChunk: (chunk) => {
          res.write(Buffer.from(chunk, 'base64'));
        },
        onEnd: () => {
          res.end();
          pendingRequests.delete(streamId);
        },
        onResponse: (responsePkt) => {
          for (const [k, v] of Object.entries(responsePkt.headers || {})) {
            res.setHeader(k, v);
          }
          res.writeHead(responsePkt.status_code);
          const bodyData = responsePkt.is_base64
            ? Buffer.from(responsePkt.body || '', 'base64')
            : (responsePkt.body || '');
          res.end(bodyData);
          pendingRequests.delete(streamId);
        },
      });

      const packet = {
        type: 'REQUEST',
        request: {
          stream_id: streamId,
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
          is_base64: false,
        },
      };
      tunnelWs.send(JSON.stringify(packet));
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/tunnel_ws') {
      const sub = url.searchParams.get('subdomain') || `sub-${Date.now()}`;
      activeTunnels.set(sub, socket);

      socket.send(JSON.stringify({
        type: 'REGISTER_ACK',
        ack: {
          success: true,
          subdomain: sub,
          url: `http://${sub}.localhost:${server.address().port}`,
        },
      }));

      socket.on('close', () => {
        activeTunnels.delete(sub);
      });

      socket.on('message', (raw) => {
        let pkt;
        try {
          pkt = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (pkt.type === 'RESPONSE' && pkt.response) {
          const handler = pendingRequests.get(pkt.response.stream_id);
          if (handler) handler.onResponse(pkt.response);
        } else if (pkt.type === 'STREAM_START' && pkt.stream_start) {
          const handler = pendingRequests.get(pkt.stream_start.stream_id);
          if (handler) {
            for (const [k, v] of Object.entries(pkt.stream_start.headers || {})) {
              handler.res.setHeader(k, v);
            }
            handler.res.writeHead(pkt.stream_start.status_code);
          }
        } else if (pkt.type === 'STREAM_CHUNK' && pkt.stream_chunk) {
          const handler = pendingRequests.get(pkt.stream_chunk.stream_id);
          if (handler) handler.onChunk(pkt.stream_chunk.data);
        } else if (pkt.type === 'STREAM_END' && pkt.stream_end) {
          const handler = pendingRequests.get(pkt.stream_end.stream_id);
          if (handler) handler.onEnd();
        }
      });
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    server,
    wss,
    port,
    activeTunnels,
    close: async () => {
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// 3. Auto-detect if live Go server is running
async function checkLiveServer(hostPort) {
  return new Promise((resolve) => {
    const [host, port] = hostPort.split(':');
    const req = http.request({
      host: host || '127.0.0.1',
      port: Number(port) || 17356,
      method: 'GET',
      path: '/health',
      timeout: 500,
    }, () => resolve(true));

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// 4. Runner: HTTP Concurrency Burst
async function runHttpStress(targetUrl, path, requestsCount, maxConcurrency) {
  const latencies = [];
  let bytesTransferred = 0;
  let failed = 0;
  let completed = 0;
  let nextReqIndex = 0;

  const startTime = performance.now();

  async function worker() {
    while (nextReqIndex < requestsCount) {
      nextReqIndex++;
      const reqStart = performance.now();

      try {
        await new Promise((resolve, reject) => {
          const u = new URL(path, targetUrl);
          const req = http.get(u, (res) => {
            let total = 0;
            res.on('data', (d) => {
              total += d.length;
            });
            res.on('end', () => {
              const elapsed = performance.now() - reqStart;
              if (res.statusCode >= 200 && res.statusCode < 400) {
                latencies.push(elapsed);
                bytesTransferred += total;
              } else {
                failed++;
              }
              completed++;
              resolve();
            });
          });
          req.on('error', (err) => {
            failed++;
            completed++;
            reject(err);
          });
        });
      } catch {
        // counted in failed
      }
    }
  }

  const workers = Array.from({ length: maxConcurrency }, () => worker());
  await Promise.all(workers);

  const durationMs = performance.now() - startTime;
  const stats = calculateStats(latencies, bytesTransferred, durationMs);
  return { stats, failed, bytesTransferred, durationMs };
}

// 5. Runner: Idle Tunnel Capacity Scenario (Opening N tunnels with zero data traffic)
async function runTunnelCapacityStress(gatewayHost, isSecure, count, batchConcurrency, holdSec, indefinite = false) {
  const protocol = isSecure ? 'wss' : 'ws';
  const cleanServer = gatewayHost.replace(/^(https?|wss?):\/\//i, '').replace(/\/+$/, '');
  const prefix = `idle-${Date.now().toString(36)}`;

  const latencies = [];
  const openSockets = [];
  let failed = 0;
  let droppedDuringHold = 0;
  let nextIndex = 0;

  const holdDescription = indefinite ? 'indefinitely (until Ctrl+C / q)' : `${holdSec}s`;
  console.log(`▶ Running Scenario: Idle Tunnel Capacity (Opening ${count} tunnels, batch concurrency ${batchConcurrency}, hold ${holdDescription})...`);
  const startTime = performance.now();

  async function worker() {
    while (nextIndex < count) {
      const idx = ++nextIndex;
      const subdomain = `${prefix}-${idx}`;
      const wsUrl = `${protocol}://${cleanServer}/tunnel_ws?subdomain=${encodeURIComponent(subdomain)}`;
      const reqStart = performance.now();

      try {
        await new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl);
          const timer = setTimeout(() => {
            try { ws.close(); } catch {}
            reject(new Error('Connection timeout'));
          }, 10000);

          ws.on('message', (data) => {
            try {
              const pkt = JSON.parse(data.toString());
              if (pkt.type === 'REGISTER_ACK') {
                clearTimeout(timer);
                if (pkt.ack?.success) {
                  const elapsed = performance.now() - reqStart;
                  latencies.push(elapsed);
                  openSockets.push(ws);
                  resolve();
                } else {
                  reject(new Error(pkt.ack?.error || 'Registration failed'));
                }
              } else if (pkt.type === 'REQUEST' && pkt.request) {
                // Respond to incoming HTTP requests made to this tunnel so it works in the browser
                const bodyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Skyhook Stress Tunnel</title>
  <style>
    body { background: #07090e; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #0d121d; border: 1px solid #1e293b; border-radius: 12px; padding: 32px 40px; text-align: center; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    h1 { color: #38bdf8; font-size: 22px; margin-top: 0; }
    .badge { display: inline-block; background: #064e3b; color: #34d399; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 20px; margin-bottom: 16px; }
    code { background: #1e293b; color: #a5f3fc; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚡ ACTIVE STRESS TUNNEL</div>
    <h1>Skyhook Tunnel Online</h1>
    <p>Subdomain: <code>${subdomain}</code></p>
    <p>This tunnel was established by the Skyhook Stress Test Suite and is actively connected to the gateway.</p>
  </div>
</body>
</html>`;

                ws.send(JSON.stringify({
                  type: 'RESPONSE',
                  response: {
                    stream_id: pkt.request.stream_id,
                    status_code: 200,
                    headers: {
                      'Content-Type': ['text/html; charset=utf-8'],
                      'Cache-Control': ['no-cache'],
                    },
                    body: bodyHtml,
                    is_base64: false,
                  },
                }));
              }
            } catch (err) {
              clearTimeout(timer);
              reject(err);
            }
          });

          ws.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        });
      } catch {
        failed++;
      }
    }
  }

  const workers = Array.from({ length: batchConcurrency }, () => worker());
  await Promise.all(workers);

  const connectDurationMs = performance.now() - startTime;
  const connectStats = calculateStats(latencies, 0, connectDurationMs);

  // Monitor during hold period
  console.log(`  \x1b[32m✔ All ${openSockets.length} tunnels established.\x1b[0m Holding open ${holdDescription} (zero traffic)...`);
  if (indefinite) {
    console.log(`  \x1b[90mPress \x1b[1mCtrl+C\x1b[0m\x1b[90m or \x1b[1m'q'\x1b[0m\x1b[90m to close all tunnels and view report\x1b[0m\n`);
  }
  const peakHeap = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);

  // Attach listeners to track dropped connections
  for (const ws of openSockets) {
    ws.on('close', () => {
      droppedDuringHold++;
    });
  }

  const holdStartTime = performance.now();
  let stopRequested = false;
  let stopResolve;
  const stopPromise = new Promise((resolve) => {
    stopResolve = resolve;
  });

  const onInterrupt = () => {
    if (stopRequested) return;
    stopRequested = true;
    stopResolve();
  };

  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);

  let rawModeEnabled = false;
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (key) => {
        if (key === '\u0003' || key === '\u0004' || key.toLowerCase() === 'q') {
          onInterrupt();
        }
      });
      rawModeEnabled = true;
    } catch {}
  }

  let timer = null;
  if (!indefinite && holdSec > 0) {
    timer = setTimeout(() => {
      stopResolve();
    }, holdSec * 1000);
  }

  // Live status ticker
  const ticker = setInterval(() => {
    const elapsed = Math.floor((performance.now() - holdStartTime) / 1000);
    const activeCount = openSockets.filter((s) => s.readyState === WebSocket.OPEN).length;
    const targetLabel = indefinite ? 'indefinite' : `${holdSec}s`;
    process.stdout.write(`\r  \x1b[90m[Held: ${elapsed}s / ${targetLabel}] Active: \x1b[32m${activeCount}\x1b[90m/${openSockets.length}, Dropped: \x1b[${droppedDuringHold > 0 ? '31' : '90'}m${droppedDuringHold}\x1b[0m   `);
  }, 1000);

  await stopPromise;

  clearInterval(ticker);
  if (timer) clearTimeout(timer);
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onInterrupt);
  if (rawModeEnabled) {
    try {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch {}
  }
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  const actualHoldSec = Math.max(1, Math.round((performance.now() - holdStartTime) / 1000));
  const finalHoldLabel = indefinite ? `${actualHoldSec}s (indefinite)` : `${actualHoldSec}s`;

  // Teardown: close all tunnels
  console.log(`  Closing ${openSockets.length} idle tunnels...`);
  const teardownStart = performance.now();
  await Promise.all(
    openSockets.map((ws) => new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.on('close', () => resolve());
        try {
          ws.close(1000, 'stress test finished');
        } catch {
          resolve();
        }
      } else {
        resolve();
      }
    }))
  );
  const teardownMs = (performance.now() - teardownStart).toFixed(1);

  // Print ANSI Table for Tunnel Capacity
  printTunnelMetricsTable({
    title: `Scenario: Idle Tunnel Capacity (${count} tunnels, ${finalHoldLabel})`,
    totalRequested: count,
    connected: openSockets.length,
    failed,
    droppedDuringHold,
    connectStats,
    holdLabel: finalHoldLabel,
    teardownMs,
    peakHeap,
  });
}

// Main Execution
async function main() {
  const heapBefore = process.memoryUsage().heapUsed / (1024 * 1024);

  console.log(`\n\x1b[36m\x1b[1m⚡ Skyhook Tunnel - Stress & Performance Test Suite\x1b[0m`);
  console.log(`  Target Concurrency: \x1b[1m${concurrency}\x1b[0m workers`);
  console.log(`  Requests / Test:    \x1b[1m${totalRequests}\x1b[0m`);
  console.log(`  Idle Tunnels Target:\x1b[1m${totalTunnels}\x1b[0m (hold: ${isForever ? 'indefinite' : holdSeconds + 's'})`);
  console.log(`  Scenario:           \x1b[35m${selectedScenario}\x1b[0m\n`);

  // Detect mode
  let isLive = false;
  if (values.mode === 'live') {
    isLive = true;
  } else if (values.mode === 'auto') {
    isLive = await checkLiveServer(values.server);
  }

  console.log(`  Mode:               ${isLive ? '\x1b[32m[LIVE Go Gateway]\x1b[0m' : '\x1b[33m[MOCK Standalone]\x1b[0m'}`);

  // Setup mock local target & gateway
  const target = await setupMockTarget();
  let gateway = null;
  let gatewayPort = null;
  let gatewayHost = null;

  if (isLive) {
    gatewayHost = values.server;
    const parts = values.server.split(':');
    gatewayPort = Number(parts[1]) || 17356;
  } else {
    gateway = await setupMockGateway();
    gatewayHost = `127.0.0.1:${gateway.port}`;
    gatewayPort = gateway.port;
  }

  // If scenario is pure tunnels / idle: run only the idle tunnel capacity test and skip traffic generation
  if (selectedScenario === 'tunnels' || selectedScenario === 'idle') {
    await runTunnelCapacityStress(gatewayHost, false, totalTunnels, concurrency, holdSeconds, isForever);
  } else {
    // Launch Skyhook tunnel client for traffic scenarios
    let tunnelReadyResolve;
    const tunnelReadyPromise = new Promise((resolve) => {
      tunnelReadyResolve = resolve;
    });

    const tunnel = startTunnel({
      port: target.port,
      localHost: '127.0.0.1',
      subdomain: values.subdomain,
      server: gatewayHost,
      secure: false,
      onReady: (ack) => {
        tunnelReadyResolve(ack);
      },
      onError: (err) => {
        console.error('\x1b[31m✖ Tunnel client error:\x1b[0m', err.message);
      },
    });

    await tunnelReadyPromise;
    console.log(`  \x1b[32m✔ Main tunnel ready\x1b[0m (Target: 127.0.0.1:${target.port} ➔ Gateway: ${gatewayHost})\n`);

    const ingressUrl = `http://127.0.0.1:${gatewayPort}`;

    // Execute HTTP scenarios
    if (selectedScenario === 'all' || selectedScenario === 'http') {
      console.log(`▶ Running Scenario 1: HTTP 200 Fast Burst (${totalRequests} reqs, ${concurrency} workers)...`);
      const resFast = await runHttpStress(ingressUrl, '/fast', totalRequests, concurrency);
      printMetricsTable(`Scenario 1: HTTP Fast Burst (/fast)`, resFast.stats, resFast.failed, resFast.bytesTransferred);

      console.log(`▶ Running Scenario 2: JSON Payload Throughput (${Math.floor(totalRequests / 2)} reqs, ${concurrency} workers)...`);
      const resJson = await runHttpStress(ingressUrl, '/json', Math.floor(totalRequests / 2), concurrency);
      printMetricsTable(`Scenario 2: JSON Throughput (/json, 1KB)`, resJson.stats, resJson.failed, resJson.bytesTransferred);
    }

    if (selectedScenario === 'all' || selectedScenario === 'stream') {
      console.log(`▶ Running Scenario 3: Chunked Stream Multiplexing (50 streams, 256KB each)...`);
      const resStream = await runHttpStress(ingressUrl, '/stream?kb=256', 50, Math.min(25, concurrency));
      printMetricsTable(`Scenario 3: Chunked Streams (256KB chunks)`, resStream.stats, resStream.failed, resStream.bytesTransferred);
    }

    if (selectedScenario === 'all') {
      // Also run idle tunnels capacity in full suite
      await runTunnelCapacityStress(gatewayHost, false, totalTunnels, concurrency, holdSeconds, isForever);
    }
  }

  // Memory footprint comparison
  const heapAfter = process.memoryUsage().heapUsed / (1024 * 1024);
  const heapDelta = (heapAfter - heapBefore).toFixed(2);
  console.log(`\x1b[90mMemory Footprint: Initial ${heapBefore.toFixed(2)} MB ➔ Final ${heapAfter.toFixed(2)} MB (Delta: ${heapDelta} MB)\x1b[0m`);

  // Teardown
  if (gateway) await gateway.close();
  await target.close();

  console.log(`\n\x1b[32m✔ Stress test suite completed successfully.\x1b[0m\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\x1b[31mStress test failed:\x1b[0m', err);
  process.exit(1);
});
