package database

import (
	"fmt"
	"time"

	"github.com/mauriciogm/dokploy/apps/monitoring/tasks"
)

func (db *DB) InitTaskMetricsTable() error {
	// Timestamps are Unix milliseconds: RFC 3339 strings with trimmed fractions
	// do not sort in time order.
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS task_metrics (
			ts_ms INTEGER NOT NULL,
			service TEXT NOT NULL,
			task_id TEXT NOT NULL,
			slot INTEGER NOT NULL,
			node_id TEXT NOT NULL,
			container_id TEXT NOT NULL,
			cpu_cores REAL NOT NULL,
			memory_bytes INTEGER NOT NULL,
			memory_limit_bytes INTEGER NOT NULL
		)
	`)
	if err != nil {
		return fmt.Errorf("error creating task_metrics table: %v", err)
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_task_metrics_service_ts ON task_metrics(service, ts_ms)`)
	if err != nil {
		return fmt.Errorf("error creating task_metrics index: %v", err)
	}
	return nil
}

func (db *DB) SaveTaskSamples(samples []tasks.Sample) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	statement, err := tx.Prepare(`
		INSERT INTO task_metrics (ts_ms, service, task_id, slot, node_id, container_id, cpu_cores, memory_bytes, memory_limit_bytes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer statement.Close()
	for _, sample := range samples {
		if _, err := statement.Exec(
			sample.Timestamp.UnixMilli(), sample.Service, sample.TaskID, sample.Slot,
			sample.NodeID, sample.ContainerID, sample.CPUCores,
			int64(sample.MemoryBytes), int64(sample.MemoryLimitBytes),
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// TaskSamples returns the most recent samples of a service since a point in
// time, oldest first.
func (db *DB) TaskSamples(service string, since time.Time, limit int) ([]tasks.Sample, error) {
	rows, err := db.Query(`
		SELECT ts_ms, service, task_id, slot, node_id, container_id, cpu_cores, memory_bytes, memory_limit_bytes
		FROM (
			SELECT * FROM task_metrics
			WHERE service = ? AND ts_ms >= ?
			ORDER BY ts_ms DESC
			LIMIT ?
		)
		ORDER BY ts_ms ASC
	`, service, since.UnixMilli(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	samples := []tasks.Sample{}
	for rows.Next() {
		var sample tasks.Sample
		var timestamp, memory, memoryLimit int64
		if err := rows.Scan(&timestamp, &sample.Service, &sample.TaskID, &sample.Slot,
			&sample.NodeID, &sample.ContainerID, &sample.CPUCores, &memory, &memoryLimit); err != nil {
			return nil, err
		}
		sample.Timestamp = time.UnixMilli(timestamp).UTC()
		sample.MemoryBytes = uint64(memory)
		sample.MemoryLimitBytes = uint64(memoryLimit)
		samples = append(samples, sample)
	}
	return samples, rows.Err()
}

func (db *DB) DeleteTaskSamplesBefore(cutoff time.Time) error {
	_, err := db.Exec(`DELETE FROM task_metrics WHERE ts_ms < ?`, cutoff.UnixMilli())
	return err
}
