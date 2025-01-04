package database

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

type ServerMetric struct {
	Timestamp   int64   `json:"timestamp"`
	CPUUsage    float64 `json:"cpuUsage"`
	MemoryUsage float64 `json:"memoryUsage"`
	MemoryTotal uint64  `json:"memoryTotal"`
	CPUModel    string  `json:"cpuModel"`
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
			cpu_usage REAL,
			memory_usage REAL,
			memory_total INTEGER,
			cpu_model TEXT
		)
	`)
	if err != nil {
		return nil, err
	}

	return &DB{db}, nil
}

func (db *DB) SaveMetric(metric ServerMetric) error {
	_, err := db.Exec(`
		INSERT INTO server_metrics (timestamp, cpu_usage, memory_usage, memory_total, cpu_model)
		VALUES (?, ?, ?, ?, ?)
	`, metric.Timestamp, metric.CPUUsage, metric.MemoryUsage, metric.MemoryTotal, metric.CPUModel)
	return err
}

func (db *DB) GetMetricsInRange(start, end int64) ([]ServerMetric, error) {
	rows, err := db.Query(`
		SELECT timestamp, cpu_usage, memory_usage, memory_total, cpu_model
		FROM server_metrics
		WHERE timestamp BETWEEN ? AND ?
		ORDER BY timestamp DESC
	`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ServerMetric
	for rows.Next() {
		var m ServerMetric
		err := rows.Scan(&m.Timestamp, &m.CPUUsage, &m.MemoryUsage, &m.MemoryTotal, &m.CPUModel)
		if err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}

func (db *DB) GetLastNMetrics(n int) ([]ServerMetric, error) {
	rows, err := db.Query(`
		SELECT timestamp, cpu_usage, memory_usage, memory_total, cpu_model
		FROM server_metrics
		ORDER BY timestamp DESC
		LIMIT ?
	`, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ServerMetric
	for rows.Next() {
		var m ServerMetric
		err := rows.Scan(&m.Timestamp, &m.CPUUsage, &m.MemoryUsage, &m.MemoryTotal, &m.CPUModel)
		if err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}
