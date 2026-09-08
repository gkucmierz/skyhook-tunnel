package main

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

type TunnelSession interface {
	SendRequest(req *RequestPayload) (*ResponsePayload, error)
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
	mu      sync.RWMutex
	tunnels map[string]*TunnelInfo
	domain  string
}

func NewTunnelRegistry(domain string) *TunnelRegistry {
	return &TunnelRegistry{
		tunnels: make(map[string]*TunnelInfo),
		domain:  domain,
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
	return info, nil
}

func (r *TunnelRegistry) Unregister(subdomain string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if info, exists := r.tunnels[subdomain]; exists {
		info.Session.Close()
		delete(r.tunnels, subdomain)
	}
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
	info.TotalBytes += int64(len(req.Body) + len(res.Body))
	info.LastActivityAt = time.Now()
	r.mu.Unlock()

	return res, nil
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
