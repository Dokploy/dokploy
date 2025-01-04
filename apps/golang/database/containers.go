package database

import (
	"encoding/json"
	"fmt"
	"log"
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

func (db *DB) GetContainerMetrics(containerName string, limit int) ([]ContainerMetric, error) {
	// First, let's see what container names we have
	debugQuery := `SELECT DISTINCT container_name FROM container_metrics`
	debugRows, err := db.Query(debugQuery)
	if err == nil {
		defer debugRows.Close()
		var names []string
		for debugRows.Next() {
			var name string
			if err := debugRows.Scan(&name); err == nil {
				names = append(names, name)
			}
		}
		log.Printf("Available container names in database: %v", names)
		log.Printf("Searching for container name: %s", containerName)
	}

	// Transform the container name to match how it's stored
	name := strings.TrimPrefix(containerName, "/")
	parts := strings.Split(name, "-")
	if len(parts) > 1 {
		containerName = strings.Join(parts[:len(parts)-1], "-")
	}
	log.Printf("Transformed container name for search: %s", containerName)

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
	log.Printf("Executing query with container_name=%s and limit=%d", containerName, limit)
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

func (db *DB) GetAllContainerMetrics(limit int) ([]ContainerMetric, error) {
	query := `
		WITH recent_metrics AS (
			SELECT metrics_json
			FROM container_metrics
			ORDER BY timestamp DESC
			LIMIT ?
		)
		SELECT metrics_json FROM recent_metrics ORDER BY json_extract(metrics_json, '$.timestamp') ASC
	`
	rows, err := db.Query(query, limit)
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
	Used      float64 `json:"used"`
	Total     float64 `json:"total"`
	UsedUnit  string  `json:"usedUnit"`
	TotalUnit string  `json:"totalUnit"`
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
