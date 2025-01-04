package monitoring

import (
	"fmt"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"

	"github.com/mauriciogm/dokploy/apps/golang/database"
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

func GetServerMetrics() database.ServerMetric {
	v, _ := mem.VirtualMemory()
	c, _ := cpu.Percent(0, false)
	cpuInfo, _ := cpu.Info()
	diskInfo, _ := disk.Usage("/")
	netInfo, _ := net.IOCounters(false)
	hostInfo, _ := host.Info()

	cpuModel := ""
	if len(cpuInfo) > 0 {
		cpuModel = fmt.Sprintf("%s %s", cpuInfo[0].VendorID, cpuInfo[0].ModelName)
	}

	// Calcular memoria en GB
	memTotalGB := float64(v.Total) / 1024 / 1024 / 1024
	memUsedGB := float64(v.Used) / 1024 / 1024 / 1024
	memUsedPercent := (memUsedGB / memTotalGB) * 100

	// Calcular red en MB
	var networkIn, networkOut float64
	if len(netInfo) > 0 {
		networkIn = float64(netInfo[0].BytesRecv) / 1024 / 1024
		networkOut = float64(netInfo[0].BytesSent) / 1024 / 1024
	}

	return database.ServerMetric{
		Timestamp:        time.Now().Unix(),
		CPU:              c[0],
		CPUModel:         cpuModel,
		CPUCores:         int32(runtime.NumCPU()),
		CPUPhysicalCores: int32(len(cpuInfo)),
		CPUSpeed:         float64(cpuInfo[0].Mhz),
		OS:               hostInfo.OS,
		Distro:           hostInfo.Platform,
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
		Timestamp:        time.Unix(metric.Timestamp, 0).Format(time.RFC3339),
	}
}
