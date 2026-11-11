package agent

import (
	"bufio"
	"math"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"rawcraft-monitor/backend/internal/server"
	"rawcraft-monitor/backend/internal/telemetry"
)

// CollectHostMetrics recull les mètriques del sistema operatiu i maquinari Linux sense dependències externes.
func CollectHostMetrics(cfg server.HostPillarConfig) *telemetry.HostMetricsSnapshot {
	if !cfg.Enabled {
		return nil
	}

	snap := &telemetry.HostMetricsSnapshot{
		Arch:  runtime.GOARCH,
		Disks: []telemetry.DiskMountUsage{},
	}

	if h, err := os.Hostname(); err == nil {
		snap.Hostname = h
	}

	if cfg.CollectOSInfo {
		snap.OSName = readOSRelease()
		snap.KernelVersion = readKernelVersion()
		snap.UptimeSeconds = readUptimeSeconds()
	}

	if cfg.CollectRebootRequired {
		_, err := os.Stat("/var/run/reboot-required")
		snap.RebootRequired = err == nil
	}

	if cfg.CollectLoad {
		snap.Load1m, snap.Load5m, snap.Load15m = readLoadAvg()
	}

	if cfg.CollectMemory || cfg.CollectSwap {
		memTotal, memUsed, memPct, swapTotal, swapUsed, swapPct := readMemInfo()
		if cfg.CollectMemory {
			snap.MemoryTotalMB = round2(memTotal)
			snap.MemoryUsedMB = round2(memUsed)
			snap.MemoryPercent = round2(memPct)
		}
		if cfg.CollectSwap {
			snap.SwapTotalMB = round2(swapTotal)
			snap.SwapUsedMB = round2(swapUsed)
			snap.SwapPercent = round2(swapPct)
		}
	}

	if cfg.CollectDisk {
		mounts := cfg.MountPoints
		if len(mounts) == 0 {
			mounts = []string{"/"}
		}
		for _, mp := range mounts {
			if usage, ok := readDiskUsage(mp); ok {
				snap.Disks = append(snap.Disks, usage)
			}
		}
	}

	if cfg.CollectProcesses {
		snap.ProcessesCount = countProcesses()
	}

	if cfg.CollectUsers {
		snap.UsersLoggedIn = countLoggedInUsers()
	}

	if cfg.CollectNetworkIP {
		snap.NetworkInterface, snap.IPv4Address = detectIPv4(cfg.NetworkInterface)
	}

	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	snap.AgentMemoryMB = round2(float64(ms.Sys) / (1024.0 * 1024.0))

	return snap
}

func readOSRelease() string {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return runtime.GOOS
	}
	defer f.Close()

	var prettyName, name, versionID string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			prettyName = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"'`)
		} else if strings.HasPrefix(line, "NAME=") {
			name = strings.Trim(strings.TrimPrefix(line, "NAME="), `"'`)
		} else if strings.HasPrefix(line, "VERSION_ID=") {
			versionID = strings.Trim(strings.TrimPrefix(line, "VERSION_ID="), `"'`)
		}
	}
	if prettyName != "" {
		return prettyName
	}
	if name != "" {
		return strings.TrimSpace(name + " " + versionID)
	}
	return runtime.GOOS
}

func readKernelVersion() string {
	if b, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		return strings.TrimSpace(string(b))
	}
	return "unknown"
}

func readUptimeSeconds() int64 {
	b, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(b))
	if len(fields) == 0 {
		return 0
	}
	val, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0
	}
	return int64(val)
}

func readLoadAvg() (float64, float64, float64) {
	b, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, 0, 0
	}
	fields := strings.Fields(string(b))
	if len(fields) < 3 {
		return 0, 0, 0
	}
	l1, _ := strconv.ParseFloat(fields[0], 64)
	l5, _ := strconv.ParseFloat(fields[1], 64)
	l15, _ := strconv.ParseFloat(fields[2], 64)
	return round2(l1), round2(l5), round2(l15)
}

func readMemInfo() (memTotalMB, memUsedMB, memPct, swapTotalMB, swapUsedMB, swapPct float64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, 0, 0, 0, 0
	}
	defer f.Close()

	vals := make(map[string]float64)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) >= 2 {
			key := strings.TrimSuffix(parts[0], ":")
			v, err := strconv.ParseFloat(parts[1], 64)
			if err == nil {
				vals[key] = v // en kB
			}
		}
	}

	memTotalKB := vals["MemTotal"]
	memAvailKB, hasAvail := vals["MemAvailable"]
	if !hasAvail {
		memAvailKB = vals["MemFree"] + vals["Buffers"] + vals["Cached"]
	}
	if memTotalKB > 0 {
		memTotalMB = memTotalKB / 1024.0
		usedKB := memTotalKB - memAvailKB
		if usedKB < 0 {
			usedKB = 0
		}
		memUsedMB = usedKB / 1024.0
		memPct = (usedKB / memTotalKB) * 100.0
	}

	swapTotalKB := vals["SwapTotal"]
	swapFreeKB := vals["SwapFree"]
	if swapTotalKB > 0 {
		swapTotalMB = swapTotalKB / 1024.0
		swapUsedKB := swapTotalKB - swapFreeKB
		if swapUsedKB < 0 {
			swapUsedKB = 0
		}
		swapUsedMB = swapUsedKB / 1024.0
		swapPct = (swapUsedKB / swapTotalKB) * 100.0
	}

	return
}

func readDiskUsage(mountPoint string) (telemetry.DiskMountUsage, bool) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(mountPoint, &stat); err != nil {
		return telemetry.DiskMountUsage{}, false
	}
	bsize := float64(stat.Bsize)
	totalBytes := float64(stat.Blocks) * bsize
	availBytes := float64(stat.Bavail) * bsize
	freeBytes := float64(stat.Bfree) * bsize
	usedBytes := totalBytes - freeBytes
	if totalBytes <= 0 {
		return telemetry.DiskMountUsage{}, false
	}

	denom := usedBytes + availBytes
	pct := 0.0
	if denom > 0 {
		pct = (usedBytes / denom) * 100.0
	}

	const gb = 1024.0 * 1024.0 * 1024.0
	return telemetry.DiskMountUsage{
		MountPoint:  mountPoint,
		TotalGB:     round2(totalBytes / gb),
		UsedGB:      round2(usedBytes / gb),
		UsedPercent: round2(pct),
	}, true
}

func countProcesses() int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if len(name) > 0 && name[0] >= '0' && name[0] <= '9' {
			if _, err := strconv.Atoi(name); err == nil {
				count++
			}
		}
	}
	return count
}

func countLoggedInUsers() int {
	entries, err := os.ReadDir("/dev/pts")
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if _, err := strconv.Atoi(e.Name()); err == nil {
			count++
		}
	}
	return count
}

func detectIPv4(preferredIface string) (string, string) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return preferredIface, ""
	}

	var fallbackIface, fallbackIP string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if strings.HasPrefix(iface.Name, "docker") || strings.HasPrefix(iface.Name, "br-") || strings.HasPrefix(iface.Name, "veth") {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil {
				continue
			}
			ipv4 := ip.To4()
			if ipv4 == nil || ipv4.IsLoopback() {
				continue
			}
			if preferredIface != "" && iface.Name == preferredIface {
				return iface.Name, ipv4.String()
			}
			if fallbackIP == "" {
				fallbackIface = iface.Name
				fallbackIP = ipv4.String()
			}
		}
	}
	return fallbackIface, fallbackIP
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
