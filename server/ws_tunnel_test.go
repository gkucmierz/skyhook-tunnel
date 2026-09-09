package main

import (
	"net/http"
	"testing"
)

func TestWsProtocolPackets(t *testing.T) {
	// 1. Test WsOpen packet
	openPacket := &TunnelPacket{
		Type: MsgWsOpen,
		WsOpen: &WsOpenPayload{
			StreamID: "ws-test-1",
			URL:      "/ws",
			Headers: map[string][]string{
				"User-Agent": {"TestAgent/1.0"},
			},
			Protocol: "chat,superchat",
		},
	}

	data, err := EncodePacket(openPacket)
	if err != nil {
		t.Fatalf("failed to encode WsOpen packet: %v", err)
	}

	decoded, err := DecodePacket(data)
	if err != nil {
		t.Fatalf("failed to decode WsOpen packet: %v", err)
	}

	if decoded.Type != MsgWsOpen {
		t.Errorf("expected type %s, got %s", MsgWsOpen, decoded.Type)
	}
	if decoded.WsOpen == nil || decoded.WsOpen.StreamID != "ws-test-1" {
		t.Errorf("expected stream_id ws-test-1, got %+v", decoded.WsOpen)
	}
	if decoded.WsOpen.Protocol != "chat,superchat" {
		t.Errorf("expected protocol chat,superchat, got %s", decoded.WsOpen.Protocol)
	}

	// 2. Test WsMessage packet
	msgPacket := &TunnelPacket{
		Type: MsgWsMessage,
		WsMessage: &WsMessagePayload{
			StreamID: "ws-test-1",
			Data:     "hello world",
			IsBinary: false,
		},
	}

	msgData, err := EncodePacket(msgPacket)
	if err != nil {
		t.Fatalf("failed to encode WsMessage packet: %v", err)
	}

	decodedMsg, err := DecodePacket(msgData)
	if err != nil {
		t.Fatalf("failed to decode WsMessage packet: %v", err)
	}

	if decodedMsg.Type != MsgWsMessage || decodedMsg.WsMessage == nil {
		t.Fatalf("expected MsgWsMessage with payload, got %+v", decodedMsg)
	}
	if decodedMsg.WsMessage.Data != "hello world" || decodedMsg.WsMessage.IsBinary {
		t.Errorf("unexpected WsMessage payload: %+v", decodedMsg.WsMessage)
	}

	// 3. Test WsClose packet
	closePacket := &TunnelPacket{
		Type: MsgWsClose,
		WsClose: &WsClosePayload{
			StreamID: "ws-test-1",
			Code:     1000,
			Reason:   "normal closure",
		},
	}

	closeData, err := EncodePacket(closePacket)
	if err != nil {
		t.Fatalf("failed to encode WsClose packet: %v", err)
	}

	decodedClose, err := DecodePacket(closeData)
	if err != nil {
		t.Fatalf("failed to decode WsClose packet: %v", err)
	}

	if decodedClose.Type != MsgWsClose || decodedClose.WsClose == nil {
		t.Fatalf("expected MsgWsClose with payload, got %+v", decodedClose)
	}
	if decodedClose.WsClose.Code != 1000 || decodedClose.WsClose.Reason != "normal closure" {
		t.Errorf("unexpected WsClose payload: %+v", decodedClose.WsClose)
	}

	// 4. Test Stream packets (SSE / chunked)
	streamStart := &TunnelPacket{
		Type: MsgStreamStart,
		StreamStart: &StreamStartPayload{
			StreamID:   "stream-99",
			StatusCode: 200,
			Headers: map[string][]string{
				"Content-Type": {"text/event-stream"},
			},
		},
	}
	startData, err := EncodePacket(streamStart)
	if err != nil {
		t.Fatalf("failed to encode StreamStart packet: %v", err)
	}
	decodedStart, err := DecodePacket(startData)
	if err != nil || decodedStart.Type != MsgStreamStart || decodedStart.StreamStart == nil {
		t.Fatalf("failed to decode StreamStart packet: %+v", decodedStart)
	}
	if decodedStart.StreamStart.StreamID != "stream-99" || decodedStart.StreamStart.StatusCode != 200 {
		t.Errorf("unexpected StreamStart payload: %+v", decodedStart.StreamStart)
	}

	streamChunk := &TunnelPacket{
		Type: MsgStreamChunk,
		StreamChunk: &StreamChunkPayload{
			StreamID: "stream-99",
			Data:     "data: chunk-1\n\n",
			IsBinary: false,
		},
	}
	chunkData, err := EncodePacket(streamChunk)
	if err != nil {
		t.Fatalf("failed to encode StreamChunk packet: %v", err)
	}
	decodedChunk, err := DecodePacket(chunkData)
	if err != nil || decodedChunk.Type != MsgStreamChunk || decodedChunk.StreamChunk == nil {
		t.Fatalf("failed to decode StreamChunk packet: %+v", decodedChunk)
	}
	if decodedChunk.StreamChunk.Data != "data: chunk-1\n\n" {
		t.Errorf("unexpected StreamChunk payload: %+v", decodedChunk.StreamChunk)
	}

	streamEnd := &TunnelPacket{
		Type: MsgStreamEnd,
		StreamEnd: &StreamEndPayload{
			StreamID: "stream-99",
		},
	}
	endData, err := EncodePacket(streamEnd)
	if err != nil {
		t.Fatalf("failed to encode StreamEnd packet: %v", err)
	}
	decodedEnd, err := DecodePacket(endData)
	if err != nil || decodedEnd.Type != MsgStreamEnd || decodedEnd.StreamEnd == nil {
		t.Fatalf("failed to decode StreamEnd packet: %+v", decodedEnd)
	}
}

