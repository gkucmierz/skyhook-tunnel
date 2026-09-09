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
  const activeWsStreams = new Map();

  const cleanupWsStreams = () => {
    for (const [id, s] of activeWsStreams.entries()) {
      try {
        s.close(1000, 'tunnel closed');
      } catch {}
    }
    activeWsStreams.clear();
  };

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

    if (packet.type === 'WS_OPEN' && packet.ws_open) {
      const { stream_id, url, headers = {}, protocol: subprotocol } = packet.ws_open;
      const localWsUrl = `ws://${localHost}:${port}${url}`;

      const wsOptions = {
        headers: {},
      };
      for (const [key, val] of Object.entries(headers)) {
        const lKey = key.toLowerCase();
        if (
          lKey !== 'host' &&
          lKey !== 'upgrade' &&
          lKey !== 'connection' &&
          lKey !== 'sec-websocket-key' &&
          lKey !== 'sec-websocket-version' &&
          lKey !== 'sec-websocket-extensions'
        ) {
          wsOptions.headers[key] = Array.isArray(val) ? val.join(', ') : val;
        }
      }

      // Preserve client origin in X-Forwarded-Origin and adapt Origin to local target
      // to avoid 403 Forbidden / CORS rejection on local dev servers (e.g. Vite HMR)
      const incomingOrigin = wsOptions.headers['origin'] || wsOptions.headers['Origin'];
      if (incomingOrigin) {
        wsOptions.headers['X-Forwarded-Origin'] = incomingOrigin;
        delete wsOptions.headers['origin'];
      }
      wsOptions.headers['Origin'] = `http://${localHost}:${port}`;

      const protocols = subprotocol
        ? subprotocol.split(',').map((p) => p.trim()).filter(Boolean)
        : undefined;

      try {
        const localWs = new WebSocket(localWsUrl, protocols, wsOptions);
        activeWsStreams.set(stream_id, localWs);

        console.log(`  \x1b[35m⚡ WS\x1b[0m CONNECT ${url} \x1b[90m(stream: ${stream_id})\x1b[0m`);

        localWs.on('message', (data, isBinary) => {
          if (ws.readyState === WebSocket.OPEN) {
            let dataStr;
            if (isBinary) {
              dataStr = Buffer.from(data).toString('base64');
            } else {
              dataStr = data.toString('utf8');
            }

            ws.send(
              JSON.stringify({
                type: 'WS_MESSAGE',
                ws_message: {
                  stream_id,
                  data: dataStr,
                  is_binary: !!isBinary,
                },
              })
            );
          }
        });

        localWs.on('close', (code, reason) => {
          activeWsStreams.delete(stream_id);
          console.log(`  \x1b[35m⚡ WS\x1b[0m CLOSE ${url} \x1b[90m(code: ${code})\x1b[0m`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'WS_CLOSE',
                ws_close: {
                  stream_id,
                  code,
                  reason: reason ? reason.toString() : '',
                },
              })
            );
          }
        });

        localWs.on('error', (err) => {
          activeWsStreams.delete(stream_id);
          console.error(`  \x1b[31m⚡ WS ERR\x1b[0m ${url}: ${err.message}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'WS_CLOSE',
                ws_close: {
                  stream_id,
                  code: 1006,
                  reason: err.message,
                },
              })
            );
          }
        });
      } catch (err) {
        console.error(`  \x1b[31m⚡ WS SETUP ERR\x1b[0m ${url}: ${err.message}`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'WS_CLOSE',
              ws_close: {
                stream_id,
                code: 1006,
                reason: err.message,
              },
            })
          );
        }
      }
      return;
    }

    if (packet.type === 'WS_MESSAGE' && packet.ws_message) {
      const { stream_id, data, is_binary } = packet.ws_message;
      const localWs = activeWsStreams.get(stream_id);
      if (localWs && localWs.readyState === WebSocket.OPEN) {
        if (is_binary) {
          localWs.send(Buffer.from(data, 'base64'));
        } else {
          localWs.send(data);
        }
      }
      return;
    }

    if (packet.type === 'WS_CLOSE' && packet.ws_close) {
      const { stream_id, code, reason } = packet.ws_close;
      const localWs = activeWsStreams.get(stream_id);
      if (localWs) {
        activeWsStreams.delete(stream_id);
        if (localWs.readyState === WebSocket.OPEN || localWs.readyState === WebSocket.CONNECTING) {
          try {
            localWs.close(code || 1000, reason ? reason.toString() : '');
          } catch {
            // ignore
          }
        }
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
          redirect: 'manual',
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
          if (key.toLowerCase() === 'location') {
            val = rewriteLocation(val, localHost, port);
          }
          resHeaders[key].push(val);
        });

        const contentType = localRes.headers.get('content-type') || '';
        const isSse = contentType.toLowerCase().includes('text/event-stream');
        const transferEncoding = (localRes.headers.get('transfer-encoding') || '').toLowerCase();
        const isChunked = transferEncoding.includes('chunked');
        const hasContentLength = localRes.headers.has('content-length');
        const contentLength = parseInt(localRes.headers.get('content-length') || '0', 10);
        const isLarge = contentLength > 128 * 1024;
        const isStream = isSse || isChunked || isLarge || (!hasContentLength && localRes.status === 200 && req.method !== 'HEAD');

        if (isStream && localRes.body) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'STREAM_START',
                stream_start: {
                  stream_id: req.stream_id,
                  status_code: localRes.status,
                  headers: resHeaders,
                },
              })
            );
          }

          const reader = localRes.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'STREAM_CHUNK',
                    stream_chunk: {
                      stream_id: req.stream_id,
                      data: Buffer.from(value).toString('base64'),
                      is_binary: true,
                    },
                  })
                );
              } else {
                break;
              }
            }
          } finally {
            reader.releaseLock();
          }

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'STREAM_END',
                stream_end: {
                  stream_id: req.stream_id,
                },
              })
            );
          }

          const elapsed = Math.round(performance.now() - startTime);
          const statusColor = localRes.status >= 400 ? '\x1b[31m' : '\x1b[32m';
          console.log(
            `  ${statusColor}${localRes.status}\x1b[0m \x1b[1m${req.method}\x1b[0m ${req.url} \x1b[90m(stream, ${elapsed}ms)\x1b[0m`
          );
          return;
        }

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
    cleanupWsStreams();
    if (onClose) onClose();
  });

  return {
    close: () => {
      cleanupWsStreams();
      ws.close();
    },
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

export function rewriteLocation(locationHeader, localHost, port) {
  if (!locationHeader) return locationHeader;
  const escapedHost = localHost ? localHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  const hostPattern = escapedHost
    ? `${escapedHost}|localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]`
    : 'localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]';
  const regex = new RegExp(`^https?:\\/\\/(?:${hostPattern})(?::(?:${port}|\\d+))?(.*)$`, 'i');
  const match = locationHeader.match(regex);
  if (match) {
    let path = match[1] || '/';
    if (!path.startsWith('/')) path = '/' + path;
    return path;
  }
  return locationHeader;
}

