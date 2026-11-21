package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"testing"
)

type failDriver struct{}

func (failDriver) Open(string) (driver.Conn, error) { return failConn{}, nil }

type failConn struct{}

func (failConn) Prepare(string) (driver.Stmt, error) { return nil, io.EOF }
func (failConn) Close() error                        { return nil }
func (failConn) Begin() (driver.Tx, error)           { return nil, io.EOF }
func (failConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &failRows{}, nil
}

// failRows yields one valid row and then a driver error, like an I/O failure mid-read.
type failRows struct{ step int }

func (r *failRows) Columns() []string { return []string{"metrics_json"} }
func (r *failRows) Close() error      { return nil }
func (r *failRows) Next(dest []driver.Value) error {
	if r.step == 0 {
		r.step++
		dest[0] = `{"timestamp":"2026-01-01T00:00:00Z","CPU":1}`
		return nil
	}
	return errors.New("disk I/O error while reading container_metrics")
}

func newFailingDB(t *testing.T) *DB {
	t.Helper()
	sql.Register("faildriver_"+t.Name(), failDriver{})
	db, err := sql.Open("faildriver_"+t.Name(), "")
	if err != nil {
		t.Fatal(err)
	}
	return &DB{DB: db}
}

func TestGetAllMetricsContainerReportsRowsErr(t *testing.T) {
	metrics, err := newFailingDB(t).GetAllMetricsContainer("web")
	if err == nil {
		t.Fatalf("expected error, got %d partial metrics with nil error", len(metrics))
	}
	if metrics != nil {
		t.Fatalf("expected no metrics on error, got %d", len(metrics))
	}
}

func TestGetLastNContainerMetricsReportsRowsErr(t *testing.T) {
	metrics, err := newFailingDB(t).GetLastNContainerMetrics("web", 10)
	if err == nil {
		t.Fatalf("expected error, got %d partial metrics with nil error", len(metrics))
	}
	if metrics != nil {
		t.Fatalf("expected no metrics on error, got %d", len(metrics))
	}
}
