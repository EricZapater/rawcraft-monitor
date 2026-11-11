package agent

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"rawcraft-monitor/backend/internal/alert"
	"rawcraft-monitor/backend/internal/telemetry"
)

// HysteresisPercent és el marge d'histèresi (5%) per evitar oscil·lacions entre FIRING i RESOLVED.
const HysteresisPercent = 5.0

type ruleState struct {
	consecutiveBreaches int
	firing              bool
	category            alert.AlertCategory
	severity            alert.AlertSeverity
	targetName          string
	title               string
	thresholdValue      string
}

// Evaluator manté l'estat en memòria de cada regla (per fingerprint) per aplicar finestra de sosteniment i histèresi.
type Evaluator struct {
	states map[string]*ruleState
}

func NewEvaluator() *Evaluator {
	return &Evaluator{
		states: make(map[string]*ruleState),
	}
}

// Evaluate analitza la lectura actual de les 4 potetes i retorna només les transicions d'estat (`FIRING` o `RESOLVED`).
func (e *Evaluator) Evaluate(
	cfg *Config,
	host *telemetry.HostMetricsSnapshot,
	docker *telemetry.DockerMetricsSnapshot,
	httpEndpoints []telemetry.HttpEndpointSnapshot,
	pgInstances []telemetry.PostgresInstanceSnapshot,
) []alert.AgentAlertEventRequest {
	serverUUID, _ := uuid.Parse(cfg.ServerID)
	now := time.Now()
	events := make([]alert.AgentAlertEventRequest, 0)

	sustained := cfg.Host.Thresholds.SustainedChecks
	if sustained <= 0 {
		sustained = 4
	}

	// 1. Regles de Host
	if cfg.Host.Enabled && host != nil {
		th := cfg.Host.Thresholds
		if th.MaxLoad1m != nil && *th.MaxLoad1m > 0 {
			if ev := e.evalNumericRule(
				serverUUID,
				"host:load_1m",
				alert.CategoryHost,
				alert.SeverityWarning,
				"System Load (1m)",
				"System Load elevat",
				host.Load1m,
				*th.MaxLoad1m,
				false,
				sustained,
				"%.2f",
				now,
			); ev != nil {
				events = append(events, *ev)
			}
		}

		if th.MaxMemoryPercent != nil && *th.MaxMemoryPercent > 0 {
			if ev := e.evalNumericRule(
				serverUUID,
				"host:memory_percent",
				alert.CategoryHost,
				alert.SeverityWarning,
				"Memory RAM",
				"Consum de memòria RAM per sobre del llindar",
				host.MemoryPercent,
				*th.MaxMemoryPercent,
				true,
				sustained,
				"%.1f%%",
				now,
			); ev != nil {
				events = append(events, *ev)
			}
		}

		if th.MaxSwapPercent != nil && *th.MaxSwapPercent > 0 {
			if ev := e.evalNumericRule(
				serverUUID,
				"host:swap_percent",
				alert.CategoryHost,
				alert.SeverityWarning,
				"Swap",
				"Ús de Swap per sobre del llindar",
				host.SwapPercent,
				*th.MaxSwapPercent,
				true,
				sustained,
				"%.1f%%",
				now,
			); ev != nil {
				events = append(events, *ev)
			}
		}

		if th.MaxDiskPercent != nil && *th.MaxDiskPercent > 0 {
			for _, d := range host.Disks {
				fp := fmt.Sprintf("host:disk:%s", d.MountPoint)
				if ev := e.evalNumericRule(
					serverUUID,
					fp,
					alert.CategoryHost,
					alert.SeverityCritical,
					fmt.Sprintf("Disc %s", d.MountPoint),
					fmt.Sprintf("Espai de disc a %s crític", d.MountPoint),
					d.UsedPercent,
					*th.MaxDiskPercent,
					true,
					sustained,
					"%.1f%%",
					now,
				); ev != nil {
					events = append(events, *ev)
				}
			}
		}

		if th.MaxProcesses != nil && *th.MaxProcesses > 0 {
			if ev := e.evalNumericRule(
				serverUUID,
				"host:processes",
				alert.CategoryHost,
				alert.SeverityWarning,
				"Processos",
				"Nombre de processos superior al llindar",
				float64(host.ProcessesCount),
				float64(*th.MaxProcesses),
				false,
				sustained,
				"%.0f",
				now,
			); ev != nil {
				events = append(events, *ev)
			}
		}

		if th.MaxUsersLoggedIn != nil && *th.MaxUsersLoggedIn > 0 {
			if ev := e.evalNumericRule(
				serverUUID,
				"host:users_logged_in",
				alert.CategoryHost,
				alert.SeverityWarning,
				"Usuaris connectats",
				"Nombre d'usuaris connectats superior al llindar",
				float64(host.UsersLoggedIn),
				float64(*th.MaxUsersLoggedIn),
				false,
				sustained,
				"%.0f",
				now,
			); ev != nil {
				events = append(events, *ev)
			}
		}
	}

	// 2. Regles de Docker
	if cfg.Docker.Enabled && docker != nil {
		if ev := e.evalBooleanDownRule(
			serverUUID,
			"docker:daemon",
			alert.CategoryDocker,
			alert.SeverityCritical,
			"dockerd",
			"Dimoni Docker inabastable",
			!docker.DockerDaemonUp,
			1,
			"DOWN",
			"UP",
			now,
		); ev != nil {
			events = append(events, *ev)
		}

		if docker.DockerDaemonUp {
			seenContainers := make(map[string]telemetry.DockerContainerSnapshot, len(docker.Containers))
			for _, c := range docker.Containers {
				seenContainers[c.Name] = c
				if cfg.Docker.AlertOnContainerDown {
					// Si s'han definit contenidors obligatoris (required_containers), només alertem per la caiguda
					// d'aquests contenidors. Si la llista és buida, alertem per qualsevol contenidor no exclòs.
					shouldAlertDown := true
					if len(cfg.Docker.RequiredContainers) > 0 {
						shouldAlertDown = false
						for _, reqName := range cfg.Docker.RequiredContainers {
							if c.Name == reqName || strings.TrimPrefix(c.Name, "/") == strings.TrimPrefix(reqName, "/") {
								shouldAlertDown = true
								break
							}
						}
					}

					if shouldAlertDown {
						isDown := c.State != "running" || c.Health == "unhealthy"
						curState := fmt.Sprintf("%s (%s)", c.State, c.Health)
						if ev := e.evalBooleanDownRule(
							serverUUID,
							fmt.Sprintf("docker:container:%s", c.Name),
							alert.CategoryDocker,
							alert.SeverityCritical,
							c.Name,
							fmt.Sprintf("Contenidor Docker %s caigut o unhealthy", c.Name),
							isDown,
							1,
							curState,
							"running",
							now,
						); ev != nil {
							events = append(events, *ev)
						}
					}
				}

				if c.State == "running" {
					if cfg.Docker.MaxContainerCPUPercent != nil && *cfg.Docker.MaxContainerCPUPercent > 0 {
						if ev := e.evalNumericRule(
							serverUUID,
							fmt.Sprintf("docker:cpu:%s", c.Name),
							alert.CategoryDocker,
							alert.SeverityWarning,
							c.Name,
							fmt.Sprintf("CPU elevada al contenidor %s", c.Name),
							c.CPUPercent,
							*cfg.Docker.MaxContainerCPUPercent,
							true,
							sustained,
							"%.1f%%",
							now,
						); ev != nil {
							events = append(events, *ev)
						}
					}
					if cfg.Docker.MaxContainerMemoryPercent != nil && *cfg.Docker.MaxContainerMemoryPercent > 0 {
						if ev := e.evalNumericRule(
							serverUUID,
							fmt.Sprintf("docker:mem:%s", c.Name),
							alert.CategoryDocker,
							alert.SeverityWarning,
							c.Name,
							fmt.Sprintf("Memòria elevada al contenidor %s", c.Name),
							c.MemoryPercent,
							*cfg.Docker.MaxContainerMemoryPercent,
							true,
							sustained,
							"%.1f%%",
							now,
						); ev != nil {
							events = append(events, *ev)
						}
					}
				}
			}

			// Contenidors obligatoris que ni tan sols existeixen
			for _, reqName := range cfg.Docker.RequiredContainers {
				if _, exists := seenContainers[reqName]; !exists {
					if ev := e.evalBooleanDownRule(
						serverUUID,
						fmt.Sprintf("docker:container:%s", reqName),
						alert.CategoryDocker,
						alert.SeverityCritical,
						reqName,
						fmt.Sprintf("Contenidor obligatori %s no trobat", reqName),
						true,
						1,
						"missing",
						"running",
						now,
					); ev != nil {
						events = append(events, *ev)
					}
				}
			}
		}
	}

	// 3. Regles d'Endpoints HTTP (finestra de 2 comprovacions consecutives per evitar falsos positius)
	for _, ep := range httpEndpoints {
		curVal := fmt.Sprintf("HTTP %d (%dms)", ep.StatusCode, ep.ResponseTimeMs)
		if ep.ErrorMessage != nil && *ep.ErrorMessage != "" {
			curVal = fmt.Sprintf("%s (%s)", curVal, *ep.ErrorMessage)
		}
		if ev := e.evalBooleanDownRule(
			serverUUID,
			fmt.Sprintf("http:%s", ep.Name),
			alert.CategoryHttpEndpoint,
			alert.SeverityCritical,
			ep.Name,
			fmt.Sprintf("Endpoint HTTP %s no respon amb codi esperat", ep.Name),
			!ep.Up,
			2,
			curVal,
			fmt.Sprintf("%v", ep.ExpectedStatusCodes),
			now,
		); ev != nil {
			events = append(events, *ev)
		}
	}

	// 4. Regles de PostgreSQL
	if cfg.Postgres.Enabled {
		cfgByName := make(map[string]float64)
		maxLongByName := make(map[string]int)
		for _, ic := range cfg.Postgres.Instances {
			cfgByName[ic.Name] = ic.MaxConnectionsPercent
			maxLongByName[ic.Name] = ic.MaxLongRunningQueries
		}

		for _, pg := range pgInstances {
			curDown := "DOWN"
			if pg.ErrorMessage != nil {
				curDown = *pg.ErrorMessage
			}
			if ev := e.evalBooleanDownRule(
				serverUUID,
				fmt.Sprintf("postgres:up:%s", pg.Name),
				alert.CategoryPostgres,
				alert.SeverityCritical,
				pg.Name,
				fmt.Sprintf("Instància PostgreSQL %s inabastable", pg.Name),
				!pg.Up,
				1,
				curDown,
				"UP (SELECT 1)",
				now,
			); ev != nil {
				events = append(events, *ev)
			}

			if pg.Up {
				maxConnPct := cfgByName[pg.Name]
				if maxConnPct <= 0 {
					maxConnPct = 80.0
				}
				if ev := e.evalNumericRule(
					serverUUID,
					fmt.Sprintf("postgres:conn:%s", pg.Name),
					alert.CategoryPostgres,
					alert.SeverityWarning,
					pg.Name,
					fmt.Sprintf("Ocupació de connexions PostgreSQL elevada a %s", pg.Name),
					pg.ConnectionsPercent,
					maxConnPct,
					true,
					2,
					"%.1f%%",
					now,
				); ev != nil {
					events = append(events, *ev)
				}

				maxLong := maxLongByName[pg.Name]
				if maxLong <= 0 {
					maxLong = 1
				}
				if ev := e.evalNumericRule(
					serverUUID,
					fmt.Sprintf("postgres:long_queries:%s", pg.Name),
					alert.CategoryPostgres,
					alert.SeverityWarning,
					pg.Name,
					fmt.Sprintf("Consultes encallades a PostgreSQL %s", pg.Name),
					float64(pg.LongRunningQueries),
					float64(maxLong),
					false,
					2,
					"%.0f",
					now,
				); ev != nil {
					events = append(events, *ev)
				}
			}
		}
	}

	return events
}

