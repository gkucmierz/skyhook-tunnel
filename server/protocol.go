package main

import (
	"encoding/json"
)

// MessageType indicates the kind of packet transferred through the tunnel
type MessageType string

const (
	MsgRegister    MessageType = "REGISTER"
	MsgRegisterAck MessageType = "REGISTER_ACK"
	MsgRequest     MessageType = "REQUEST"
	MsgResponse    MessageType = "RESPONSE"
	MsgPing        MessageType = "PING"
	MsgPong        MessageType = "PONG"
	MsgWsOpen      MessageType = "WS_OPEN"
	MsgWsMessage   MessageType = "WS_MESSAGE"
	MsgWsClose     MessageType = "WS_CLOSE"
	MsgStreamStart MessageType = "STREAM_START"
	MsgStreamChunk MessageType = "STREAM_CHUNK"
	MsgStreamEnd   MessageType = "STREAM_END"
	MsgStreamAbort MessageType = "STREAM_ABORT"
)

// TunnelPacket wraps all payload communications
type TunnelPacket struct {
	Type        MessageType         `json:"type"`
	Register    *RegisterPayload    `json:"register,omitempty"`
	Ack         *AckPayload         `json:"ack,omitempty"`
	Request     *RequestPayload     `json:"request,omitempty"`
	Response    *ResponsePayload    `json:"response,omitempty"`
	WsOpen      *WsOpenPayload      `json:"ws_open,omitempty"`
	WsMessage   *WsMessagePayload   `json:"ws_message,omitempty"`
	WsClose     *WsClosePayload     `json:"ws_close,omitempty"`
	StreamStart *StreamStartPayload `json:"stream_start,omitempty"`
	StreamChunk *StreamChunkPayload `json:"stream_chunk,omitempty"`
	StreamEnd   *StreamEndPayload   `json:"stream_end,omitempty"`
	StreamAbort *StreamAbortPayload `json:"stream_abort,omitempty"`
}

type RegisterPayload struct {
	Subdomain string `json:"subdomain"`
	Token     string `json:"token"`
	Client    string `json:"client"`
}

type AckPayload struct {
	Success   bool   `json:"success"`
	Subdomain string `json:"subdomain"`
	URL       string `json:"url"`
	Error     string `json:"error,omitempty"`
}

type RequestPayload struct {
	StreamID string              `json:"stream_id"`
	Method   string              `json:"method"`
	URL      string              `json:"url"`
	Headers  map[string][]string `json:"headers"`
	Body     string              `json:"body,omitempty"` // base64 encoded if binary
	IsBase64 bool                `json:"is_base64"`
}

type ResponsePayload struct {
	StreamID   string              `json:"stream_id"`
	StatusCode int                 `json:"status_code"`
	Headers    map[string][]string `json:"headers"`
	Body       string              `json:"body,omitempty"` // base64 encoded if binary
	IsBase64   bool                `json:"is_base64"`
}

type WsOpenPayload struct {
	StreamID string              `json:"stream_id"`
	URL      string              `json:"url"`
	Headers  map[string][]string `json:"headers"`
	Protocol string              `json:"protocol,omitempty"`
}

type WsMessagePayload struct {
	StreamID string `json:"stream_id"`
	Data     string `json:"data"` // string or base64 encoded binary
	IsBinary bool   `json:"is_binary"`
}

type WsClosePayload struct {
	StreamID string `json:"stream_id"`
	Code     int    `json:"code,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

type StreamStartPayload struct {
	StreamID   string              `json:"stream_id"`
	StatusCode int                 `json:"status_code"`
	Headers    map[string][]string `json:"headers"`
}

type StreamChunkPayload struct {
	StreamID string `json:"stream_id"`
	Data     string `json:"data"` // string or base64 encoded binary
	IsBinary bool   `json:"is_binary"`
}

type StreamEndPayload struct {
	StreamID string `json:"stream_id"`
	Error    string `json:"error,omitempty"`
}

type StreamAbortPayload struct {
	StreamID string `json:"stream_id"`
}


func EncodePacket(p *TunnelPacket) ([]byte, error) {
	return json.Marshal(p)
}

func DecodePacket(data []byte) (*TunnelPacket, error) {
	var p TunnelPacket
	err := json.Unmarshal(data, &p)
	return &p, err
}
