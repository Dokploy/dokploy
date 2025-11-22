package prometheus

import (
	"bytes"
	"sync"

	"github.com/mauriciogm/dokploy/apps/monitoring/database"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/common/expfmt"
)

type PrometheusExporter struct {
	cpuUsage         *prometheus.GaugeVec
	memoryUsed       *prometheus.GaugeVec
	memoryUsedGB     *prometheus.GaugeVec
	memoryTotal      *prometheus.GaugeVec
	diskUsed         *prometheus.GaugeVec
	diskTotal        *prometheus.GaugeVec
	networkIn        *prometheus.GaugeVec
	networkOut       *prometheus.GaugeVec
	systemUptime     *prometheus.GaugeVec
	cpuCores         *prometheus.GaugeVec
	cpuSpeed         *prometheus.GaugeVec
	containerCPU     *prometheus.GaugeVec
	containerMemory  *prometheus.GaugeVec
	containerNetwork *prometheus.GaugeVec
	containerBlockIO *prometheus.GaugeVec
	db               *database.DB
	registry         *prometheus.Registry
	mu               sync.RWMutex
}

func NewPrometheusExporter(db *database.DB) *PrometheusExporter {
	registry := prometheus.NewRegistry()

	exporter := &PrometheusExporter{
		db:       db,
		registry: registry,
		cpuUsage: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_cpu_usage_percent",
				Help: "Current CPU usage percentage",
			},
			[]string{"server_type", "os", "arch"},
		),
		memoryUsed: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_memory_used_percent",
				Help: "Current memory usage percentage",
			},
			[]string{"server_type", "os", "arch"},
		),
		memoryUsedGB: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_memory_used_gb",
				Help: "Current memory used in GB",
			},
			[]string{"server_type", "os", "arch"},
		),
		memoryTotal: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_memory_total_gb",
				Help: "Total memory available in GB",
			},
			[]string{"server_type", "os", "arch"},
		),
		diskUsed: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_disk_used_percent",
				Help: "Current disk usage percentage",
			},
			[]string{"server_type", "os", "arch"},
		),
		diskTotal: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_disk_total_gb",
				Help: "Total disk space in GB",
			},
			[]string{"server_type", "os", "arch"},
		),
		networkIn: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_network_in_mb",
				Help: "Network traffic received in MB",
			},
			[]string{"server_type", "os", "arch"},
		),
		networkOut: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_network_out_mb",
				Help: "Network traffic sent in MB",
			},
			[]string{"server_type", "os", "arch"},
		),
		systemUptime: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_uptime_seconds",
				Help: "System uptime in seconds",
			},
			[]string{"server_type", "os", "arch"},
		),
		cpuCores: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_cpu_cores",
				Help: "Number of CPU cores",
			},
			[]string{"server_type", "os", "arch", "cpu_model"},
		),
		cpuSpeed: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_server_cpu_speed_mhz",
				Help: "CPU speed in MHz",
			},
			[]string{"server_type", "os", "arch", "cpu_model"},
		),
		containerCPU: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_container_cpu_usage_percent",
				Help: "Container CPU usage percentage",
			},
			[]string{"container_name", "container_id"},
		),
		containerMemory: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_container_memory_used_mb",
				Help: "Container memory used in MB",
			},
			[]string{"container_name", "container_id"},
		),
		containerNetwork: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_container_network_bytes",
				Help: "Container network traffic in bytes",
			},
			[]string{"container_name", "container_id", "direction"},
		),
		containerBlockIO: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Name: "dokploy_container_blockio_bytes",
				Help: "Container block I/O in bytes",
			},
			[]string{"container_name", "container_id", "operation"},
		),
	}

	registry.MustRegister(
		exporter.cpuUsage,
		exporter.memoryUsed,
		exporter.memoryUsedGB,
		exporter.memoryTotal,
		exporter.diskUsed,
		exporter.diskTotal,
		exporter.networkIn,
		exporter.networkOut,
		exporter.systemUptime,
		exporter.cpuCores,
		exporter.cpuSpeed,
		exporter.containerCPU,
		exporter.containerMemory,
		exporter.containerNetwork,
		exporter.containerBlockIO,
	)

	return exporter
}

func (e *PrometheusExporter) GetRegistry() *prometheus.Registry {
	return e.registry
}

func (e *PrometheusExporter) GetMetricsText() (string, error) {
	metricFamilies, err := e.registry.Gather()
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	encoder := expfmt.NewEncoder(&buf, expfmt.NewFormat(expfmt.TypeTextPlain))

	for _, mf := range metricFamilies {
		if err := encoder.Encode(mf); err != nil {
			return "", err
		}
	}

	return buf.String(), nil
}

func (e *PrometheusExporter) UpdateServerMetrics(metric database.ServerMetric, serverType string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	labels := prometheus.Labels{
		"server_type": serverType,
		"os":          metric.OS,
		"arch":        metric.Arch,
	}

	cpuLabels := prometheus.Labels{
		"server_type": serverType,
		"os":          metric.OS,
		"arch":        metric.Arch,
		"cpu_model":   metric.CPUModel,
	}

	e.cpuUsage.With(labels).Set(metric.CPU)
	e.memoryUsed.With(labels).Set(metric.MemUsed)
	e.memoryUsedGB.With(labels).Set(metric.MemUsedGB)
	e.memoryTotal.With(labels).Set(metric.MemTotal)
	e.diskUsed.With(labels).Set(metric.DiskUsed)
	e.diskTotal.With(labels).Set(metric.TotalDisk)
	e.networkIn.With(labels).Set(metric.NetworkIn)
	e.networkOut.With(labels).Set(metric.NetworkOut)
	e.systemUptime.With(labels).Set(float64(metric.Uptime))
	e.cpuCores.With(cpuLabels).Set(float64(metric.CPUCores))
	e.cpuSpeed.With(cpuLabels).Set(metric.CPUSpeed)
}

func (e *PrometheusExporter) UpdateContainerMetrics(metric database.ContainerMetric) {
	e.mu.Lock()
	defer e.mu.Unlock()

	labels := prometheus.Labels{
		"container_name": metric.Name,
		"container_id":   metric.ID,
	}

	e.containerCPU.With(labels).Set(metric.CPU)
	e.containerMemory.With(labels).Set(metric.Memory.Used)

	networkInLabels := prometheus.Labels{
		"container_name": metric.Name,
		"container_id":   metric.ID,
		"direction":      "in",
	}
	networkOutLabels := prometheus.Labels{
		"container_name": metric.Name,
		"container_id":   metric.ID,
		"direction":      "out",
	}
	e.containerNetwork.With(networkInLabels).Set(metric.Network.Input)
	e.containerNetwork.With(networkOutLabels).Set(metric.Network.Output)

	blockReadLabels := prometheus.Labels{
		"container_name": metric.Name,
		"container_id":   metric.ID,
		"operation":      "read",
	}
	blockWriteLabels := prometheus.Labels{
		"container_name": metric.Name,
		"container_id":   metric.ID,
		"operation":      "write",
	}
	e.containerBlockIO.With(blockReadLabels).Set(metric.BlockIO.Read)
	e.containerBlockIO.With(blockWriteLabels).Set(metric.BlockIO.Write)
}
