package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type DailyBucket struct {
	Date     string `json:"date"`
	Tunnels  int    `json:"tunnels"`
	Requests int64  `json:"requests"`
	Bytes    int64  `json:"bytes"`
}

type TelemetryData struct {
	TotalTunnelsAllTime  int64                   `json:"total_tunnels_all_time"`
	TotalRequestsAllTime int64                   `json:"total_requests_all_time"`
	TotalBytesAllTime    int64                   `json:"total_bytes_all_time"`
	DailyBuckets         map[string]*DailyBucket `json:"daily_buckets"`
}

type PeriodStats struct {
	Tunnels  int64 `json:"tunnels"`
	Requests int64 `json:"requests"`
	Bytes    int64 `json:"bytes"`
}

type TelemetrySummary struct {
	Last24h      PeriodStats   `json:"last_24h"`
	Last7d       PeriodStats   `json:"last_7d"`
	Last30d      PeriodStats   `json:"last_30d"`
	AllTime      PeriodStats   `json:"all_time"`
	DailyHistory []DailyBucket `json:"daily_history"`
}

type TelemetryStore struct {
	mu       sync.RWMutex
	filePath string
	data     TelemetryData
	dirty    bool
}

func NewTelemetryStore(filePath string) *TelemetryStore {
	if filePath == "" {
		filePath = "./telemetry.json"
	}
	s := &TelemetryStore{
		filePath: filePath,
		data: TelemetryData{
			DailyBuckets: make(map[string]*DailyBucket),
		},
	}
	s.Load()
	return s
}

func (s *TelemetryStore) Load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	bytes, err := os.ReadFile(s.filePath)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[Telemetry] ⚠️ Could not read %s: %v", s.filePath, err)
		}
		return
	}

	var data TelemetryData
	if err := json.Unmarshal(bytes, &data); err != nil {
		log.Printf("[Telemetry] ⚠️ Could not parse %s: %v", s.filePath, err)
		return
	}

	if data.DailyBuckets == nil {
		data.DailyBuckets = make(map[string]*DailyBucket)
	}
	s.data = data
	log.Printf("[Telemetry] 📊 Loaded telemetry from %s: %d all-time tunnels, %d daily buckets",
		s.filePath, s.data.TotalTunnelsAllTime, len(s.data.DailyBuckets))
}

func (s *TelemetryStore) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dir := filepath.Dir(s.filePath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Printf("[Telemetry] ⚠️ Failed to create dir %s: %v", dir, err)
			return err
		}
	}

	bytes, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}

	tmpPath := s.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, bytes, 0644); err != nil {
		return err
	}

	if err := os.Rename(tmpPath, s.filePath); err != nil {
		return err
	}

	s.dirty = false
	return nil
}

func (s *TelemetryStore) getTodayBucketLocked() *DailyBucket {
	today := time.Now().UTC().Format("2006-01-02")
	bucket, exists := s.data.DailyBuckets[today]
	if !exists {
		bucket = &DailyBucket{Date: today}
		s.data.DailyBuckets[today] = bucket
	}
	return bucket
}

func (s *TelemetryStore) RecordTunnel(transport string) {
	s.mu.Lock()
	bucket := s.getTodayBucketLocked()
	bucket.Tunnels++
	s.data.TotalTunnelsAllTime++
	s.dirty = true
	s.mu.Unlock()

	// Asynchronously save on new tunnel connection
	go func() {
		_ = s.Save()
	}()
}

func (s *TelemetryStore) RecordTraffic(requests int64, bytes int64) {
	s.mu.Lock()
	bucket := s.getTodayBucketLocked()
	bucket.Requests += requests
	bucket.Bytes += bytes
	s.data.TotalRequestsAllTime += requests
	s.data.TotalBytesAllTime += bytes
	s.dirty = true
	s.mu.Unlock()
}

func (s *TelemetryStore) StartFlusher(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			s.mu.RLock()
			dirty := s.dirty
			s.mu.RUnlock()

			if dirty {
				_ = s.Save()
			}
		}
	}()
}

func (s *TelemetryStore) GetSummary() TelemetrySummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	todayStr := now.Format("2006-01-02")

	summary := TelemetrySummary{
		AllTime: PeriodStats{
			Tunnels:  s.data.TotalTunnelsAllTime,
			Requests: s.data.TotalRequestsAllTime,
			Bytes:    s.data.TotalBytesAllTime,
		},
		DailyHistory: make([]DailyBucket, 0, 7),
	}

	// 1. Last 24h is represented by today's bucket (plus yesterday if within 24h window)
	if b, ok := s.data.DailyBuckets[todayStr]; ok {
		summary.Last24h.Tunnels += int64(b.Tunnels)
		summary.Last24h.Requests += b.Requests
		summary.Last24h.Bytes += b.Bytes
	}

	// 2. Aggregate 7 days, 30 days, and build chronological 7-day history
	// Generate date keys for the last 7 days [today - 6 ... today]
	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i).Format("2006-01-02")
		if b, ok := s.data.DailyBuckets[day]; ok {
			summary.DailyHistory = append(summary.DailyHistory, *b)
		} else {
			summary.DailyHistory = append(summary.DailyHistory, DailyBucket{
				Date:     day,
				Tunnels:  0,
				Requests: 0,
				Bytes:    0,
			})
		}
	}

	// Calculate last 7 days sum
	for i := 0; i < 7; i++ {
		day := now.AddDate(0, 0, -i).Format("2006-01-02")
		if b, ok := s.data.DailyBuckets[day]; ok {
			summary.Last7d.Tunnels += int64(b.Tunnels)
			summary.Last7d.Requests += b.Requests
			summary.Last7d.Bytes += b.Bytes
		}
	}

	// Calculate last 30 days sum
	for i := 0; i < 30; i++ {
		day := now.AddDate(0, 0, -i).Format("2006-01-02")
		if b, ok := s.data.DailyBuckets[day]; ok {
			summary.Last30d.Tunnels += int64(b.Tunnels)
			summary.Last30d.Requests += b.Requests
			summary.Last30d.Bytes += b.Bytes
		}
	}

	// Sort history chronologically just in case
	sort.Slice(summary.DailyHistory, func(i, j int) bool {
		return summary.DailyHistory[i].Date < summary.DailyHistory[j].Date
	})

	return summary
}
