#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { startTunnel } from '../src/client.js';
import { generateSubdomain } from '../src/names.js';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h') || args.includes('help')) {
  console.log(`
\x1b[36m\x1b[1m⚡ Skyhook Tunnel CLI\x1b[0m
Expose your local development servers to the public internet securely.

\x1b[1mUsage:\x1b[0m
  skyhook <port> [options]
  npx @gkucmierz/skyhook <port> [options]

\x1b[1mOptions:\x1b[0m
  --name, -n <subdomain>   Specify a custom subdomain (e.g. --name bravia)
  --server, -s <host>      Specify gateway server (default: skyhook.7u.pl)
  --no-tls                 Connect using unencrypted ws:// (for local dev)
  --help, -h               Show this help message

\x1b[1mExamples:\x1b[0m
  skyhook 3000
  skyhook 34200 --name tv-pilot
  skyhook 8080 -s localhost:80 --no-tls
`);
  process.exit(0);
}

// Parse port
const portArg = args.find((a) => !a.startsWith('-') && !isNaN(Number(a)));
if (!portArg) {
  console.error('\x1b[31mError: Please specify a valid local port number (e.g. skyhook 3000)\x1b[0m');
  process.exit(1);
}
const localPort = Number(portArg);

// Parse custom subdomain
let customSubdomain = null;
const nameIdx = args.findIndex((a) => a === '--name' || a === '-n');
if (nameIdx !== -1 && args[nameIdx + 1]) {
  customSubdomain = args[nameIdx + 1];
}

// If no custom name specified, generate a friendly 2-word random subdomain (e.g. "neon-lagoon")
if (!customSubdomain) {
  customSubdomain = generateSubdomain();
}

// Parse server
let serverHost = 'skyhook.7u.pl';
const serverIdx = args.findIndex((a) => a === '--server' || a === '-s');
if (serverIdx !== -1 && args[serverIdx + 1]) {
  serverHost = args[serverIdx + 1];
}

const isLocalhost = serverHost.includes('localhost') || serverHost.includes('127.0.0.1') || serverHost.includes('0.0.0.0');
if (isLocalhost && !serverHost.includes(':')) {
  serverHost = `${serverHost}:17356`;
}
const isSecure = args.includes('--tls') || (!args.includes('--no-tls') && !isLocalhost);

console.log(`\n\x1b[36m\x1b[1m╔════════════════════════════════════════════════════════════════╗\x1b[0m`);
console.log(`\x1b[36m\x1b[1m║                   ⚡ SKYHOOK TUNNEL v1.1.0                      ║\x1b[0m`);
console.log(`\x1b[36m\x1b[1m╚════════════════════════════════════════════════════════════════╝\x1b[0m`);
console.log(`  \x1b[90mConnecting to gateway:\x1b[0m ${serverHost} ...`);

startTunnel({
  port: localPort,
  subdomain: customSubdomain,
  server: serverHost,
  secure: isSecure,
  onReady: (ack) => {
    const portPart = serverHost.includes(':') ? `:${serverHost.split(':')[1]}` : '';
    const displayUrl = isLocalhost ? `http://${ack.subdomain}.localhost${portPart}/` : ack.url;
    console.log(`\n  \x1b[32m✔ Tunnel Online!\x1b[0m\n`);
    console.log(`  \x1b[1mLocal Target:\x1b[0m  http://localhost:${localPort}`);
    console.log(`  \x1b[1mTunnel URL:\x1b[0m    \x1b[36m\x1b[4m${displayUrl}\x1b[0m`);
    console.log(`  \x1b[1mSubdomain:\x1b[0m     ${ack.subdomain}`);
    console.log(`\n  \x1b[90mForwarding incoming web requests to localhost:${localPort}...\x1b[0m`);
    console.log(`  \x1b[90mPress Ctrl+C to close tunnel\x1b[0m\n`);
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
