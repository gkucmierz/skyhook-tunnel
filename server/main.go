package main

import (
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const ServerVersion = "1.2.0"

//go:embed all:dist
var embeddedUI embed.FS

func validateAdminAuth(r *http.Request, adminPassword string) bool {
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if subtle.ConstantTimeCompare([]byte(token), []byte(adminPassword)) == 1 {
			return true
		}
	}
	if cookie, err := r.Cookie("skyhook_admin_token"); err == nil {
		if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(adminPassword)) == 1 {
			return true
		}
	}
	return false
}

func loadEnv(paths ...string) {
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				val := strings.Trim(strings.TrimSpace(parts[1]), "\"'`")
				if os.Getenv(key) == "" {
					os.Setenv(key, val)
				}
			}
		}
	}
}

func main() {
	loadEnv(".env", "../.env")

	httpPortStr := os.Getenv("HTTP_PORT")
	if httpPortStr == "" {
		httpPortStr = "17356" // Deterministic dport for skyhook-tunnel-server
	}
	quicPortStr := os.Getenv("QUIC_PORT")
	if quicPortStr == "" {
		quicPortStr = "4443"
	}
	baseDomain := os.Getenv("DOMAIN")
	if baseDomain == "" {
		baseDomain = "skyhook.7u.pl"
	}
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "skyhook"
		log.Printf("⚠️  ADMIN_PASSWORD not set in environment, defaulting to 'skyhook' for local development")
	}

	quicPort, _ := strconv.Atoi(quicPortStr)
	registry := NewTunnelRegistry(baseDomain)

	// 1. Start QUIC Listener in background
	go StartQuicListener(quicPort, registry)

	// 2. Setup HTTP Handler
	mux := http.NewServeMux()

	// WebSocket Registration Endpoint for CLI clients
	mux.HandleFunc("/tunnel_ws", func(w http.ResponseWriter, r *http.Request) {
		subdomain := strings.TrimSpace(r.URL.Query().Get("subdomain"))
		if subdomain == "" {
			http.Error(w, "missing 'subdomain' query parameter", http.StatusBadRequest)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("[WS] Upgrade error: %v", err)
			return
		}

		remoteIP, _, _ := net.SplitHostPort(r.RemoteAddr)
		session := NewWsTunnelSession(conn, subdomain, remoteIP)

		info, err := registry.Register(subdomain, session)
		ack := &TunnelPacket{
			Type: MsgRegisterAck,
			Ack: &AckPayload{
				Success:   err == nil,
				Subdomain: subdomain,
			},
		}
		if err != nil {
			ack.Ack.Error = err.Error()
		} else {
			ack.Ack.URL = info.PublicURL
		}

		data, _ := EncodePacket(ack)
		session.writeLock.Lock()
		conn.WriteMessage(1, data)
		session.writeLock.Unlock()

		if err != nil {
			conn.Close()
			return
		}

		log.Printf("[WS] 🟢 Tunnel registered: %s -> %s (Client: %s)", subdomain, info.PublicURL, remoteIP)
		session.ReadLoop(registry)
		log.Printf("[WS] 🔴 Tunnel disconnected: %s", subdomain)
	})

	// Public Aggregate Telemetry (Hides active tunnel subdomains, URLs, and IPs for privacy)
	mux.HandleFunc("/api/tunnels", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":       "online",
			"version":      ServerVersion,
			"domain":       baseDomain,
			"quic_port":    quicPort,
			"active_count": registry.Count(),
			"timestamp":    time.Now().Unix(),
		})
	})

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":  "ok",
			"service": "skyhook-tunnel",
			"version": ServerVersion,
		})
	})

	// ----------------------------------------------------
	// ADMIN API ENDPOINTS (Protected)
	// ----------------------------------------------------

	// Admin Login Endpoint
	mux.HandleFunc("/api/admin/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"errMethodNotAllowed"}`, http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "errInvalidPayload",
			})
			return
		}
		if subtle.ConstantTimeCompare([]byte(body.Password), []byte(adminPassword)) != 1 {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "errInvalidPassword",
			})
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "skyhook_admin_token",
			Value:    adminPassword,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"token":   adminPassword,
			"version": ServerVersion,
		})
	})

	// Admin Logout Endpoint
	mux.HandleFunc("/api/admin/logout", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.SetCookie(w, &http.Cookie{
			Name:     "skyhook_admin_token",
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
		})
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
		})
	})

	// Admin Protected Telemetry (Detailed active tunnels with Client IPs and traffic)
	mux.HandleFunc("/api/admin/tunnels", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !validateAdminAuth(r, adminPassword) {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "errUnauthorized",
			})
			return
		}
		tunnels := registry.List()
		json.NewEncoder(w).Encode(map[string]any{
			"status":       "online",
			"version":      ServerVersion,
			"domain":       baseDomain,
			"quic_port":    quicPort,
			"active_count": len(tunnels),
			"tunnels":      tunnels,
			"timestamp":    time.Now().Unix(),
		})
	})

	// Admin Kill Tunnel Endpoint
	mux.HandleFunc("/api/admin/tunnels/kill", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !validateAdminAuth(r, adminPassword) {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "errUnauthorized",
			})
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"errMethodNotAllowed"}`, http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Subdomain string `json:"subdomain"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Subdomain) == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "errInvalidSubdomain",
			})
			return
		}
		subdomain := strings.TrimSpace(req.Subdomain)
		disconnected := registry.Unregister(subdomain)
		if !disconnected {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "errTunnelNotFound",
			})
			return
		}
		log.Printf("[ADMIN] 🛑 Forcibly disconnected tunnel: %s", subdomain)
		json.NewEncoder(w).Encode(map[string]any{
			"success":   true,
			"subdomain": subdomain,
		})
	})

	// Static UI File Server (from embedded Vue dist)
	var fileServer http.Handler
	distFS, err := fs.Sub(embeddedUI, "dist")
	if err == nil {
		fsServer := http.FileServer(http.FS(distFS))
		fileServer = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			f, err := distFS.Open(path)
			if err != nil {
				// Fallback to index.html for SPA routing
				r.URL.Path = "/"
			} else {
				f.Close()
			}
			fsServer.ServeHTTP(w, r)
		})
	} else {
		// Fallback for local development when dist is not yet built
		fileServer = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprintf(w, `
				<!DOCTYPE html>
				<html>
				<head><title>Skyhook Server</title></head>
				<body style="background:#07090e;color:#38bdf8;font-family:sans-serif;padding:40px;">
					<h1>Skyhook Server Core</h1>
					<p>API & Tunnel Ingress active. Build UI with <code>npm run build:ui</code> to serve dashboard.</p>
				</body>
				</html>
			`)
		})
	}

	// Root Router: Checks if Host is a tunnel subdomain or the main domain
	rootHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if colon := strings.Index(host, ":"); colon != -1 {
			host = host[:colon]
		}

		// Check if request is for a tunnel subdomain, e.g. "bravia.skyhook.7u.pl"
		suffix := "." + baseDomain
		if strings.HasSuffix(host, suffix) && host != baseDomain {
			subdomain := strings.TrimSuffix(host, suffix)
			handleTunnelProxy(w, r, subdomain, registry)
			return
		}

		// Support local subdomains: *.localhost (e.g. "crimson-horizon.localhost")
		if strings.HasSuffix(host, ".localhost") && host != "localhost" {
			subdomain := strings.TrimSuffix(host, ".localhost")
			handleTunnelProxy(w, r, subdomain, registry)
			return
		}

		// Also support path-based tunneling: /t/<subdomain>/...
		if strings.HasPrefix(r.URL.Path, "/t/") {
			parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/t/"), "/", 2)
			if len(parts) > 0 && parts[0] != "" {
				subdomain := parts[0]
				r.URL.Path = "/"
				if len(parts) > 1 {
					r.URL.Path += parts[1]
				}
				http.SetCookie(w, &http.Cookie{
					Name:     "skyhook_tunnel",
					Value:    subdomain,
					Path:     "/",
					SameSite: http.SameSiteLaxMode,
				})
				handleTunnelProxy(w, r, subdomain, registry)
				return
			}
		}

		// Serve API and WebSocket endpoints
		if strings.HasPrefix(r.URL.Path, "/api") || strings.HasPrefix(r.URL.Path, "/tunnel_ws") {
			mux.ServeHTTP(w, r)
			return
		}

		// Check cookie or Referer for path-based tunnel asset requests (e.g. /@vite/client, /src/main.js)
		if cookie, err := r.Cookie("skyhook_tunnel"); err == nil && cookie.Value != "" {
			if _, exists := registry.Get(cookie.Value); exists && r.URL.Path != "/" && r.URL.Path != "/index.html" {
				handleTunnelProxy(w, r, cookie.Value, registry)
				return
			}
		}

		// Serve Static Dashboard UI
		fileServer.ServeHTTP(w, r)
	})

	server := &http.Server{
		Addr:    ":" + httpPortStr,
		Handler: rootHandler,
	}

	log.Printf("==================================================")
	log.Printf("🚀 Skyhook Tunnel Ingress starting")
	log.Printf("   HTTP Ingress: http://0.0.0.0:%s", httpPortStr)
	log.Printf("   QUIC Ingress: udp://0.0.0.0:%s", quicPortStr)
	log.Printf("   Base Domain:  %s", baseDomain)
	log.Printf("==================================================")

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down Skyhook gracefully...")
	server.Close()
}