func (e *Evaluator) evalNumericRule(
	serverID uuid.UUID,
	fingerprint string,
	category alert.AlertCategory,
	severity alert.AlertSeverity,
	targetName string,
	title string,
	current float64,
	threshold float64,
	isPercentage bool,
	requiredSustained int,
	format string,
	now time.Time,
) *alert.AgentAlertEventRequest {
	st, ok := e.states[fingerprint]
	if !ok {
		st = &ruleState{
			category:       category,
			severity:       severity,
			targetName:     targetName,
			title:          title,
			thresholdValue: fmt.Sprintf(format, threshold),
		}
		e.states[fingerprint] = st
	}

	curStr := fmt.Sprintf(format, current)
	threshStr := fmt.Sprintf(format, threshold)

	if !st.firing {
		if current > threshold {
			st.consecutiveBreaches++
			if st.consecutiveBreaches >= requiredSustained {
				st.firing = true
				msg := fmt.Sprintf("%s: valor actual %s supera el llindar %s durant %d comprovacions consecutives.", title, curStr, threshStr, st.consecutiveBreaches)
				return &alert.AgentAlertEventRequest{
					ServerID:       serverID,
					Fingerprint:    fingerprint,
					Status:         alert.StatusFiring,
					Category:       category,
					Severity:       severity,
					TargetName:     targetName,
					Title:          title,
					Message:        msg,
					CurrentValue:   &curStr,
					ThresholdValue: &threshStr,
					OccurredAt:     now,
				}
			}
		} else {
			st.consecutiveBreaches = 0
		}
		return nil
	}

	// Quan ja està en FIRING, apliquem histèresi del 5% abans de resoldre (`HU-ALT-01`)
	recoveryThreshold := threshold * (1.0 - HysteresisPercent/100.0)
	if isPercentage {
		recoveryThreshold = threshold - HysteresisPercent
		if recoveryThreshold < 0 {
			recoveryThreshold = 0
		}
	}

	if current <= recoveryThreshold {
		st.firing = false
		st.consecutiveBreaches = 0
		resolvedTitle := fmt.Sprintf("Recuperat: %s", title)
		msg := fmt.Sprintf("%s ha tornat a la normalitat (valor actual: %s, llindar: %s).", targetName, curStr, threshStr)
		return &alert.AgentAlertEventRequest{
			ServerID:       serverID,
			Fingerprint:    fingerprint,
			Status:         alert.StatusResolved,
			Category:       category,
			Severity:       severity,
			TargetName:     targetName,
			Title:          resolvedTitle,
			Message:        msg,
			CurrentValue:   &curStr,
			ThresholdValue: &threshStr,
			OccurredAt:     now,
		}
	}

	return nil
}

