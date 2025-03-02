package monitoring

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"

	"github.com/mauriciogm/dokploy/apps/monitoring/config"
	"github.com/mauriciogm/dokploy/apps/monitoring/database"
)

type SystemMetrics struct {
	CPU              string  `json:"cpu"`
	CPUModel         string  `json:"cpuModel"`
	CPUCores         int32   `json:"cpuCores"`
	CPUPhysicalCores int32   `json:"cpuPhysicalCores"`
	CPUSpeed         float64 `json:"cpuSpeed"`
	OS               string  `json:"os"`
	Distro           string  `json:"distro"`
	Kernel           string  `json:"kernel"`
	Arch             string  `json:"arch"`
	MemUsed          string  `json:"memUsed"`
	MemUsedGB        string  `json:"memUsedGB"`
	MemTotal         string  `json:"memTotal"`
	Uptime           uint64  `json:"uptime"`
	DiskUsed         string  `json:"diskUsed"`
	TotalDisk        string  `json:"totalDisk"`
	NetworkIn        string  `json:"networkIn"`
	NetworkOut       string  `json:"networkOut"`
	Timestamp        string  `json:"timestamp"`
}

type AlertPayload struct {
	ServerType string  `json:"ServerType"`
	Type       string  `json:"Type"`
	Value      float64 `json:"Value"`
	Threshold  float64 `json:"Threshold"`
	Message    string  `json:"Message"`
	Timestamp  string  `json:"Timestamp"`
	Token      string  `json:"Token"`
}

func getRealOS() string {
	if content, err := os.ReadFile("/etc/os-release"); err == nil {
		lines := strings.Split(string(content), "\n")
		var id, name, version string
		for _, line := range lines {
			if strings.HasPrefix(line, "PRETTY_NAME=") {
				return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
			} else if strings.HasPrefix(line, "NAME=") {
				name = strings.Trim(strings.TrimPrefix(line, "NAME="), "\"")
			} else if strings.HasPrefix(line, "VERSION=") {
				version = strings.Trim(strings.TrimPrefix(line, "VERSION="), "\"")
			} else if strings.HasPrefix(line, "ID=") {
				id = strings.Trim(strings.TrimPrefix(line, "ID="), "\"")
			}
		}
		if name != "" && version != "" {
			return fmt.Sprintf("%s %s", name, version)
		}
		if name != "" {
			return name
		}
		if id != "" {
			return id
		}
	}

	if content, err := os.ReadFile("/etc/system-release"); err == nil {
		text := strings.ToLower(string(content))
		switch {
		case strings.Contains(text, "red hat"):
			return "rhel"
		case strings.Contains(text, "centos"):
			return "centos"
		case strings.Contains(text, "fedora"):
			return "fedora"
		}
	}

	cmd := exec.Command("uname", "-a")
	if output, err := cmd.Output(); err == nil {
		osInfo := strings.ToLower(string(output))
		switch {
		case strings.Contains(osInfo, "debian"):
			return "debian"
		case strings.Contains(osInfo, "ubuntu"):
			return "ubuntu"
		case strings.Contains(osInfo, "centos"):
			return "centos"
		case strings.Contains(osInfo, "fedora"):
			return "fedora"
		case strings.Contains(osInfo, "red hat"):
			return "rhel"
		case strings.Contains(osInfo, "arch"):
			return "arch"
		case strings.Contains(osInfo, "darwin"):
			return "darwin"
		}
	}

	return runtime.GOOS
}

func GetServerMetrics() database.ServerMetric {
	v, _ := mem.VirtualMemory()
	c, _ := cpu.Percent(0, false)
	cpuInfo, _ := cpu.Info()
	diskInfo, _ := disk.Usage("/")
	netInfo, _ := net.IOCounters(false)
	hostInfo, _ := host.Info()
	distro := getRealOS()

	cpuModel := ""
	if len(cpuInfo) > 0 {
		cpuModel = fmt.Sprintf("%s %s", cpuInfo[0].VendorID, cpuInfo[0].ModelName)
	}

	memTotalGB := float64(v.Total) / 1024 / 1024 / 1024
	memUsedGB := float64(v.Used) / 1024 / 1024 / 1024
	memUsedPercent := (memUsedGB / memTotalGB) * 100

	var networkIn, networkOut float64
	if len(netInfo) > 0 {
		networkIn = float64(netInfo[0].BytesRecv) / 1024 / 1024
		networkOut = float64(netInfo[0].BytesSent) / 1024 / 1024
	}
	return database.ServerMetric{
		Timestamp:        time.Now().UTC().Format(time.RFC3339Nano),
		CPU:              c[0],
		CPUModel:         cpuModel,
		CPUCores:         int32(runtime.NumCPU()),
		CPUPhysicalCores: int32(len(cpuInfo)),
		CPUSpeed:         float64(cpuInfo[0].Mhz),
		OS:               getRealOS(),
		Distro:           distro,
		Kernel:           hostInfo.KernelVersion,
		Arch:             hostInfo.KernelArch,
		MemUsed:          memUsedPercent,
		MemUsedGB:        memUsedGB,
		MemTotal:         memTotalGB,
		Uptime:           hostInfo.Uptime,
		DiskUsed:         float64(diskInfo.UsedPercent),
		TotalDisk:        float64(diskInfo.Total) / 1024 / 1024 / 1024,
		NetworkIn:        networkIn,
		NetworkOut:       networkOut,
	}
}

