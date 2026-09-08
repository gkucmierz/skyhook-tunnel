package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"sync"
	"time"

	"github.com/quic-go/quic-go"
)

type QuicTunnelSession struct {
	conn      quic.Connection
	subdomain string
	clientIP  string
	closeOnce sync.Once
}

func NewQuicTunnelSession(conn quic.Connection, subdomain, clientIP string) *QuicTunnelSession {
	return &QuicTunnelSession{
		conn:      conn,
		subdomain: subdomain,
		clientIP:  clientIP,
	}
}

func (s *QuicTunnelSession) TransportType() string {
	return "QUIC (HTTP/3 UDP)"
}

func (s *QuicTunnelSession) ClientIP() string {
	return s.clientIP
}

func (s *QuicTunnelSession) Close() error {
	var err error
	s.closeOnce.Do(func() {
		err = s.conn.CloseWithError(0, "tunnel closed")
	})
	return err
}

func (s *QuicTunnelSession) SendRequest(req *RequestPayload) (*ResponsePayload, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()

	// In QUIC, open a new independent bi-directional stream per HTTP request!
	// This guarantees 0 Head-of-Line blocking!
	stream, err := s.conn.OpenStreamSync(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to open QUIC stream: %w", err)
	}
	defer stream.Close()

	packet := &TunnelPacket{
		Type:    MsgRequest,
		Request: req,
	}
	data, err := EncodePacket(packet)
	if err != nil {
		return nil, err
	}

	// Length-prefixed frame: 4 bytes length + payload
	lengthBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(lengthBuf, uint32(len(data)))
	if _, err := stream.Write(lengthBuf); err != nil {
		return nil, err
	}
	if _, err := stream.Write(data); err != nil {
		return nil, err
	}

	// Read response
	respLengthBuf := make([]byte, 4)
	if _, err := io.ReadFull(stream, respLengthBuf); err != nil {
		return nil, fmt.Errorf("failed to read response header from QUIC stream: %w", err)
	}
	expectedLen := binary.BigEndian.Uint32(respLengthBuf)
	respData := make([]byte, expectedLen)
	if _, err := io.ReadFull(stream, respData); err != nil {
		return nil, fmt.Errorf("failed to read response body from QUIC stream: %w", err)
	}

	resPacket, err := DecodePacket(respData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode response packet: %w", err)
	}

	if resPacket.Response == nil {
		return nil, errors.New("empty response payload from QUIC stream")
	}

	return resPacket.Response, nil
}

// StartQuicListener runs the UDP/QUIC listener on the specified port
func StartQuicListener(port int, registry *TunnelRegistry) {
	addr := fmt.Sprintf("0.0.0.0:%d", port)
	tlsConf := generateQuicTLSConfig()

	listener, err := quic.ListenAddr(addr, tlsConf, &quic.Config{
		MaxIdleTimeout:  90 * time.Second,
		KeepAlivePeriod: 25 * time.Second,
	})
	if err != nil {
		log.Printf("[QUIC] Warning: Failed to start QUIC listener on %s: %v", addr, err)
		return
	}

	log.Printf("[QUIC] 🚀 QUIC Tunnel Listener active on UDP %s", addr)

	for {
		conn, err := listener.Accept(context.Background())
		if err != nil {
			log.Printf("[QUIC] Error accepting connection: %v", err)
			continue
		}

		go handleIncomingQuicConn(conn, registry)
	}
}

func handleIncomingQuicConn(conn quic.Connection, registry *TunnelRegistry) {
	// First stream is the Control Stream
	stream, err := conn.AcceptStream(context.Background())
	if err != nil {
		conn.CloseWithError(1, "failed to accept control stream")
		return
	}

	lenBuf := make([]byte, 4)
	if _, err := io.ReadFull(stream, lenBuf); err != nil {
		conn.CloseWithError(1, "failed to read registration length")
		return
	}
	msgLen := binary.BigEndian.Uint32(lenBuf)
	msgBuf := make([]byte, msgLen)
	if _, err := io.ReadFull(stream, msgBuf); err != nil {
		conn.CloseWithError(1, "failed to read registration packet")
		return
	}

	packet, err := DecodePacket(msgBuf)
	if err != nil || packet.Type != MsgRegister || packet.Register == nil {
		conn.CloseWithError(1, "invalid registration packet")
		return
	}

	subdomain := packet.Register.Subdomain
	remoteIP, _, _ := net.SplitHostPort(conn.RemoteAddr().String())

	session := NewQuicTunnelSession(conn, subdomain, remoteIP)
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

	ackData, _ := EncodePacket(ack)
	ackLenBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(ackLenBuf, uint32(len(ackData)))
	stream.Write(ackLenBuf)
	stream.Write(ackData)

	if err != nil {
		conn.CloseWithError(1, err.Error())
		return
	}

	log.Printf("[QUIC] 🟢 Tunnel registered: %s -> %s (Client: %s)", subdomain, info.PublicURL, remoteIP)

	<-conn.Context().Done()
	registry.Unregister(subdomain)
	log.Printf("[QUIC] 🔴 Tunnel disconnected: %s", subdomain)
}

func generateQuicTLSConfig() *tls.Config {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Skyhook Tunnel Network"},
			CommonName:   "skyhook.internal",
		},
		NotBefore: time.Now(),
		NotAfter:  time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:  x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
	}
	certDER, _ := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	keyPEM := tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  key,
	}

	return &tls.Config{
		Certificates: []tls.Certificate{keyPEM},
		NextProtos:   []string{"skyhook-quic-v1"},
	}
}
