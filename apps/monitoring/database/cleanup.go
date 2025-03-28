package database

import (
	"database/sql"
	"log"
	"time"

	"github.com/robfig/cron/v3"
)

// CleanupMetrics deletes metrics older than the retention period
func CleanupMetrics(db *sql.DB, retentionDays int) error {
	cutoffDate := time.Now().AddDate(0, 0, -retentionDays)
	cutoffDateStr := cutoffDate.UTC().Format(time.RFC3339Nano)

	containerQuery := `DELETE FROM container_metrics WHERE timestamp < ?`
	_, err := db.Exec(containerQuery, cutoffDateStr)
	if err != nil {
		return err
	}

	serverQuery := `DELETE FROM server_metrics WHERE timestamp < ?`
	_, err = db.Exec(serverQuery, cutoffDateStr)
	if err != nil {
		return err
	}

	log.Printf("Metrics deleted (older than %d days)", retentionDays)
	log.Printf("Cutoff date for both tables: %s", cutoffDateStr)
	return nil
}

// StartMetricsCleanup starts a cron job to periodically clean up metrics
func StartMetricsCleanup(db *sql.DB, retentionDays int, cronExpression string) (*cron.Cron, error) {
	c := cron.New()

	_, err := c.AddFunc(cronExpression, func() {
		if err := CleanupMetrics(db, retentionDays); err != nil {
			log.Printf("Error during metrics cleanup: %v", err)
		}
	})

	if err != nil {
		return nil, err
	}

	c.Start()
	log.Printf("Started metrics cleanup job (retention: %d days, cron: %s)",
		retentionDays, cronExpression)

	return c, nil
}
