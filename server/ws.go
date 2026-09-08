package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev/tunnel client connections
	},
}

type WsTunnelSession struct {
	conn        *websocket.Conn
	subdomain   string
	clientIP    string
	pendingLock sync.Mutex
	pendingReqs map[string]chan *ResponsePayload
	writeLock   sync.Mutex
	closeOnce   sync.Once
	closed      chan struct{}
}

func NewWsTunnelSession(conn *websocket.Conn, subdomain, clientIP string) *WsTunnelSession {
	return &WsTunnelSession{
		conn:        conn,
		subdomain:   subdomain,
		clientIP:    clientIP,
		pendingReqs: make(map[string]chan *ResponsePayload),
		closed:      make(chan struct{}),
	}
}

func (s *WsTunnelSession) TransportType() string {
	return "WebSocket (WSS)"
}

func (s *WsTunnelSession) ClientIP() string {
	return s.clientIP
}

func (s *WsTunnelSession) Close() error {
	var err error
	s.closeOnce.Do(func() {
		close(s.closed)
		s.writeLock.Lock()
		err = s.conn.Close()
		s.writeLock.Unlock()

		s.pendingLock.Lock()
		for _, ch := range s.pendingReqs {
			close(ch)
		}
		s.pendingReqs = make(map[string]chan *ResponsePayload)
		s.pendingLock.Unlock()
	})
	return err
}

func (s *WsTunnelSession) SendRequest(req *RequestPayload) (*ResponsePayload, error) {
	select {
	case <-s.closed:
		return nil, errors.New("tunnel connection is closed")
	default:
	}

	respChan := make(chan *ResponsePayload, 1)

	s.pendingLock.Lock()
	s.pendingReqs[req.StreamID] = respChan
	s.pendingLock.Unlock()

	defer func() {
		s.pendingLock.Lock()
		delete(s.pendingReqs, req.StreamID)
		s.pendingLock.Unlock()
	}()

	packet := &TunnelPacket{
		Type:    MsgRequest,
		Request: req,
	}

	data, err := EncodePacket(packet)
	if err != nil {
		return nil, err
	}

	s.writeLock.Lock()
	err = s.conn.WriteMessage(websocket.TextMessage, data)
	s.writeLock.Unlock()

	if err != nil {
		return nil, fmt.Errorf("failed to send packet over websocket: %w", err)
	}

	select {
	case resp, ok := <-respChan:
		if !ok || resp == nil {
			return nil, errors.New("tunnel closed while waiting for response")
		}
		return resp, nil
	case <-time.After(35 * time.Second):
		return nil, errors.New("gateway timeout waiting for response from local tunnel client")
	case <-s.closed:
		return nil, errors.New("tunnel disconnected during request")
	}
}

func (s *WsTunnelSession) ReadLoop(registry *TunnelRegistry) {
	defer registry.Unregister(s.subdomain)

	// Keepalive ticker
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.writeLock.Lock()
				err := s.conn.WriteMessage(websocket.PingMessage, nil)
				s.writeLock.Unlock()
				if err != nil {
					return
				}
			case <-s.closed:
				return
			}
		}
	}()

	for {
		_, message, err := s.conn.ReadMessage()
		if err != nil {
			break
		}

		packet, err := DecodePacket(message)
		if err != nil {
			log.Printf("[WS] Failed to decode packet from %s: %v", s.subdomain, err)
			continue
		}

		if packet.Type == MsgResponse && packet.Response != nil {
			s.pendingLock.Lock()
			if ch, exists := s.pendingReqs[packet.Response.StreamID]; exists {
				ch <- packet.Response
			}
			s.pendingLock.Unlock()
		}
	}
}
