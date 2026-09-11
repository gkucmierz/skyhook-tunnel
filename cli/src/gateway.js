/**
 * Gateway server configuration resolver.
 * Handles dev server presets (localhost:17356), remote production presets (skyhook.7u.pl),
 * UI port redirect (34430 -> 17356), and custom server URLs.
 *
 * @param {string[]} args - Process arguments
 * @returns {{ serverHost: string, isLocalhost: boolean, isSecure: boolean, targetEnvironment: 'dev'|'remote'|'custom' }}
 */
export function resolveGateway(args = []) {
  const isDevFlag = args.includes('--dev') || args.includes('--local');
  const isRemoteFlag = args.includes('--remote') || args.includes('--prod');

  let rawServer = 'skyhook.7u.pl';
  const serverIdx = args.findIndex((a) => a === '--server' || a === '-s');
  if (serverIdx !== -1 && args[serverIdx + 1] && !args[serverIdx + 1].startsWith('-')) {
    rawServer = args[serverIdx + 1];
  } else if (isDevFlag) {
    rawServer = 'dev';
  } else if (isRemoteFlag) {
    rawServer = 'remote';
  }

  let serverHost = rawServer.trim();
  let explicitProtocol = null;

  const lowerServer = serverHost.toLowerCase();
  let targetEnvironment = 'custom';

  if (lowerServer === 'dev' || lowerServer === 'local') {
    serverHost = 'localhost:17356';
    explicitProtocol = 'http:';
    targetEnvironment = 'dev';
  } else if (lowerServer === 'remote' || lowerServer === 'prod' || lowerServer === 'production' || lowerServer === 'skyhook.7u.pl') {
    serverHost = 'skyhook.7u.pl';
    explicitProtocol = 'https:';
    targetEnvironment = 'remote';
  }

  if (/^(https?|wss?):\/\//i.test(serverHost)) {
    try {
      const parsed = new URL(serverHost);
      explicitProtocol = parsed.protocol.toLowerCase();
      serverHost = parsed.host;
    } catch {
      serverHost = serverHost.replace(/^(https?|wss?):\/\//i, '').replace(/\/+$/, '');
    }
  } else {
    serverHost = serverHost.replace(/\/+$/, '');
  }

  const isLocalhost =
    serverHost.includes('localhost') ||
    serverHost.includes('127.0.0.1') ||
    serverHost.includes('0.0.0.0');

  if (isLocalhost) {
    targetEnvironment = 'dev';
    if (!serverHost.includes(':')) {
      serverHost = `${serverHost}:17356`;
    } else if (serverHost.endsWith(':34430')) {
      // Port 34430 is the Vite UI dev server; connect to Go gateway on port 17356
      serverHost = serverHost.replace(':34430', ':17356');
    }
  } else if (serverHost === 'skyhook.7u.pl') {
    targetEnvironment = 'remote';
  }

  let isSecure = true;
  if (args.includes('--tls') || explicitProtocol === 'https:' || explicitProtocol === 'wss:') {
    isSecure = true;
  } else if (args.includes('--no-tls') || explicitProtocol === 'http:' || explicitProtocol === 'ws:' || isLocalhost) {
    isSecure = false;
  }

  return {
    serverHost,
    isLocalhost,
    isSecure,
    targetEnvironment,
  };
}
