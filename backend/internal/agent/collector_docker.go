package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/telemetry"
)

type dockerContainerListItem struct {
	ID     string   `json:"Id"`
	Names  []string `json:"Names"`
	Image  string   `json:"Image"`
	State  string   `json:"State"`
	Status string   `json:"Status"`
}

type dockerStatsPayload struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint64 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

func newUnixSocketHTTPClient(socketPath string, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DisableKeepAlives: true,
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		},
	}
}

// CollectDockerMetrics consulta el socket `/var/run/docker.sock` amb un worker pool màxim de 3 goroutines per a `stats`.
func CollectDockerMetrics(ctx context.Context, cfg server.DockerPillarConfig) *telemetry.DockerMetricsSnapshot {
	if !cfg.Enabled {
		return nil
	}

	socketPath := cfg.SocketPath
	if socketPath == "" {
		socketPath = "/var/run/docker.sock"
	}

	client := newUnixSocketHTTPClient(socketPath, 5*time.Second)

	// 1. Comprovar `/_ping`
	pingReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost/_ping", nil)
	if err != nil {
		return &telemetry.DockerMetricsSnapshot{DockerDaemonUp: false, Containers: []telemetry.DockerContainerSnapshot{}}
	}
	pingResp, err := client.Do(pingReq)
	if err != nil {
		return &telemetry.DockerMetricsSnapshot{DockerDaemonUp: false, Containers: []telemetry.DockerContainerSnapshot{}}
	}
	_ = pingResp.Body.Close()
	if pingResp.StatusCode != http.StatusOK {
		return &telemetry.DockerMetricsSnapshot{DockerDaemonUp: false, Containers: []telemetry.DockerContainerSnapshot{}}
	}

	// 2. Llistar tots els contenidors (`/containers/json?all=true`)
	listReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost/containers/json?all=true", nil)
	if err != nil {
		return &telemetry.DockerMetricsSnapshot{DockerDaemonUp: true, Containers: []telemetry.DockerContainerSnapshot{}}
	}
	listResp, err := client.Do(listReq)
	if err != nil {
		return &telemetry.DockerMetricsSnapshot{DockerDaemonUp: false, Containers: []telemetry.DockerContainerSnapshot{}}
	}
	defer listResp.Body.Close()

	var rawContainers []dockerContainerListItem
	if err := json.NewDecoder(listResp.Body).Decode(&rawContainers); err != nil {
		return &telemetry.DockerMetricsSnapshot{DockerDaemonUp: true, Containers: []telemetry.DockerContainerSnapshot{}}
	}

	ignored := make(map[string]bool, len(cfg.IgnoreContainers))
	for _, ig := range cfg.IgnoreContainers {
		ignored[strings.TrimPrefix(strings.TrimSpace(ig), "/")] = true
	}

	snapshots := make([]telemetry.DockerContainerSnapshot, 0, len(rawContainers))
	for _, rc := range rawContainers {
		name := rc.ID
		if len(rc.Names) > 0 {
			name = strings.TrimPrefix(rc.Names[0], "/")
		}
		if ignored[name] {
			continue
		}

		shortID := rc.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}

		health := parseDockerHealthFromStatus(rc.Status)
		state := normalizeDockerState(rc.State)

		snapshots = append(snapshots, telemetry.DockerContainerSnapshot{
			ContainerID: shortID,
			Name:        name,
			Image:       rc.Image,
			State:       state,
			Status:      rc.Status,
			Health:      health,
			ExitCode:    0,
		})
	}

	// 3. Recollir CPU/RAM per als contenidors `running` amb un worker pool de màxim 3 goroutines (GOMEMLIMIT=20MiB)
	if cfg.CollectContainerStats && len(snapshots) > 0 {
		const maxWorkers = 3
		jobs := make(chan int, len(snapshots))
		var wg sync.WaitGroup

		workerCount := maxWorkers
		if len(snapshots) < workerCount {
			workerCount = len(snapshots)
		}

		for w := 0; w < workerCount; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for idx := range jobs {
					c := &snapshots[idx]
					if c.State != "running" {
						continue
					}
					cpuPct, memUsedMB, memLimMB, memPct := fetchContainerStats(ctx, client, c.ContainerID)
					c.CPUPercent = round2(cpuPct)
					c.MemoryUsedMB = round2(memUsedMB)
					c.MemoryLimitMB = round2(memLimMB)
					c.MemoryPercent = round2(memPct)
				}
			}()
		}

		for i := range snapshots {
			jobs <- i
		}
		close(jobs)
		wg.Wait()
	}

	return &telemetry.DockerMetricsSnapshot{
		DockerDaemonUp: true,
		Containers:     snapshots,
	}
}

func fetchContainerStats(ctx context.Context, client *http.Client, containerID string) (cpuPct, memUsedMB, memLimitMB, memPct float64) {
	url := fmt.Sprintf("http://localhost/containers/%s/stats?stream=false", containerID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, 0, 0
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, 0, 0, 0
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, 0, 0
	}

	var st dockerStatsPayload
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		return 0, 0, 0, 0
	}

	cpuDelta := float64(st.CPUStats.CPUUsage.TotalUsage) - float64(st.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(st.CPUStats.SystemCPUUsage) - float64(st.PreCPUStats.SystemCPUUsage)
	onlineCPUs := float64(st.CPUStats.OnlineCPUs)
	if onlineCPUs <= 0 {
		onlineCPUs = 1
	}
	if sysDelta > 0 && cpuDelta > 0 {
		cpuPct = (cpuDelta / sysDelta) * onlineCPUs * 100.0
	}

	usedBytes := float64(st.MemoryStats.Usage)
	if inactiveFile, ok := st.MemoryStats.Stats["inactive_file"]; ok && usedBytes > float64(inactiveFile) {
		usedBytes -= float64(inactiveFile)
	}
	limitBytes := float64(st.MemoryStats.Limit)

	const mb = 1024.0 * 1024.0
	memUsedMB = usedBytes / mb
	memLimitMB = limitBytes / mb
	if limitBytes > 0 {
		memPct = (usedBytes / limitBytes) * 100.0
	}
	return
}

func parseDockerHealthFromStatus(status string) string {
	lower := strings.ToLower(status)
	switch {
	case strings.Contains(lower, "(unhealthy)"):
		return "unhealthy"
	case strings.Contains(lower, "(healthy)"):
		return "healthy"
	case strings.Contains(lower, "(health: starting)"):
		return "starting"
	default:
		return "none"
	}
}

func normalizeDockerState(state string) string {
	switch strings.ToLower(strings.TrimSpace(state)) {
	case "running", "exited", "restarting", "paused", "dead", "created":
		return strings.ToLower(strings.TrimSpace(state))
	default:
		return "exited"
	}
}
