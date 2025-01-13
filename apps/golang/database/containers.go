package database

import (
	"encoding/json"
	"fmt"
	"strings"
)

func (db *DB) InitContainerMetricsTable() error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS container_metrics (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TEXT NOT NULL,
			container_id TEXT NOT NULL,
			container_name TEXT NOT NULL,
			metrics_json TEXT NOT NULL
		)
	`)
	if err != nil {
		return fmt.Errorf("error creating container_metrics table: %v", err)
	}

	// Crear índices para mejorar el rendimiento
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_container_metrics_timestamp ON container_metrics(timestamp)`)
	if err != nil {
		return fmt.Errorf("error creating timestamp index: %v", err)
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_container_metrics_name ON container_metrics(container_name)`)
	if err != nil {
		return fmt.Errorf("error creating name index: %v", err)
	}

	return nil
}

func (db *DB) SaveContainerMetric(metric *ContainerMetric) error {
	metricsJSON, err := json.Marshal(metric)
	if err != nil {
		return fmt.Errorf("error marshaling metrics: %v", err)
	}

	_, err = db.Exec(`
		INSERT INTO container_metrics (timestamp, container_id, container_name, metrics_json)
		VALUES (?, ?, ?, ?)
	`, metric.Timestamp, metric.ID, metric.Name, string(metricsJSON))
	return err
}

func (db *DB) GetLastNContainerMetrics(containerName string, limit int) ([]ContainerMetric, error) {
	name := strings.TrimPrefix(containerName, "/")
	parts := strings.Split(name, "-")
	if len(parts) > 1 {
		containerName = strings.Join(parts[:len(parts)-1], "-")
	}

	query := `
		WITH recent_metrics AS (
			SELECT metrics_json
			FROM container_metrics
			WHERE container_name LIKE ? || '%'
			ORDER BY timestamp DESC
			LIMIT ?
		)
		SELECT metrics_json FROM recent_metrics ORDER BY json_extract(metrics_json, '$.timestamp') ASC
	`
	rows, err := db.Query(query, containerName, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ContainerMetric
	for rows.Next() {
		var metricsJSON string
		err := rows.Scan(&metricsJSON)
		if err != nil {
			return nil, err
		}

		var metric ContainerMetric
		if err := json.Unmarshal([]byte(metricsJSON), &metric); err != nil {
			return nil, err
		}
		metrics = append(metrics, metric)
	}
	return metrics, nil
}

func (db *DB) GetAllMetricsContainer(containerName string) ([]ContainerMetric, error) {
	name := strings.TrimPrefix(containerName, "/")
	parts := strings.Split(name, "-")
	if len(parts) > 1 {
		containerName = strings.Join(parts[:len(parts)-1], "-")
	}

	query := `
		WITH recent_metrics AS (
			SELECT metrics_json
			FROM container_metrics
			WHERE container_name LIKE ? || '%'
			ORDER BY timestamp DESC
		)
		SELECT metrics_json FROM recent_metrics ORDER BY json_extract(metrics_json, '$.timestamp') ASC
	`
	rows, err := db.Query(query, containerName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []ContainerMetric
	for rows.Next() {
		var metricsJSON string
		err := rows.Scan(&metricsJSON)
		if err != nil {
			return nil, err
		}

		var metric ContainerMetric
		if err := json.Unmarshal([]byte(metricsJSON), &metric); err != nil {
			return nil, err
		}
		metrics = append(metrics, metric)
	}
	return metrics, nil
}

type ContainerMetric struct {
	Timestamp string        `json:"timestamp"`
	CPU       float64       `json:"CPU"`
	Memory    MemoryMetric  `json:"Memory"`
	Network   NetworkMetric `json:"Network"`
	BlockIO   BlockIOMetric `json:"BlockIO"`
	Container string        `json:"Container"`
	ID        string        `json:"ID"`
	Name      string        `json:"Name"`
}

type MemoryMetric struct {
	Percentage float64 `json:"percentage"`
	Used       float64 `json:"used"`
	Total      float64 `json:"total"`
	UsedUnit   string  `json:"usedUnit"`
	TotalUnit  string  `json:"totalUnit"`
}

type NetworkMetric struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	InputUnit  string  `json:"inputUnit"`
	OutputUnit string  `json:"outputUnit"`
}

type BlockIOMetric struct {
	Read      float64 `json:"read"`
	Write     float64 `json:"write"`
	ReadUnit  string  `json:"readUnit"`
	WriteUnit string  `json:"writeUnit"`
}
