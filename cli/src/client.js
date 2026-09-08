import WebSocket from 'ws';

export function startTunnel({
  port,
  localHost = '127.0.0.1',
  subdomain,
  server = 'skyhook.7u.pl',
  secure = true,
  onReady,
  onError,
  onClose,
}) {
  const protocol = secure ? 'wss' : 'ws';
  const cleanServer = server.replace(/^(https?|wss?):\/\//i, '').replace(/\/+$/, '');
  const wsUrl = `${protocol}://${cleanServer}/tunnel_ws?subdomain=${encodeURIComponent(subdomain)}`;

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    // Connected to gateway, waiting for REGISTER_ACK
  });

  ws.on('message', async (data) => {
    let packet;
    try {
      packet = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (packet.type === 'REGISTER_ACK') {
      if (packet.ack?.success) {
        if (onReady) onReady(packet.ack);
      } else {
        const errMsg = packet.ack?.error || 'Registration failed';
        if (onError) onError(new Error(errMsg));
        ws.close();
      }
      return;
    }

    if (packet.type === 'REQUEST' && packet.request) {
      const startTime = performance.now();
      const req = packet.request;

      try {
        const localUrl = `http://${localHost}:${port}${req.url}`;
        const fetchOptions = {
          method: req.method,
          headers: {},
        };

        // Forward headers (excluding host/connection)
        for (const [key, val] of Object.entries(req.headers || {})) {
          const lKey = key.toLowerCase();
          if (lKey !== 'host' && lKey !== 'connection' && lKey !== 'content-length') {
            fetchOptions.headers[key] = Array.isArray(val) ? val.join(', ') : val;
          }
        }

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
          if (req.is_base64) {
            fetchOptions.body = Buffer.from(req.body, 'base64');
          } else {
            fetchOptions.body = req.body;
          }
        }

        const localRes = await fetch(localUrl, fetchOptions);
        const resHeaders = {};
        localRes.headers.forEach((val, key) => {
          if (!resHeaders[key]) resHeaders[key] = [];
          resHeaders[key].push(val);
        });

        const contentType = localRes.headers.get('content-type') || '';
        const isBinary = isBinaryContent(contentType);

        let bodyStr = '';
        if (isBinary) {
          const arrayBuf = await localRes.arrayBuffer();
          bodyStr = Buffer.from(arrayBuf).toString('base64');
        } else {
          bodyStr = await localRes.text();
        }

        const elapsed = Math.round(performance.now() - startTime);

        const responsePacket = {
          type: 'RESPONSE',
          response: {
            stream_id: req.stream_id,
            status_code: localRes.status,
            headers: resHeaders,
            body: bodyStr,
            is_base64: isBinary,
          },
        };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(responsePacket));
        }

        // Print request telemetry to console
        const statusColor = localRes.status >= 400 ? '\x1b[31m' : '\x1b[32m';
        console.log(
          `  ${statusColor}${localRes.status}\x1b[0m \x1b[1m${req.method}\x1b[0m ${req.url} \x1b[90m(${elapsed}ms)\x1b[0m`
        );
      } catch (err) {
        console.error(`  \x1b[31mERR\x1b[0m ${req.method} ${req.url}: ${err.message}`);
        const errorPacket = {
          type: 'RESPONSE',
          response: {
            stream_id: req.stream_id,
            status_code: 502,
            headers: { 'Content-Type': ['text/plain'] },
            body: `Local proxy error: ${err.message}`,
            is_base64: false,
          },
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(errorPacket));
        }
      }
    }
  });

  ws.on('error', (err) => {
    if (onError) onError(err);
  });

  ws.on('close', () => {
    if (onClose) onClose();
  });

  return {
    close: () => ws.close(),
  };
}

function isBinaryContent(contentType) {
  const ct = contentType.toLowerCase();
  return (
    ct.includes('image/') ||
    ct.includes('audio/') ||
    ct.includes('video/') ||
    ct.includes('octet-stream') ||
    ct.includes('wasm')
  );
}
