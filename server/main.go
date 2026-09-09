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
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

const ServerVersion = "1.2.1"

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

	dataPath := os.Getenv("DATA_PATH")
	if dataPath == "" {
		dataPath = "./data/telemetry.json"
	}
	telemetryStore := NewTelemetryStore(dataPath)
	telemetryStore.StartFlusher(1 * time.Minute)

	// Graceful shutdown to flush telemetry to disk when container restarts (e.g. CI/CD rebuild)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		log.Printf("🛑 Received signal %v, flushing telemetry to disk before exit...", sig)
		_ = telemetryStore.Save()
		os.Exit(0)
	}()

	quicPort, _ := strconv.Atoi(quicPortStr)
	registry := NewTunnelRegistry(baseDomain, telemetryStore)

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
			"telemetry":    telemetryStore.GetSummary(),
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
			"telemetry":    telemetryStore.GetSummary(),
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

func copyAndInjectProxyHeaders(r *http.Request) map[string][]string {
	headers := make(map[string][]string, len(r.Header)+4)
	for k, vv := range r.Header {
		copied := make([]string, len(vv))
		copy(copied, vv)
		headers[k] = copied
	}

	remoteIP := r.RemoteAddr
	if host, _, err := net.SplitHostPort(remoteIP); err == nil {
		remoteIP = host
	}

	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}

	if prior := headers["X-Forwarded-For"]; len(prior) > 0 {
		headers["X-Forwarded-For"] = []string{strings.Join(prior, ", ") + ", " + remoteIP}
	} else {
		headers["X-Forwarded-For"] = []string{remoteIP}
	}

	port := "80"
	if scheme == "https" {
		port = "443"
	}
	if colon := strings.LastIndex(r.Host, ":"); colon != -1 {
		port = r.Host[colon+1:]
	}

	headers["X-Forwarded-Host"] = []string{r.Host}
	headers["X-Forwarded-Proto"] = []string{scheme}
	headers["X-Forwarded-Port"] = []string{port}
	headers["X-Real-Ip"] = []string{remoteIP}

	return headers
}

func handleTunnelWebSocket(w http.ResponseWriter, r *http.Request, subdomain string, registry *TunnelRegistry) {
	streamID := fmt.Sprintf("ws-%d-%d", time.Now().UnixNano(), time.Now().Unix())

	openPayload := &WsOpenPayload{
		StreamID: streamID,
		URL:      r.URL.RequestURI(),
		Headers:  copyAndInjectProxyHeaders(r),
		Protocol: r.Header.Get("Sec-WebSocket-Protocol"),
	}

	session, msgChan, closeChan, cleanup, err := registry.ForwardWsOpen(subdomain, openPayload)
	if err != nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, "Skyhook 502: Tunnel Offline for subdomain %s (%v)\n", subdomain, err)
		return
	}
	defer cleanup()

	var responseHeader http.Header
	if subproto := r.Header.Get("Sec-WebSocket-Protocol"); subproto != "" {
		protos := strings.Split(subproto, ",")
		if len(protos) > 0 {
			responseHeader = http.Header{
				"Sec-WebSocket-Protocol": []string{strings.TrimSpace(protos[0])},
			}
		}
	}

	clientConn, err := upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		log.Printf("[WS-PROXY] ⚠️ Upgrade error for %s (%s): %v", subdomain, streamID, err)
		_ = session.SendPacket(&TunnelPacket{
			Type: MsgWsClose,
			WsClose: &WsClosePayload{
				StreamID: streamID,
				Code:     1006,
				Reason:   err.Error(),
			},
		})
		return
	}
	defer clientConn.Close()

	done := make(chan struct{})
	var closeOnce sync.Once
	safeClose := func(code int, reason string) {
		closeOnce.Do(func() {
			close(done)
			_ = session.SendPacket(&TunnelPacket{
				Type: MsgWsClose,
				WsClose: &WsClosePayload{
					StreamID: streamID,
					Code:     code,
					Reason:   reason,
				},
			})
		})
	}

	// 1. Browser Client -> Local Tunnel CLI
	go func() {
		defer safeClose(1000, "client disconnected")
		for {
			msgType, data, err := clientConn.ReadMessage()
			if err != nil {
				return
			}

			isBinary := (msgType == websocket.BinaryMessage)
			var dataStr string
			if isBinary {
				dataStr = base64.StdEncoding.EncodeToString(data)
			} else {
				dataStr = string(data)
			}

			packet := &TunnelPacket{
				Type: MsgWsMessage,
				WsMessage: &WsMessagePayload{
					StreamID: streamID,
					Data:     dataStr,
					IsBinary: isBinary,
				},
			}
			if err := session.SendPacket(packet); err != nil {
				return
			}
		}
	}()

	// 2. Local Tunnel CLI -> Browser Client
	for {
		select {
		case <-done:
			return
		case <-closeChan:
			clientConn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1000, "tunnel closed"))
			return
		case msg, ok := <-msgChan:
			if !ok || msg == nil {
				return
			}
			if msg.IsBinary {
				data, _ := base64.StdEncoding.DecodeString(msg.Data)
				if err := clientConn.WriteMessage(websocket.BinaryMessage, data); err != nil {
					safeClose(1006, "write error")
					return
				}
			} else {
				if err := clientConn.WriteMessage(websocket.TextMessage, []byte(msg.Data)); err != nil {
					safeClose(1006, "write error")
					return
				}
			}
		}
	}
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

	// Intercept WebSocket upgrade requests and proxy full-duplex frames
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") ||
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") {
		handleTunnelWebSocket(w, r, subdomain, registry)
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
		Headers:  copyAndInjectProxyHeaders(r),
		Body:     bodyStr,
		IsBase64: isBinary,
	}

	err = registry.ForwardHttp(w, r, reqPayload, subdomain)
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
}

func isBinaryContent(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.Contains(ct, "image/") ||
		strings.Contains(ct, "audio/") ||
		strings.Contains(ct, "video/") ||
		strings.Contains(ct, "octet-stream") ||
		strings.Contains(ct, "wasm")
}

var localRedirectRegex = regexp.MustCompile(`^https?://(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?(.*)$`)

func rewriteLocationHeader(rawLocation, publicHost, scheme string) string {
	if rawLocation == "" {
		return rawLocation
	}
	if matches := localRedirectRegex.FindStringSubmatch(rawLocation); len(matches) > 0 {
		path := matches[1]
		if path == "" {
			path = "/"
		} else if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
		return fmt.Sprintf("%s://%s%s", scheme, publicHost, path)
	}
	return rawLocation
}

func rewriteCorsOrigin(originHeader, publicHost, scheme string) string {
	if originHeader == "" || originHeader == "*" {
		return originHeader
	}
	if localRedirectRegex.MatchString(originHeader) {
		return fmt.Sprintf("%s://%s", scheme, publicHost)
	}
	return originHeader
}

func rewriteResponseHeader(key, val, publicHost, scheme string) string {
	if strings.EqualFold(key, "Location") {
		return rewriteLocationHeader(val, publicHost, scheme)
	}
	if strings.EqualFold(key, "Access-Control-Allow-Origin") {
		return rewriteCorsOrigin(val, publicHost, scheme)
	}
	return val
}