func handleTunnelProxy(w http.ResponseWriter, r *http.Request, subdomain string, registry *TunnelRegistry) {
	// Intercept robots.txt to prevent search engine indexing of tunnel endpoints
	if r.URL.Path == "/robots.txt" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("User-agent: *\nDisallow: /\n"))
		return
	}

	// Read request body
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	streamID := fmt.Sprintf("%d-%s", time.Now().UnixNano(), r.Method)
	isBinary := isBinaryContent(r.Header.Get("Content-Type"))

	bodyStr := ""
	if isBinary {
		bodyStr = base64.StdEncoding.EncodeToString(bodyBytes)
	} else {
		bodyStr = string(bodyBytes)
	}

	reqPayload := &RequestPayload{
		StreamID: streamID,
		Method:   r.Method,
		URL:      r.URL.RequestURI(),
		Headers:  r.Header,
		Body:     bodyStr,
		IsBase64: isBinary,
	}

	resPayload, err := registry.Forward(subdomain, reqPayload)
	if err != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `
			<div style="font-family:sans-serif;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;max-width:600px;margin:50px auto;">
				<h2 style="color:#ef4444;">Skyhook 502: Tunnel Offline</h2>
				<p>No active tunnel connected for subdomain: <code>%s</code></p>
				<p style="color:#94a3b8;font-size:13px;">Error: %v</p>
				<hr style="border-color:#334155;margin:20px 0;"/>
				<p style="font-size:12px;color:#64748b;">Powered by Skyhook Tunnel Gateway</p>
			</div>
		`, subdomain, err)
		return
	}

	// Copy response headers
	for k, vv := range resPayload.Headers {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resPayload.StatusCode)

	if resPayload.IsBase64 {
		decoded, _ := base64.StdEncoding.DecodeString(resPayload.Body)
		w.Write(decoded)
	} else {
		w.Write([]byte(resPayload.Body))
	}
}

func isBinaryContent(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.Contains(ct, "image/") ||
		strings.Contains(ct, "audio/") ||
		strings.Contains(ct, "video/") ||
		strings.Contains(ct, "octet-stream") ||
		strings.Contains(ct, "wasm")
}
