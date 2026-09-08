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
)

// TunnelPacket wraps all payload communications
type TunnelPacket struct {
	Type     MessageType      `json:"type"`
	Register *RegisterPayload `json:"register,omitempty"`
	Ack      *AckPayload      `json:"ack,omitempty"`
	Request  *RequestPayload  `json:"request,omitempty"`
	Response *ResponsePayload `json:"response,omitempty"`
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

func EncodePacket(p *TunnelPacket) ([]byte, error) {
	return json.Marshal(p)
}

func DecodePacket(data []byte) (*TunnelPacket, error) {
	var p TunnelPacket
	err := json.Unmarshal(data, &p)
	return &p, err
}
