# ⚡ @gkucmierz/skyhook

> Blazing fast reverse-tunnel client for exposing local development servers, IoT devices, and WebGL/TV benchmarks to the public web securely.

[![npm version](https://img.shields.io/npm/v/@gkucmierz/skyhook.svg)](https://www.npmjs.com/package/@gkucmierz/skyhook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Edge: DE](https://img.shields.io/badge/Gateway-skyhook.7u.pl-purple.svg)](https://skyhook.7u.pl/)

Official web portal and live telemetry dashboard: [https://skyhook.7u.pl/](https://skyhook.7u.pl/)

---

## 🚀 Quickstart

### 1. Zero Installation (via npx)

Expose your local server in seconds without installing anything:

```bash
npx @gkucmierz/skyhook 3000
```

### 2. Custom Subdomain

Assign a persistent, memorable subdomain on `*.skyhook.7u.pl`:

```bash
npx @gkucmierz/skyhook 34200 --name bravia
```

➔ Instant HTTPS URL: `https://bravia.skyhook.7u.pl/`

### 3. Global Installation

```bash
npm install -g @gkucmierz/skyhook
skyhook 3000
```

### 4. Integration with `package.json`

Add a convenient `tunnel` script alongside your dev server:

```json
{
  "scripts": {
    "dev": "vite",
    "tunnel": "skyhook 34200"
  }
}
```

---

## ⚙️ CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `[port]` | Local application port to forward | Auto-detected from `package.json` or interactive |
| `--name <subdomain>` | Custom subdomain name on `*.skyhook.7u.pl` | Random 7-character ID |
| `--server <host>` | Custom Skyhook gateway host | `skyhook.7u.pl` |
| `-h, --help` | Display help and usage information | — |

---

## 💻 Programmatic API

You can also integrate Skyhook directly into Node.js test runners, CI pipelines, or internal dev tools:

```javascript
import { startTunnel } from '@gkucmierz/skyhook';

const tunnel = startTunnel({
  port: 34200,
  subdomain: 'my-test-app',
  server: 'skyhook.7u.pl',
  onReady: (ack) => {
    console.log(`🚀 Public Tunnel URL: ${ack.url}`);
  },
  onError: (err) => {
    console.error('Tunnel error:', err);
  },
});

// Gracefully close when done:
// tunnel.close();
```

---

## 📄 License

MIT © [gkucmierz](https://gitea.7u.pl/gkucmierz)

