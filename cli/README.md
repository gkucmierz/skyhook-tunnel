# ⚡ @gkucmierz/skyhook

> Blazing fast reverse-tunnel client for exposing local development servers, IoT devices, and WebGL/TV benchmarks to the public web securely.

[![npm version](https://img.shields.io/npm/v/@gkucmierz/skyhook.svg)](https://www.npmjs.com/package/@gkucmierz/skyhook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Edge: DE](https://img.shields.io/badge/Gateway-skyhook.7u.pl-purple.svg)](https://skyhook.7u.pl/)

Official web portal and live telemetry dashboard: [https://skyhook.7u.pl/](https://skyhook.7u.pl/)

---

## 🚀 Quickstart

### 1. Deterministic Port Forwarding (via `@gkucmierz/dport`)

No need to memorize arbitrary port numbers! Skyhook natively integrates with `@gkucmierz/dport`:

```bash
# Pass project name - Skyhook calculates dport and assigns the subdomain automatically:
npx @gkucmierz/skyhook tv-pilot
```

➔ Instant HTTPS URL: `https://tv-pilot.skyhook.7u.pl/` ➔ `http://127.0.0.1:51206`

### 2. Auto-Discovery in Current Directory

Run directly inside any project folder containing a `package.json`:

```bash
# Auto-detects project name from package.json and calculates its dport:
npx @gkucmierz/skyhook
# or explicitly:
npx @gkucmierz/skyhook -d
```

### 3. Raw Port or Full URL Forwarding

Expose standard port numbers or paste full URLs directly from your browser/clipboard:

```bash
# Forward raw port (generates a friendly 2-word subdomain like "neon-lagoon"):
npx @gkucmierz/skyhook 3000

# Forward full URL:
npx @gkucmierz/skyhook http://localhost:34200/
```

### 4. Custom Subdomain

Assign a persistent, memorable subdomain on `*.skyhook.7u.pl`:

```bash
npx @gkucmierz/skyhook 34200 --name bravia
# or with dport project:
npx @gkucmierz/skyhook tv-pilot --name remote-pilot
```

➔ Instant HTTPS URL: `https://remote-pilot.skyhook.7u.pl/`

### 5. Global Installation

```bash
npm install -g @gkucmierz/skyhook
skyhook tv-pilot
```

### 6. Integration with `package.json`

Add a convenient `tunnel` script alongside your dev server:

```json
{
  "scripts": {
    "dev": "vite",
    "tunnel": "skyhook -d"
  }
}
```

---

## ⚙️ CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `[port \| project \| url]` | Port number (`3000`), dport project name (`tv-pilot`), or full URL | Auto-detected from `package.json` |
| `--dport, -d [project]` | Calculate deterministic port using `@gkucmierz/dport` | Current `package.json` name |
| `--name, -n <subdomain>` | Custom subdomain name on `*.skyhook.7u.pl` | Project name or random 2-word phrase |
| `--server, -s <host>` | Gateway server hostname or URL | `skyhook.7u.pl` |
| `--no-tls` | Connect using unencrypted `ws://` (for local dev) | — |
| `--version, -v` | Print Skyhook CLI version | — |
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

