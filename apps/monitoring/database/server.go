package database

import (
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type ServerMetric struct {
	Timestamp        string  `json:"timestamp"`
	CPU              float64 `json:"cpu"`
	CPUModel         string  `json:"cpuModel"`
	CPUCores         int32   `json:"cpuCores"`
	CPUPhysicalCores int32   `json:"cpuPhysicalCores"`
	CPUSpeed         float64 `json:"cpuSpeed"`
	OS               string  `json:"os"`
	Distro           string  `json:"distro"`
	Kernel           string  `json:"kernel"`
	Arch             string  `json:"arch"`
	MemUsed          float64 `json:"memUsed"`
	MemUsedGB        float64 `json:"memUsedGB"`
	MemTotal         float64 `json:"memTotal"`
	Uptime           uint64  `json:"uptime"`
	DiskUsed         float64 `json:"diskUsed"`
	TotalDisk        float64 `json:"totalDisk"`
	NetworkIn        float64 `json:"networkIn"`
	NetworkOut       float64 `json:"networkOut"`
}

func (db *DB) SaveMetric(metric ServerMetric) error {
	if metric.Timestamp == "" {
		metric.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	_, err := db.Exec(`
		INSERT INTO server_metrics (timestamp, cpu, cpu_model, cpu_cores, cpu_physical_cores, cpu_speed, os, distro, kernel, arch, mem_used, mem_used_gb, mem_total, uptime, disk_used, total_disk, network_in, network_out)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, metric.Timestamp, metric.CPU, metric.CPUModel, metric.CPUCores, metric.CPUPhysicalCores, metric.CPUSpeed, metric.OS, metric.Distro, metric.Kernel, metric.Arch, metric.MemUsed, metric.MemUsedGB, metric.MemTotal, metric.Uptime, metric.DiskUsed, metric.TotalDisk, metric.NetworkIn, metric.NetworkOut)
	return err
}

func (db *DB) GetMetricsInRange(start, end time.Time) ([]ServerMetric, error) {
	rows, err := db.Query(`
		SELECT timestamp, cpu, cpu_model, cpu_cores, cpu_physical_cores, cpu_speed, os, distro, kernel, arch, mem_used, mem_used_gb, mem_total, uptime, disk_used, total_disk, network_in, network_out
		FROM server_metrics
		WHERE timestamp BETWEEN ? AND ?
		ORDER BY timestamp ASC
	`, start.UTC().Format(time.RFC3339Nano), end.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ServerMetric
	for rows.Next() {
		var m ServerMetric
		err := rows.Scan(&m.Timestamp, &m.CPU, &m.CPUModel, &m.CPUCores, &m.CPUPhysicalCores, &m.CPUSpeed, &m.OS, &m.Distro, &m.Kernel, &m.Arch, &m.MemUsed, &m.MemUsedGB, &m.MemTotal, &m.Uptime, &m.DiskUsed, &m.TotalDisk, &m.NetworkIn, &m.NetworkOut)
		if err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}

func (db *DB) GetLastNMetrics(n int) ([]ServerMetric, error) {
	rows, err := db.Query(`
		WITH recent_metrics AS (
			SELECT timestamp, cpu, cpu_model, cpu_cores, cpu_physical_cores, cpu_speed, os, distro, kernel, arch, mem_used, mem_used_gb, mem_total, uptime, disk_used, total_disk, network_in, network_out
			FROM server_metrics
			ORDER BY timestamp DESC
			LIMIT ?
		)
		SELECT * FROM recent_metrics
		ORDER BY timestamp ASC
	`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ServerMetric
	for rows.Next() {
		var m ServerMetric
		err := rows.Scan(&m.Timestamp, &m.CPU, &m.CPUModel, &m.CPUCores, &m.CPUPhysicalCores, &m.CPUSpeed, &m.OS, &m.Distro, &m.Kernel, &m.Arch, &m.MemUsed, &m.MemUsedGB, &m.MemTotal, &m.Uptime, &m.DiskUsed, &m.TotalDisk, &m.NetworkIn, &m.NetworkOut)
		if err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}

func (db *DB) GetAllMetrics() ([]ServerMetric, error) {
	rows, err := db.Query(`
		SELECT timestamp, cpu, cpu_model, cpu_cores, cpu_physical_cores, cpu_speed, os, distro, kernel, arch, mem_used, mem_used_gb, mem_total, uptime, disk_used, total_disk, network_in, network_out
		FROM server_metrics
		ORDER BY timestamp ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ServerMetric
	for rows.Next() {
		var m ServerMetric
		err := rows.Scan(&m.Timestamp, &m.CPU, &m.CPUModel, &m.CPUCores, &m.CPUPhysicalCores, &m.CPUSpeed, &m.OS, &m.Distro, &m.Kernel, &m.Arch, &m.MemUsed, &m.MemUsedGB, &m.MemTotal, &m.Uptime, &m.DiskUsed, &m.TotalDisk, &m.NetworkIn, &m.NetworkOut)
		if err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}
