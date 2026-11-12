package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"rawcraft-monitor/backend/internal/containerlog"
	"rawcraft-monitor/backend/internal/server"
)

// DockerLogTracker manté en memòria el timestamp de l'últim registre llegit per a cada contenidor.
type DockerLogTracker struct {
	mu             sync.Mutex
	lastTimestamps map[string]time.Time
}

// NewDockerLogTracker inicialitza el rastrejador de timestamps de logs.
func NewDockerLogTracker() *DockerLogTracker {
	return &DockerLogTracker{
		lastTimestamps: make(map[string]time.Time),
	}
}

func (t *DockerLogTracker) GetLastTime(containerName string) (time.Time, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	ts, exists := t.lastTimestamps[containerName]
	return ts, exists
}

func (t *DockerLogTracker) SetLastTime(containerName string, ts time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if current, exists := t.lastTimestamps[containerName]; !exists || ts.After(current) {
		t.lastTimestamps[containerName] = ts
	}
}

// CollectContainerLogs recull incrementalment els logs dels contenidors Docker.
// Per respectar el límit GOMEMLIMIT=20MiB, es limita el nombre de línies llegides per contenidor.
func CollectContainerLogs(
	ctx context.Context,
	cfg server.DockerPillarConfig,
	tracker *DockerLogTracker,
) []containerlog.IngestLogItem {
	if !cfg.Enabled || tracker == nil {
		return nil
	}

	socketPath := cfg.SocketPath
	if socketPath == "" {
		socketPath = "/var/run/docker.sock"
	}

	client := newUnixSocketHTTPClient(socketPath, 5*time.Second)

	// 1. Obtenir contenidors actius
	listReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost/containers/json?all=false", nil)
	if err != nil {
		return nil
	}
	listResp, err := client.Do(listReq)
	if err != nil {
		return nil
	}
	defer listResp.Body.Close()

	var runningContainers []dockerContainerListItem
	if err := json.NewDecoder(listResp.Body).Decode(&runningContainers); err != nil {
		return nil
	}

	ignored := make(map[string]bool, len(cfg.IgnoreContainers))
	for _, ig := range cfg.IgnoreContainers {
		ignored[strings.TrimPrefix(strings.TrimSpace(ig), "/")] = true
	}

	required := make(map[string]bool, len(cfg.RequiredContainers))
	for _, req := range cfg.RequiredContainers {
		required[strings.TrimPrefix(strings.TrimSpace(req), "/")] = true
	}

	var allLogs []containerlog.IngestLogItem
	const maxLinesPerContainer = 300

	for _, c := range runningContainers {
		name := c.ID
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		if ignored[name] {
			continue
		}
		if len(required) > 0 && !required[name] {
			continue
		}

		lastTime, hasSeen := tracker.GetLastTime(name)

		// Construir URL de consulta
		var logURL string
		if !hasSeen {
			// Primera vegada que veiem el contenidor: recollir només les últimes 50 línies
			logURL = fmt.Sprintf("http://localhost/containers/%s/logs?stdout=true&stderr=true&timestamps=true&tail=50", c.ID)
		} else {
			// Recollida incremental: logs posteriors a l'últim timestamp registrat
			logURL = fmt.Sprintf("http://localhost/containers/%s/logs?stdout=true&stderr=true&timestamps=true&since=%d&tail=%d",
				c.ID, lastTime.Unix(), maxLinesPerContainer)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, logURL, nil)
		if err != nil {
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		lines := parseDockerLogStream(resp.Body, name, lastTime, maxLinesPerContainer)
		_ = resp.Body.Close()

		if len(lines) > 0 {
			var newest time.Time
			for _, line := range lines {
				allLogs = append(allLogs, line)
				if line.Timestamp.After(newest) {
					newest = line.Timestamp
				}
			}
			tracker.SetLastTime(name, newest)
		}
	}

	return allLogs
}

// parseDockerLogStream descodifica el format multiplexat de Docker o stream de text pla.
func parseDockerLogStream(
	r io.Reader,
	containerName string,
	cutoffTime time.Time,
	maxLines int,
) []containerlog.IngestLogItem {
	var entries []containerlog.IngestLogItem
	bufReader := bufio.NewReaderSize(r, 8192)

	for len(entries) < maxLines {
		header, err := bufReader.Peek(8)
		if err != nil {
			if err == io.EOF && len(entries) > 0 {
				break
			}
			// Si no hi ha 8 bytes o és EOF, potser és stream pla curt
			break
		}

		// Comprovar si coincideix amb la capçalera multiplexada de Docker:
		// byte 0: stream (1=stdout, 2=stderr)
		// bytes 1..3: sempre 0
		if (header[0] == 1 || header[0] == 2) && header[1] == 0 && header[2] == 0 && header[3] == 0 {
			// Descartar els 8 bytes de la capçalera de la cua del buffer
			_, _ = bufReader.Discard(8)
			frameSize := binary.BigEndian.Uint32(header[4:8])

			// Evitar payloads gegants per mantenir RAM controlada
			if frameSize > 64*1024 {
				frameSize = 64 * 1024
			}

			payload := make([]byte, frameSize)
			_, err := io.ReadFull(bufReader, payload)
			if err != nil {
				break
			}

			streamType := "stdout"
			if header[0] == 2 {
				streamType = "stderr"
			}

			item, ok := parseDockerLogPayload(containerName, streamType, payload, cutoffTime)
			if ok {
				entries = append(entries, item)
			}
		} else {
			// Contenidor amb TTY o sortida no multiplexada: llegir línia a línia
			line, err := bufReader.ReadBytes('\n')
			if len(line) > 0 {
				item, ok := parseDockerLogPayload(containerName, "stdout", line, cutoffTime)
				if ok {
					entries = append(entries, item)
				}
			}
			if err != nil {
				break
			}
		}
	}

	return entries
}

func parseDockerLogPayload(
	containerName string,
	stream string,
	payload []byte,
	cutoffTime time.Time,
) (containerlog.IngestLogItem, bool) {
	// Format amb timestamps=true: "2006-01-02T15:04:05.999999999Z log message..."
	spaceIdx := bytes.IndexByte(payload, ' ')
	if spaceIdx <= 0 {
		return containerlog.IngestLogItem{}, false
	}

	tsStr := string(payload[:spaceIdx])
	msg := strings.TrimRight(string(payload[spaceIdx+1:]), "\r\n")

	t, err := time.Parse(time.RFC3339Nano, tsStr)
	if err != nil {
		t, err = time.Parse(time.RFC3339, tsStr)
		if err != nil {
			t = time.Now().UTC()
		}
	}

	// Filtrar línies que ja havíem recollit anteriorment
	if !cutoffTime.IsZero() && (t.Before(cutoffTime) || t.Equal(cutoffTime)) {
		return containerlog.IngestLogItem{}, false
	}

	return containerlog.IngestLogItem{
		ContainerName: containerName,
		Stream:        stream,
		Timestamp:     t,
		Message:       msg,
	}, true
}
