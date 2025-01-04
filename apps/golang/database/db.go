package database

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

type ServerMetric struct {
	Timestamp        int64   `json:"timestamp"`
	CPU             float64 `json:"cpu"`
	CPUModel        string  `json:"cpuModel"`
	CPUCores        int32   `json:"cpuCores"`
	CPUPhysicalCores int32   `json:"cpuPhysicalCores"`
	CPUSpeed        float64 `json:"cpuSpeed"`
	OS              string  `json:"os"`
	Distro          string  `json:"distro"`
	Kernel          string  `json:"kernel"`
	Arch            string  `json:"arch"`
	MemUsed         float64 `json:"memUsed"`
	MemUsedGB       float64 `json:"memUsedGB"`
	MemTotal        float64 `json:"memTotal"`
	Uptime          uint64  `json:"uptime"`
	DiskUsed        float64 `json:"diskUsed"`
	TotalDisk       float64 `json:"totalDisk"`
	NetworkIn       float64 `json:"networkIn"`
	NetworkOut      float64 `json:"networkOut"`
}

type DB struct {
	*sql.DB
}

func InitDB() (*DB, error) {
	db, err := sql.Open("sqlite3", "./monitoring.db")
	if err != nil {
		return nil, err
	}

	// Create metrics table if it doesn't exist
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS server_metrics (
			timestamp INTEGER PRIMARY KEY,
			cpu REAL,
			cpu_model TEXT,
			cpu_cores INTEGER,
			cpu_physical_cores INTEGER,
			cpu_speed REAL,
			os TEXT,
			distro TEXT,
			kernel TEXT,
			arch TEXT,
			mem_used REAL,
			mem_used_gb REAL,
			mem_total REAL,
			uptime INTEGER,
			disk_used REAL,
			total_disk REAL,
			network_in REAL,
			network_out REAL
		)
	`)
	if err != nil {
		return nil, err
	}

	return &DB{db}, nil
}

func (db *DB) SaveMetric(metric ServerMetric) error {
	_, err := db.Exec(`
		INSERT INTO server_metrics (timestamp, cpu, cpu_model, cpu_cores, cpu_physical_cores, cpu_speed, os, distro, kernel, arch, mem_used, mem_used_gb, mem_total, uptime, disk_used, total_disk, network_in, network_out)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, metric.Timestamp, metric.CPU, metric.CPUModel, metric.CPUCores, metric.CPUPhysicalCores, metric.CPUSpeed, metric.OS, metric.Distro, metric.Kernel, metric.Arch, metric.MemUsed, metric.MemUsedGB, metric.MemTotal, metric.Uptime, metric.DiskUsed, metric.TotalDisk, metric.NetworkIn, metric.NetworkOut)
	return err
}

func (db *DB) GetMetricsInRange(start, end int64) ([]ServerMetric, error) {
	rows, err := db.Query(`
		SELECT timestamp, cpu, cpu_model, cpu_cores, cpu_physical_cores, cpu_speed, os, distro, kernel, arch, mem_used, mem_used_gb, mem_total, uptime, disk_used, total_disk, network_in, network_out
		FROM server_metrics
		WHERE timestamp BETWEEN ? AND ?
		ORDER BY timestamp ASC
	`, start, end)
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
