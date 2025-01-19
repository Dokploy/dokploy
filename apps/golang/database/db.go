package database

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
}

func InitDB() (*DB, error) {
	dbPath := "./monitoring.db"

	// Create the database file if it doesn't exist
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		file, err := os.Create(dbPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create database file: %v", err)
		}
		file.Close()
	}

	// SQLite opens the database file
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	// Verify the connection
	if err := db.Ping(); err != nil {
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