func ConvertToSystemMetrics(metric database.ServerMetric) SystemMetrics {
	return SystemMetrics{
		CPU:              fmt.Sprintf("%.2f", metric.CPU),
		CPUModel:         metric.CPUModel,
		CPUCores:         metric.CPUCores,
		CPUPhysicalCores: metric.CPUPhysicalCores,
		CPUSpeed:         metric.CPUSpeed,
		OS:               metric.OS,
		Distro:           metric.Distro,
		Kernel:           metric.Kernel,
		Arch:             metric.Arch,
		MemUsed:          fmt.Sprintf("%.2f", metric.MemUsed),
		MemUsedGB:        fmt.Sprintf("%.2f", metric.MemUsedGB),
		MemTotal:         fmt.Sprintf("%.2f", metric.MemTotal),
		Uptime:           metric.Uptime,
		DiskUsed:         fmt.Sprintf("%.2f", metric.DiskUsed),
		TotalDisk:        fmt.Sprintf("%.2f", metric.TotalDisk),
		NetworkIn:        fmt.Sprintf("%.2f", metric.NetworkIn),
		NetworkOut:       fmt.Sprintf("%.2f", metric.NetworkOut),
		Timestamp:        metric.Timestamp,
	}
}

func CheckThresholds(metrics database.ServerMetric) error {
	cfg := config.GetMetricsConfig()
	cpuThreshold := float64(cfg.Server.Thresholds.CPU)
	memThreshold := float64(cfg.Server.Thresholds.Memory)
	callbackURL := cfg.Server.UrlCallback
	metricsToken := cfg.Server.Token

	// log.Printf("CPU threshold: %.2f%%", cpuThreshold)
	// log.Printf("Current CPU usage: %.2f%%", metrics.CPU)
	// log.Printf("Memory threshold: %.2f%%", memThreshold)
	// log.Printf("Callback URL: %s", callbackURL)
	// log.Printf("Metrics token: %s", metricsToken)

	if cpuThreshold == 0 && memThreshold == 0 {
		return nil
	}

	if cpuThreshold > 0 && metrics.CPU > cpuThreshold {
		alert := AlertPayload{
			ServerType: cfg.Server.ServerType,
			Type:       "CPU",
			Value:      metrics.CPU,
			Threshold:  cpuThreshold,
			Message:    fmt.Sprintf("CPU usage (%.2f%%) exceeded threshold (%.2f%%)", metrics.CPU, cpuThreshold),
			Timestamp:  metrics.Timestamp,
			Token:      metricsToken,
		}
		if err := sendAlert(callbackURL, alert); err != nil {
			return fmt.Errorf("failed to send CPU alert: %v", err)
		}
	}

	if memThreshold > 0 && metrics.MemUsed > memThreshold {
		alert := AlertPayload{
			ServerType: cfg.Server.ServerType,
			Type:       "Memory",
			Value:      metrics.MemUsed,
			Threshold:  memThreshold,
			Message:    fmt.Sprintf("Memory usage (%.2f%%) exceeded threshold (%.2f%%)", metrics.MemUsed, memThreshold),
			Timestamp:  metrics.Timestamp,
			Token:      metricsToken,
		}
		if err := sendAlert(callbackURL, alert); err != nil {
			return fmt.Errorf("failed to send memory alert: %v", err)
		}
	}

	return nil
}

func sendAlert(callbackURL string, payload AlertPayload) error {
	if callbackURL == "" {
		return fmt.Errorf("callback URL is not set")
	}
	wrappedPayload := map[string]interface{}{
		"json": payload,
	}

	jsonData, err := json.Marshal(wrappedPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal alert payload: %v", err)
	}

	resp, err := http.Post(callbackURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send POST request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("received non-OK response status: %s, body: %s", resp.Status, string(bodyBytes))
	}

	return nil
}
