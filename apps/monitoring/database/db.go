package database

import (
	"database/sql"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
}

func InitDB() (*DB, error) {
	// Set when the agent runs as a global service, where a bind-mounted file
	// cannot be assumed to exist on every node.
	path := os.Getenv("MONITORING_DB_PATH")
	if path == "" {
		path = "./monitoring.db"
	}
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, err
	}

	// Create metrics table if it doesn't exist
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS server_metrics (
			timestamp TEXT PRIMARY KEY,
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