func (e *Evaluator) evalBooleanDownRule(
	serverID uuid.UUID,
	fingerprint string,
	category alert.AlertCategory,
	severity alert.AlertSeverity,
	targetName string,
	title string,
	isFailing bool,
	requiredSustained int,
	currentVal string,
	expectedVal string,
	now time.Time,
) *alert.AgentAlertEventRequest {
	st, ok := e.states[fingerprint]
	if !ok {
		st = &ruleState{
			category:       category,
			severity:       severity,
			targetName:     targetName,
			title:          title,
			thresholdValue: expectedVal,
		}
		e.states[fingerprint] = st
	}

	if !st.firing {
		if isFailing {
			st.consecutiveBreaches++
			if st.consecutiveBreaches >= requiredSustained {
				st.firing = true
				msg := fmt.Sprintf("%s: estat actual '%s' (esperat: '%s').", title, currentVal, expectedVal)
				return &alert.AgentAlertEventRequest{
					ServerID:       serverID,
					Fingerprint:    fingerprint,
					Status:         alert.StatusFiring,
					Category:       category,
					Severity:       severity,
					TargetName:     targetName,
					Title:          title,
					Message:        msg,
					CurrentValue:   &currentVal,
					ThresholdValue: &expectedVal,
					OccurredAt:     now,
				}
			}
		} else {
			st.consecutiveBreaches = 0
		}
		return nil
	}

	if !isFailing {
		st.firing = false
		st.consecutiveBreaches = 0
		resolvedTitle := fmt.Sprintf("Recuperat: %s", title)
		msg := fmt.Sprintf("El recurs %s s'ha restablert correctament (estat actual: '%s').", targetName, currentVal)
		return &alert.AgentAlertEventRequest{
			ServerID:       serverID,
			Fingerprint:    fingerprint,
			Status:         alert.StatusResolved,
			Category:       category,
			Severity:       severity,
			TargetName:     targetName,
			Title:          resolvedTitle,
			Message:        msg,
			CurrentValue:   &currentVal,
			ThresholdValue: &expectedVal,
			OccurredAt:     now,
		}
	}

	return nil
}
