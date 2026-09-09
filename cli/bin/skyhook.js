#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { startTunnel } from '../src/client.js';
import { generateSubdomain } from '../src/names.js';
import { getDeterministicPort, sanitizeSubdomain, readCurrentPackageName } from '../src/dport.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;

const args = process.argv.slice(2);

// Handle version query (-v, -V, --version, version)
if (args.includes('-v') || args.includes('-V') || args.includes('--version') || args.includes('version')) {
  console.log(`skyhook v${version}`);
  process.exit(0);
}

// Check for explicit --dport / -d flag
let explicitDportProject = null;
const dportIdx = args.findIndex((a) => a === '--dport' || a === '-d');
if (dportIdx !== -1) {
  if (args[dportIdx + 1] && !args[dportIdx + 1].startsWith('-')) {
    explicitDportProject = args[dportIdx + 1];
  } else {
    explicitDportProject = readCurrentPackageName();
    if (!explicitDportProject) {
      console.error('\x1b[31mError: --dport flag used without project name, and no package.json found in current directory.\x1b[0m');
      process.exit(1);
    }
  }
}

// Parse non-flag arguments
const nonFlagArgs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--name' || a === '-n' || a === '--server' || a === '-s') {
    i++; // skip next arg (its value)
    continue;
  }
  if (a === '--dport' || a === '-d') {
    if (args[i + 1] && !args[i + 1].startsWith('-')) {
      i++; // skip next arg (its value)
    }
    continue;
  }
  if (!a.startsWith('-')) {
    nonFlagArgs.push(a);
  }
}

let targetArg = explicitDportProject || nonFlagArgs[0];
let isExplicitDport = Boolean(explicitDportProject);

// Auto-detect package.json project name if no arguments passed at all
if (!targetArg && args.length === 0) {
  const cwdPkg = readCurrentPackageName();
  if (cwdPkg) {
    targetArg = cwdPkg;
    isExplicitDport = true;
  }
}

if (!targetArg || args.includes('--help') || args.includes('-h') || args.includes('help')) {
  console.log(`
\x1b[36m\x1b[1m⚡ Skyhook Tunnel CLI v${version}\x1b[0m
Expose your local development servers to the public internet securely.

\x1b[1mUsage:\x1b[0m
  skyhook <port | project | url> [options]
  npx @gkucmierz/skyhook <port | project | url> [options]

\x1b[1mOptions:\x1b[0m
  --name, -n <subdomain>   Specify a custom subdomain (e.g. --name bravia)
  --dport, -d [project]    Calculate deterministic port using @gkucmierz/dport
  --server, -s <host>      Specify gateway server (default: skyhook.7u.pl)
  --no-tls                 Connect using unencrypted ws:// (for local dev)
  --version, -v            Show version number
  --help, -h               Show this help message

\x1b[1mExamples:\x1b[0m
  skyhook 3000                           # Tunnel port 3000
  skyhook tv-pilot                       # Auto-detect dport for tv-pilot & route to tv-pilot.skyhook.7u.pl
  skyhook tv-pilot --name remote-pilot   # Custom public subdomain for tv-pilot
  skyhook -d                             # Auto-detect project in current dir via package.json
  skyhook http://localhost:34200/        # Tunnel from full URL
  skyhook 8080 -s localhost:17356        # Connect to local gateway
`);
  process.exit(0);
}

let targetPort = null;
let targetHost = '127.0.0.1';
let detectedProjectName = null;

if (isExplicitDport) {
  // Explicit -d / --dport flag used: calculate port directly
  detectedProjectName = targetArg;
  targetPort = getDeterministicPort(detectedProjectName);
} else if (/^\d+$/.test(targetArg)) {
  // Pure port number (e.g. 3000, 34200)
  targetPort = Number(targetArg);
} else if (/^:\d+$/.test(targetArg)) {
  // Colon port (e.g. :3000)
  targetPort = Number(targetArg.slice(1));
} else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(targetArg)) {
  // Full URL (e.g. http://localhost:34200/ or https://192.168.1.50:8080)
  try {
    const parsed = new URL(targetArg);
    targetHost = parsed.hostname || '127.0.0.1';
    targetPort = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  } catch {
    console.error(`\x1b[31mError: Could not parse URL from "${targetArg}"\x1b[0m`);
    process.exit(1);
  }
} else if (/^([a-zA-Z0-9_.-]+):(\d+)$/.test(targetArg)) {
  // Host with port (e.g. localhost:34200 or 192.168.1.100:8080)
  const match = targetArg.match(/^([a-zA-Z0-9_.-]+):(\d+)$/);
  targetHost = match[1];
  targetPort = Number(match[2]);
} else if (['localhost', '127.0.0.1', '0.0.0.0'].includes(targetArg.toLowerCase())) {
  // Bare loopback address without explicit port: default to standard HTTP port 80
  targetHost = targetArg;
  targetPort = 80;
} else {
  // Fallback: It is a project name! Resolve deterministic port via dport
  detectedProjectName = targetArg;
  targetPort = getDeterministicPort(detectedProjectName);
}

if (!targetPort || isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
  console.error(`\x1b[31mError: Invalid port number "${targetPort}"\x1b[0m`);
  process.exit(1);
}

