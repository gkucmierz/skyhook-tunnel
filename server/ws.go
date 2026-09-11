package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
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
	pendingReqs map[string]chan *TunnelPacket
	wsLock      sync.RWMutex
	wsStreams   map[string]chan *WsMessagePayload
	wsCloses    map[string]chan struct{}
	writeLock   sync.Mutex
	closeOnce   sync.Once
	closed      chan struct{}
}

func NewWsTunnelSession(conn *websocket.Conn, subdomain, clientIP string) *WsTunnelSession {
	return &WsTunnelSession{
		conn:        conn,
		subdomain:   subdomain,
		clientIP:    clientIP,
		pendingReqs: make(map[string]chan *TunnelPacket),
		wsStreams:   make(map[string]chan *WsMessagePayload),
		wsCloses:    make(map[string]chan struct{}),
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
		if s.conn != nil {
			err = s.conn.Close()
		}
		s.writeLock.Unlock()

		s.pendingLock.Lock()
		for _, ch := range s.pendingReqs {
			close(ch)
		}
		s.pendingReqs = make(map[string]chan *TunnelPacket)
		s.pendingLock.Unlock()

		s.wsLock.Lock()
		for _, ch := range s.wsCloses {
			select {
			case ch <- struct{}{}:
			default:
			}
		}
		s.wsStreams = make(map[string]chan *WsMessagePayload)
		s.wsCloses = make(map[string]chan struct{})
		s.wsLock.Unlock()
	})
	return err
}

func (s *WsTunnelSession) SendRequest(req *RequestPayload) (*ResponsePayload, error) {
	select {
	case <-s.closed:
		return nil, errors.New("tunnel connection is closed")
	default:
	}

	packetChan := make(chan *TunnelPacket, 8)

	s.pendingLock.Lock()
	s.pendingReqs[req.StreamID] = packetChan
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

	if err := s.SendPacket(packet); err != nil {
		return nil, err
	}

	select {
	case pkt, ok := <-packetChan:
		if !ok || pkt == nil {
			return nil, errors.New("tunnel closed while waiting for response")
		}
		if pkt.Type == MsgResponse && pkt.Response != nil {
			return pkt.Response, nil
		}
		return nil, fmt.Errorf("unexpected packet type %s", pkt.Type)
	case <-time.After(35 * time.Second):
		return nil, errors.New("gateway timeout waiting for response from local tunnel client")
	case <-s.closed:
		return nil, errors.New("tunnel disconnected during request")
	}
}

func (s *WsTunnelSession) ForwardHttp(w http.ResponseWriter, r *http.Request, req *RequestPayload) error {
	select {
	case <-s.closed:
		return errors.New("tunnel connection is closed")
	default:
	}

	packetChan := make(chan *TunnelPacket, 64)

	s.pendingLock.Lock()
	s.pendingReqs[req.StreamID] = packetChan
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

	if err := s.SendPacket(packet); err != nil {
		return fmt.Errorf("failed to send packet over websocket: %w", err)
	}

	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}

	flusher, _ := w.(http.Flusher)

	// Wait for initial packet (either standard RESPONSE or STREAM_START)
	select {
	case <-time.After(35 * time.Second):
		return errors.New("gateway timeout waiting for response from local tunnel client")
	case <-s.closed:
		return errors.New("tunnel disconnected during request")
	case pkt, ok := <-packetChan:
		if !ok || pkt == nil {
			return errors.New("tunnel closed while waiting for response")
		}

		// Case A: Standard single-shot HTTP response
		if pkt.Type == MsgResponse && pkt.Response != nil {
			res := pkt.Response
			for k, vv := range res.Headers {
				for _, v := range vv {
					v = rewriteResponseHeader(k, v, r.Host, scheme)
					w.Header().Add(k, v)
				}
			}
			w.WriteHeader(res.StatusCode)
			if res.IsBase64 {
				decoded, _ := base64.StdEncoding.DecodeString(res.Body)
				w.Write(decoded)
			} else {
				w.Write([]byte(res.Body))
			}
			return nil
		}

		// Case B: Streaming response (SSE, chunked stream, or large file download)
		if pkt.Type == MsgStreamStart && pkt.StreamStart != nil {
			start := pkt.StreamStart
			for k, vv := range start.Headers {
				for _, v := range vv {
					v = rewriteResponseHeader(k, v, r.Host, scheme)
					w.Header().Add(k, v)
				}
			}
			ct := strings.ToLower(strings.Join(start.Headers["Content-Type"], ""))
			if strings.Contains(ct, "text/event-stream") && w.Header().Get("X-Accel-Buffering") == "" {
				w.Header().Set("X-Accel-Buffering", "no")
			}
			w.WriteHeader(start.StatusCode)
			if flusher != nil {
				flusher.Flush()
			}

			// Stream subsequent chunks until STREAM_END
			for {
				select {
				case <-r.Context().Done():
					s.SendPacket(&TunnelPacket{
						Type: MsgStreamAbort,
						StreamAbort: &StreamAbortPayload{
							StreamID: req.StreamID,
						},
					})
					return nil
				case <-s.closed:
					return errors.New("tunnel disconnected during stream")
				case chunkPkt, ok := <-packetChan:
					if !ok || chunkPkt == nil {
						return nil
					}
					if chunkPkt.Type == MsgStreamChunk && chunkPkt.StreamChunk != nil {
						var chunkData []byte
						if chunkPkt.StreamChunk.IsBinary {
							chunkData, _ = base64.StdEncoding.DecodeString(chunkPkt.StreamChunk.Data)
						} else {
							chunkData = []byte(chunkPkt.StreamChunk.Data)
						}
						w.Write(chunkData)
						if flusher != nil {
							flusher.Flush()
						}
					} else if chunkPkt.Type == MsgStreamEnd {
						return nil
					}
				}
			}
		}

		return fmt.Errorf("unexpected packet type %s", pkt.Type)

	case <-time.After(35 * time.Second):
		return errors.New("gateway timeout waiting for response from local tunnel client")
	case <-s.closed:
		return errors.New("tunnel disconnected during request")
	case <-r.Context().Done():
		s.SendPacket(&TunnelPacket{
			Type: MsgStreamAbort,
			StreamAbort: &StreamAbortPayload{
				StreamID: req.StreamID,
			},
		})
		return r.Context().Err()
	}
}

