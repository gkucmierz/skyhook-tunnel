# ⚡ Skyhook Tunnel

> High-performance QUIC (HTTP/3 UDP) & WebSocket reverse-tunnel gateway for exposing local servers, WebGL/Cast benchmarks, and IoT devices to the public web.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Host: DE](https://img.shields.io/badge/Edge%20Node-Germany%20(vps--5378edda)-purple.svg)](https://skyhook.7u.pl/)
[![TLS: Wildcard](https://img.shields.io/badge/SSL-Wildcard%20*.skyhook.7u.pl-green.svg)](https://skyhook.7u.pl/)
[![Gitea](https://img.shields.io/badge/Gitea-Repository-609926.svg)](https://gitea.7u.pl/gkucmierz/skyhook-tunnel)
[![GitHub](https://img.shields.io/badge/GitHub-Mirror-181717.svg)](https://github.com/gkucmierz/skyhook-tunnel)

---

## 🌌 Overview

**Skyhook Tunnel** is an autonomous, self-hosted tunneling system built for the `7u.pl` ecosystem. It acts as an independent alternative to Cloudflare Quick Tunnels and ngrok, eliminating third-party rate limits and subscription barriers.

### Key Features
- **QUIC Transport (HTTP/3 UDP :4443):** Eliminates TCP Head-of-Line (HoL) blocking. Lost packets on home Wi-Fi do not stall concurrent streams.
- **WebSocket over TLS (WSS :443) Fallback:** Automatic failover through Nginx Proxy Manager if UDP is blocked by strict firewalls.
- **Wildcard Subdomains:** Automatic routing for `https://<subdomain>.skyhook.7u.pl/` backed by a Let's Encrypt Wildcard certificate.
- **Deterministic Port Forwarding (`@gkucmierz/dport`):** Pass project names (e.g. `tv-pilot`) instead of remembering raw port numbers. Skyhook calculates the port and auto-assigns the subdomain!
- **NPM Package (`@gkucmierz/skyhook`):** Run instantly via `npx` with zero installation required, identical to `@gkucmierz/dport`.
- **Integrated Documentation & Live Telemetry:** Interactive web portal and live tunnel dashboard at [https://skyhook.7u.pl/](https://skyhook.7u.pl/).
- **Protected Admin Panel (`/admin`):** Authenticated view of active tunnels, client IPs, traffic telemetry, and instant session termination kill-switch.
- **Bilingual Interface (PL / EN):** Instant reactive switching between Polish and English with persistent selection stored in `localStorage`.
- **Ecosystem Analytics (`analytics.7u.pl`):** Built-in telemetry tracking real sessions, pageviews, and connection metrics.

---

## 🚀 Quickstart

### 1. Deterministic Port Forwarding (via `@gkucmierz/dport`)
```bash
# Pass project name - Skyhook calculates dport and assigns the subdomain automatically:
npx @gkucmierz/skyhook tv-pilot
```
➔ Public URL: `https://tv-pilot.skyhook.7u.pl/` ➔ `http://127.0.0.1:51206`

### 2. Auto-Discovery in Current Directory
```bash
# Run inside any project directory to auto-detect its name from package.json:
npx @gkucmierz/skyhook
# or explicitly:
npx @gkucmierz/skyhook -d
```

### 3. Run with raw port or full URL
```bash
# Raw port number:
npx @gkucmierz/skyhook 34200

# Full URL from browser/clipboard:
npx @gkucmierz/skyhook http://localhost:34200/
```

### 4. Specify a custom memorable subdomain
```bash
npx @gkucmierz/skyhook 34200 --name bravia
# or with dport project:
npx @gkucmierz/skyhook tv-pilot --name remote-pilot
```
➔ Public URL: `https://remote-pilot.skyhook.7u.pl/`

### 5. Global installation
```bash
npm install -g @gkucmierz/skyhook
skyhook tv-pilot
```

### 6. Integration with `package.json`
Add a script to your project:
```json
{
  "scripts": {
    "dev": "vite",
    "tunnel": "skyhook -d"
  }
}
```

---

## 🛠️ Local Development Guide (Go + Vue)

### 1. Installing Go on macOS
The cleanest and most reliable way on macOS Apple Silicon / Intel:

```bash
brew install go
```
Verify installation:
```bash
go version
```

### 2. Starting Dev Server with Hot-Reload (NPM Style)
The root `package.json` contains unified scripts to run the Go backend and Vue 3 frontend simultaneously with automatic reload:

```bash
# Install root devDependencies (concurrently, nodemon)
npm install

# Start both Go server and Vue frontend concurrently with auto-reload
npm run dev
```

Individual commands:
```bash
# Run only Go backend with file watching (restarts on *.go edits)
npm run dev:server

# Run only Vue 3 frontend (Vite hot-module replacement)
npm run dev:ui

# Compile production builds
npm run build
```

---

## 🏗️ Project Architecture

```
skyhook-tunnel/
├── .gitea/workflows/deploy.yaml   # Gitea CI/CD targeting self-hosted-de runner
├── docker-compose.yml             # name: skyhook-tunnel on npm_public network
├── Dockerfile                     # Multi-stage build (Node 22 -> Go 1.23 -> Alpine 3.21)
├── server/                        # Go Backend Engine (HTTP Ingress + QUIC Listener)
│   ├── main.go                    # Ingress router & embedded UI file server
│   ├── tunnel.go                  # In-memory session registry & multiplexer
│   ├── quic.go                    # QUIC UDP:4443 engine (quic-go)
│   ├── ws.go                      # WebSocket WSS:443 relay engine
│   └── protocol.go                # Protocol packet framing
├── ui/                            # Documentation & Live Monitor (Vue 3 + Vite)
│   ├── src/
│   │   ├── locales.js             # Centralized PL/EN reactive localization
│   │   ├── components/            # Header, HeroBanner, QuickStart, TunnelDashboard,
│   │   │                          # ArchitectureDoc, Footer
│   │   └── App.vue
│   └── vite.config.js
└── cli/                           # NPM Package (@gkucmierz/skyhook)
    ├── bin/skyhook.js             # CLI binary launcher
    ├── src/client.js              # Streaming client dispatcher
    └── package.json
```

---

## 🚢 Production Deployment

The project is automatically built and deployed via **Gitea Actions** on push to `main`:
- **Runner:** `self-hosted-de` (German Contabo VPS `vps-5378edda`)
- **Docker Network:** `npm_public`
- **Reverse Proxy:** Nginx Proxy Manager with Wildcard Let's Encrypt for `*.skyhook.7u.pl, skyhook.7u.pl`
- **Deployment Strategy:** Zero-downtime (`docker compose build` ➔ `docker compose up -d --remove-orphans`)

---

## 📄 License
MIT © [gkucmierz](https://gitea.7u.pl/gkucmierz)