// Parse custom subdomain
let customSubdomain = null;
const nameIdx = args.findIndex((a) => a === '--name' || a === '-n');
if (nameIdx !== -1 && args[nameIdx + 1]) {
  customSubdomain = args[nameIdx + 1];
}

// If no custom name specified, but a project name was detected, default subdomain to project name!
if (!customSubdomain && detectedProjectName) {
  customSubdomain = sanitizeSubdomain(detectedProjectName);
}

// If still no custom name specified, generate a friendly 2-word random subdomain (e.g. "neon-lagoon")
if (!customSubdomain) {
  customSubdomain = generateSubdomain();
}

// Parse server
let rawServer = 'skyhook.7u.pl';
const serverIdx = args.findIndex((a) => a === '--server' || a === '-s');
if (serverIdx !== -1 && args[serverIdx + 1]) {
  rawServer = args[serverIdx + 1];
}

let serverHost = rawServer.trim();
let explicitProtocol = null;

if (/^(https?|wss?):\/\//i.test(serverHost)) {
  try {
    const parsed = new URL(serverHost);
    explicitProtocol = parsed.protocol.toLowerCase();
    serverHost = parsed.host; // e.g. "localhost:17356" or "skyhook.7u.pl"
  } catch {
    serverHost = serverHost.replace(/^(https?|wss?):\/\//i, '').replace(/\/+$/, '');
  }
} else {
  serverHost = serverHost.replace(/\/+$/, '');
}

const isLocalhost = serverHost.includes('localhost') || serverHost.includes('127.0.0.1') || serverHost.includes('0.0.0.0');
if (isLocalhost && !serverHost.includes(':')) {
  serverHost = `${serverHost}:17356`;
} else if (isLocalhost && serverHost.endsWith(':34430')) {
  console.log('  \x1b[33mℹ Note: Port 34430 is the Vite UI dev server. Connecting to Go gateway on port 17356...\x1b[0m');
  serverHost = serverHost.replace(':34430', ':17356');
}

let isSecure = true;
if (args.includes('--tls') || explicitProtocol === 'https:' || explicitProtocol === 'wss:') {
  isSecure = true;
} else if (args.includes('--no-tls') || explicitProtocol === 'http:' || explicitProtocol === 'ws:' || isLocalhost) {
  isSecure = false;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

const bannerText = `⚡ SKYHOOK TUNNEL v${version}`;
const innerWidth = 64;
// In terminal monospace fonts, '⚡' (U+26A1) occupies 2 visual cells, while bannerText.length counts it as 1.
const bannerVisualWidth = bannerText.length + 1;
const padTotal = Math.max(0, innerWidth - bannerVisualWidth);
const padLeft = Math.floor(padTotal / 2);
const padRight = padTotal - padLeft;

console.log(`\n\x1b[36m\x1b[1m╔${'═'.repeat(innerWidth)}╗\x1b[0m`);
console.log(`\x1b[36m\x1b[1m║${' '.repeat(padLeft)}${bannerText}${' '.repeat(padRight)}║\x1b[0m`);
console.log(`\x1b[36m\x1b[1m╚${'═'.repeat(innerWidth)}╝\x1b[0m`);
console.log(`  \x1b[90mConnecting to gateway:\x1b[0m ${serverHost} ...`);

startTunnel({
  port: targetPort,
  localHost: targetHost,
  subdomain: customSubdomain,
  server: serverHost,
  secure: isSecure,
  onReady: (ack) => {
    const portPart = serverHost.includes(':') ? `:${serverHost.split(':')[1]}` : '';
    const displayUrl = isLocalhost ? `http://${ack.subdomain}.localhost${portPart}/` : ack.url;
    console.log(`\n  \x1b[32m✔ Tunnel Online!\x1b[0m\n`);
    if (detectedProjectName) {
      console.log(`  \x1b[1mProject:\x1b[0m       \x1b[35m${detectedProjectName}\x1b[0m \x1b[90m(dport: ${targetPort})\x1b[0m`);
    }
    console.log(`  \x1b[1mLocal Target:\x1b[0m  http://${targetHost}:${targetPort}`);
    console.log(`  \x1b[1mTunnel URL:\x1b[0m    \x1b[36m\x1b[4m${displayUrl}\x1b[0m`);
    console.log(`  \x1b[1mSubdomain:\x1b[0m     ${ack.subdomain}`);
    console.log(`\n  \x1b[90mForwarding incoming web requests to ${targetHost}:${targetPort}...\x1b[0m`);
    console.log(`  \x1b[90mPress \x1b[1m'o'\x1b[0m\x1b[90m to open in browser, \x1b[1mCtrl+C\x1b[0m\x1b[90m to close tunnel\x1b[0m\n`);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (key) => {
        if (key === '\u0003' || key === '\u0004' || key === '\u001A') {
          process.exit(0);
        }
        if (key.toLowerCase() === 'o') {
          console.log(`  \x1b[36m🌐 Opening ${displayUrl} in browser...\x1b[0m`);
          openBrowser(displayUrl);
        }
      });
    }
  },
  onError: (err) => {
    console.error(`\n  \x1b[31m✖ Tunnel Error:\x1b[0m ${err.message}\n`);
    process.exit(1);
  },
  onClose: () => {
    console.log(`\n  \x1b[33mTunnel connection closed.\x1b[0m\n`);
    process.exit(0);
  },
});