func (s *WsTunnelSession) SendPacket(packet *TunnelPacket) error {
	select {
	case <-s.closed:
		return errors.New("tunnel connection is closed")
	default:
	}

	data, err := EncodePacket(packet)
	if err != nil {
		return err
	}

	s.writeLock.Lock()
	defer s.writeLock.Unlock()
	if s.conn == nil {
		return nil
	}
	return s.conn.WriteMessage(websocket.TextMessage, data)
}

func (s *WsTunnelSession) RegisterWsStream(streamID string) (chan *WsMessagePayload, chan struct{}, func()) {
	msgChan := make(chan *WsMessagePayload, 64)
	closeChan := make(chan struct{}, 1)

	s.wsLock.Lock()
	s.wsStreams[streamID] = msgChan
	s.wsCloses[streamID] = closeChan
	s.wsLock.Unlock()

	cleanup := func() {
		s.wsLock.Lock()
		delete(s.wsStreams, streamID)
		delete(s.wsCloses, streamID)
		s.wsLock.Unlock()
	}

	return msgChan, closeChan, cleanup
}

func (s *WsTunnelSession) DispatchWsMessage(msg *WsMessagePayload) {
	s.wsLock.RLock()
	ch, exists := s.wsStreams[msg.StreamID]
	s.wsLock.RUnlock()
	if exists {
		select {
		case ch <- msg:
		default:
			// Non-blocking drop if consumer buffer is full
		}
	}
}

func (s *WsTunnelSession) DispatchWsClose(closePayload *WsClosePayload) {
	s.wsLock.RLock()
	ch, exists := s.wsCloses[closePayload.StreamID]
	s.wsLock.RUnlock()
	if exists {
		select {
		case ch <- struct{}{}:
		default:
		}
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

		if (packet.Type == MsgResponse && packet.Response != nil) ||
			(packet.Type == MsgStreamStart && packet.StreamStart != nil) ||
			(packet.Type == MsgStreamChunk && packet.StreamChunk != nil) ||
			(packet.Type == MsgStreamEnd && packet.StreamEnd != nil) {
			streamID := ""
			if packet.Response != nil {
				streamID = packet.Response.StreamID
			} else if packet.StreamStart != nil {
				streamID = packet.StreamStart.StreamID
			} else if packet.StreamChunk != nil {
				streamID = packet.StreamChunk.StreamID
			} else if packet.StreamEnd != nil {
				streamID = packet.StreamEnd.StreamID
			}

			s.pendingLock.Lock()
			if ch, exists := s.pendingReqs[streamID]; exists {
				select {
				case ch <- packet:
				default:
				}
			}
			s.pendingLock.Unlock()
		} else if packet.Type == MsgWsMessage && packet.WsMessage != nil {
			s.DispatchWsMessage(packet.WsMessage)
		} else if packet.Type == MsgWsClose && packet.WsClose != nil {
			s.DispatchWsClose(packet.WsClose)
		}
	}
}
