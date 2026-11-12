package agent

import (
	"bytes"
	"encoding/binary"
	"testing"
	"time"
)

func TestDockerLogTracker(t *testing.T) {
	tracker := NewDockerLogTracker()

	_, exists := tracker.GetLastTime("api-backend")
	if exists {
		t.Fatalf("esperava que no existís")
	}

	now := time.Now().UTC()
	tracker.SetLastTime("api-backend", now)

	last, exists := tracker.GetLastTime("api-backend")
	if !exists || !last.Equal(now) {
		t.Fatalf("esperava %v, obtingut %v", now, last)
	}

	older := now.Add(-10 * time.Minute)
	tracker.SetLastTime("api-backend", older)
	last2, _ := tracker.GetLastTime("api-backend")
	if !last2.Equal(now) {
		t.Fatalf("no s'hauria de sobreescriure amb un timestamp més antic")
	}
}

func TestParseDockerLogStream_Multiplexed(t *testing.T) {
	var buf bytes.Buffer

	// Missatge 1: stdout, timestamp format RFC3339Nano
	t1 := time.Date(2026, 11, 12, 10, 0, 0, 0, time.UTC)
	payload1 := []byte(t1.Format(time.RFC3339Nano) + " GET /api/health HTTP/1.1 200 OK\n")
	hdr1 := make([]byte, 8)
	hdr1[0] = 1 // stdout
	binary.BigEndian.PutUint32(hdr1[4:8], uint32(len(payload1)))
	buf.Write(hdr1)
	buf.Write(payload1)

	// Missatge 2: stderr
	t2 := time.Date(2026, 11, 12, 10, 0, 1, 0, time.UTC)
	payload2 := []byte(t2.Format(time.RFC3339Nano) + " [WARN] Connection pool saturated\n")
	hdr2 := make([]byte, 8)
	hdr2[0] = 2 // stderr
	binary.BigEndian.PutUint32(hdr2[4:8], uint32(len(payload2)))
	buf.Write(hdr2)
	buf.Write(payload2)

	entries := parseDockerLogStream(&buf, "backend", time.Time{}, 10)
	if len(entries) != 2 {
		t.Fatalf("esperava 2 entrades, obtingudes %d", len(entries))
	}

	if entries[0].Stream != "stdout" || entries[0].Message != "GET /api/health HTTP/1.1 200 OK" {
		t.Errorf("primera entrada incorrecta: %+v", entries[0])
	}
	if entries[1].Stream != "stderr" || entries[1].Message != "[WARN] Connection pool saturated" {
		t.Errorf("segona entrada incorrecta: %+v", entries[1])
	}

	// Comprovar filtre de cutoff
	buf.Reset()
	buf.Write(hdr1)
	buf.Write(payload1)
	buf.Write(hdr2)
	buf.Write(payload2)

	// cutoff = t1 -> només hauria de retornar t2
	filtered := parseDockerLogStream(&buf, "backend", t1, 10)
	if len(filtered) != 1 {
		t.Fatalf("esperava 1 entrada filtrada, obtingudes %d", len(filtered))
	}
	if !filtered[0].Timestamp.Equal(t2) {
		t.Errorf("esperava t2, obtingut %v", filtered[0].Timestamp)
	}
}

func TestParseDockerLogStream_PlainText(t *testing.T) {
	var buf bytes.Buffer
	t1 := time.Date(2026, 11, 12, 10, 5, 0, 0, time.UTC)
	buf.WriteString(t1.Format(time.RFC3339Nano) + " Starting server on port 8080\n")

	entries := parseDockerLogStream(&buf, "frontend", time.Time{}, 10)
	if len(entries) != 1 {
		t.Fatalf("esperava 1 entrada de text pla, obtingudes %d", len(entries))
	}
	if entries[0].Message != "Starting server on port 8080" {
		t.Errorf("missatge inesperat: %s", entries[0].Message)
	}
}
