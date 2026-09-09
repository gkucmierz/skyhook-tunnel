package main

import (
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type TunnelSession interface {
	SendRequest(req *RequestPayload) (*ResponsePayload, error)
	ForwardHttp(w http.ResponseWriter, r *http.Request, req *RequestPayload) error
	SendPacket(packet *TunnelPacket) error
	RegisterWsStream(streamID string) (chan *WsMessagePayload, chan struct{}, func())
	DispatchWsMessage(msg *WsMessagePayload)
	DispatchWsClose(closePayload *WsClosePayload)
	Close() error
	TransportType() string
	ClientIP() string
}

type TunnelInfo struct {
	Subdomain      string        `json:"subdomain"`
	PublicURL      string        `json:"public_url"`
	Transport      string        `json:"transport"`
	ClientIP       string        `json:"client_ip"`
	ConnectedAt    time.Time     `json:"connected_at"`
	TotalRequests  int64         `json:"total_requests"`
	TotalBytes     int64         `json:"total_bytes"`
	LastActivityAt time.Time     `json:"last_activity_at"`
	Session        TunnelSession `json:"-"`
}

type TunnelRegistry struct {
	mu        sync.RWMutex
	tunnels   map[string]*TunnelInfo
	domain    string
	telemetry *TelemetryStore
}

func NewTunnelRegistry(domain string, telemetry *TelemetryStore) *TunnelRegistry {
	return &TunnelRegistry{
		tunnels:   make(map[string]*TunnelInfo),
		domain:    domain,
		telemetry: telemetry,
	}
}

func (r *TunnelRegistry) Register(subdomain string, session TunnelSession) (*TunnelInfo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.tunnels[subdomain]; exists {
		return nil, fmt.Errorf("subdomain '%s' is already in use by another active tunnel", subdomain)
	}

	info := &TunnelInfo{
		Subdomain:      subdomain,
		PublicURL:      fmt.Sprintf("https://%s.%s", subdomain, r.domain),
		Transport:      session.TransportType(),
		ClientIP:       session.ClientIP(),
		ConnectedAt:    time.Now(),
		LastActivityAt: time.Now(),
		Session:        session,
	}

	r.tunnels[subdomain] = info
	if r.telemetry != nil {
		r.telemetry.RecordTunnel(session.TransportType())
	}
	return info, nil
}

func (r *TunnelRegistry) Unregister(subdomain string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if info, exists := r.tunnels[subdomain]; exists {
		info.Session.Close()
		delete(r.tunnels, subdomain)
		return true
	}
	return false
}

func (r *TunnelRegistry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.tunnels)
}

func (r *TunnelRegistry) Get(subdomain string) (*TunnelInfo, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	info, exists := r.tunnels[subdomain]
	return info, exists
}

func (r *TunnelRegistry) Forward(subdomain string, req *RequestPayload) (*ResponsePayload, error) {
	r.mu.RLock()
	info, exists := r.tunnels[subdomain]
	r.mu.RUnlock()

	if !exists {
		return nil, errors.New("tunnel not found or disconnected")
	}

	res, err := info.Session.SendRequest(req)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	info.TotalRequests++
	bytes := int64(len(req.Body) + len(res.Body))
	info.TotalBytes += bytes
	info.LastActivityAt = time.Now()
	r.mu.Unlock()

	if r.telemetry != nil {
		r.telemetry.RecordTraffic(1, bytes)
	}

	return res, nil
}

func (r *TunnelRegistry) ForwardHttp(w http.ResponseWriter, req *http.Request, reqPayload *RequestPayload, subdomain string) error {
	r.mu.RLock()
	info, exists := r.tunnels[subdomain]
	r.mu.RUnlock()

	if !exists {
		return errors.New("tunnel not found or disconnected")
	}

	err := info.Session.ForwardHttp(w, req, reqPayload)
	if err != nil {
		return err
	}

	r.mu.Lock()
	info.TotalRequests++
	info.LastActivityAt = time.Now()
	r.mu.Unlock()

	if r.telemetry != nil {
		r.telemetry.RecordTraffic(1, 0)
	}

	return nil
}

func (r *TunnelRegistry) ForwardWsOpen(subdomain string, openPayload *WsOpenPayload) (TunnelSession, chan *WsMessagePayload, chan struct{}, func(), error) {
	r.mu.RLock()
	info, exists := r.tunnels[subdomain]
	r.mu.RUnlock()

	if !exists {
		return nil, nil, nil, nil, errors.New("tunnel not found or disconnected")
	}

	msgChan, closeChan, cleanup := info.Session.RegisterWsStream(openPayload.StreamID)

	packet := &TunnelPacket{
		Type:   MsgWsOpen,
		WsOpen: openPayload,
	}
	if err := info.Session.SendPacket(packet); err != nil {
		cleanup()
		return nil, nil, nil, nil, err
	}

	r.mu.Lock()
	info.TotalRequests++
	info.LastActivityAt = time.Now()
	r.mu.Unlock()

	if r.telemetry != nil {
		r.telemetry.RecordTraffic(1, 0)
	}

	return info.Session, msgChan, closeChan, cleanup, nil
}

func (r *TunnelRegistry) List() []*TunnelInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	list := make([]*TunnelInfo, 0, len(r.tunnels))
	for _, info := range r.tunnels {
		list = append(list, info)
	}
	return list
}