type mockTunnelSession struct {
	sentPackets []*TunnelPacket
	msgChan     chan *WsMessagePayload
	closeChan   chan struct{}
}

func (m *mockTunnelSession) SendRequest(req *RequestPayload) (*ResponsePayload, error) {
	return nil, nil
}

func (m *mockTunnelSession) ForwardHttp(w http.ResponseWriter, r *http.Request, req *RequestPayload) error {
	return nil
}

func (m *mockTunnelSession) SendPacket(p *TunnelPacket) error {
	m.sentPackets = append(m.sentPackets, p)
	return nil
}

func (m *mockTunnelSession) RegisterWsStream(streamID string) (chan *WsMessagePayload, chan struct{}, func()) {
	m.msgChan = make(chan *WsMessagePayload, 10)
	m.closeChan = make(chan struct{}, 1)
	return m.msgChan, m.closeChan, func() {}
}

func (m *mockTunnelSession) DispatchWsMessage(msg *WsMessagePayload) {
	if m.msgChan != nil {
		m.msgChan <- msg
	}
}

func (m *mockTunnelSession) DispatchWsClose(closePayload *WsClosePayload) {
	if m.closeChan != nil {
		m.closeChan <- struct{}{}
	}
}

func (m *mockTunnelSession) Close() error {
	return nil
}

func (m *mockTunnelSession) TransportType() string {
	return "Mock"
}

func (m *mockTunnelSession) ClientIP() string {
	return "127.0.0.1"
}

func TestRegistryForwardWsOpen(t *testing.T) {
	reg := NewTunnelRegistry("localhost", nil)
	session := &mockTunnelSession{}

	_, err := reg.Register("rapid-island", session)
	if err != nil {
		t.Fatalf("failed to register tunnel: %v", err)
	}

	openPayload := &WsOpenPayload{
		StreamID: "ws-stream-123",
		URL:      "/ws",
		Protocol: "",
	}

	sess, msgChan, closeChan, cleanup, err := reg.ForwardWsOpen("rapid-island", openPayload)
	if err != nil {
		t.Fatalf("ForwardWsOpen failed: %v", err)
	}
	defer cleanup()

	if sess == nil || msgChan == nil || closeChan == nil {
		t.Fatalf("expected non-nil session and channels")
	}

	if len(session.sentPackets) != 1 {
		t.Fatalf("expected 1 packet sent, got %d", len(session.sentPackets))
	}

	sent := session.sentPackets[0]
	if sent.Type != MsgWsOpen || sent.WsOpen == nil || sent.WsOpen.StreamID != "ws-stream-123" {
		t.Errorf("unexpected packet sent: %+v", sent)
	}
}

func TestRewriteLocationHeader(t *testing.T) {
	tests := []struct {
		input    string
		host     string
		scheme   string
		expected string
	}{
		{
			input:    "http://127.0.0.1:3000/dashboard",
			host:     "rapid-island.localhost:17356",
			scheme:   "http",
			expected: "http://rapid-island.localhost:17356/dashboard",
		},
		{
			input:    "http://localhost:8080/auth/callback?code=xyz",
			host:     "cool-star.skyhook.7u.pl",
			scheme:   "https",
			expected: "https://cool-star.skyhook.7u.pl/auth/callback?code=xyz",
		},
		{
			input:    "http://0.0.0.0:4000/",
			host:     "my-app.localhost:17356",
			scheme:   "http",
			expected: "http://my-app.localhost:17356/",
		},
		{
			input:    "https://accounts.google.com/o/oauth2/auth",
			host:     "rapid-island.localhost:17356",
			scheme:   "http",
			expected: "https://accounts.google.com/o/oauth2/auth", // external unchanged
		},
		{
			input:    "/login",
			host:     "rapid-island.localhost:17356",
			scheme:   "http",
			expected: "/login", // relative unchanged
		},
	}

	for _, tc := range tests {
		actual := rewriteLocationHeader(tc.input, tc.host, tc.scheme)
		if actual != tc.expected {
			t.Errorf("rewriteLocationHeader(%q) = %q; want %q", tc.input, actual, tc.expected)
		}
	}
}
