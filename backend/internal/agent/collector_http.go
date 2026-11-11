package agent

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/telemetry"
)

// CollectHttpEndpoints comprova tots els endpoints HTTP configurats validant si el codi retornat és dins `expected_status_codes` (`[200, 202]`).
func CollectHttpEndpoints(ctx context.Context, checks []server.HttpEndpointCheckConfig) []telemetry.HttpEndpointSnapshot {
	results := make([]telemetry.HttpEndpointSnapshot, 0, len(checks))
	for _, chk := range checks {
		results = append(results, checkSingleEndpoint(ctx, chk))
	}
	return results
}

func checkSingleEndpoint(ctx context.Context, chk server.HttpEndpointCheckConfig) telemetry.HttpEndpointSnapshot {
	timeoutSec := chk.TimeoutSeconds
	if timeoutSec <= 0 {
		timeoutSec = 5
	}
	client := &http.Client{
		Timeout: time.Duration(timeoutSec) * time.Second,
	}
	return checkSingleEndpointWithClient(ctx, client, chk)
}

func checkSingleEndpointWithClient(ctx context.Context, client *http.Client, chk server.HttpEndpointCheckConfig) telemetry.HttpEndpointSnapshot {
	method := strings.ToUpper(strings.TrimSpace(chk.Method))
	if method != http.MethodHead {
		method = http.MethodGet
	}

	expected := chk.ExpectedStatusCodes
	if len(expected) == 0 {
		expected = []int{200, 202}
	}

	snap := telemetry.HttpEndpointSnapshot{
		Name:                chk.Name,
		URL:                 chk.URL,
		Method:              method,
		ExpectedStatusCodes: expected,
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, method, chk.URL, nil)
	if err != nil {
		errMsg := err.Error()
		snap.ErrorMessage = &errMsg
		return snap
	}
	req.Header.Set("User-Agent", "Rawcraft-Monitor-Agent/1.0")

	resp, err := client.Do(req)
	snap.ResponseTimeMs = int(time.Since(start).Milliseconds())
	if err != nil {
		errMsg := err.Error()
		snap.ErrorMessage = &errMsg
		return snap
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
	}()

	snap.StatusCode = resp.StatusCode
	for _, code := range expected {
		if resp.StatusCode == code {
			snap.Up = true
			break
		}
	}

	if !snap.Up {
		errMsg := http.StatusText(resp.StatusCode)
		snap.ErrorMessage = &errMsg
	}

	return snap
}
