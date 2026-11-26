//go:build cgo

package database

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/mauriciogm/dokploy/apps/monitoring/tasks"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	t.Setenv("MONITORING_DB_PATH", filepath.Join(t.TempDir(), "monitoring.db"))
	db, err := InitDB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.InitTaskMetricsTable(); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestTaskSamplesRoundTrip(t *testing.T) {
	db := openTestDB(t)
	base := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	var samples []tasks.Sample
	for i := 0; i < 5; i++ {
		samples = append(samples, tasks.Sample{
			// Mixed fractional precision is what broke ordering of RFC 3339 text.
			Timestamp:        base.Add(time.Duration(i)*time.Second + time.Duration(i*150)*time.Millisecond),
			Service:          "web",
			TaskID:           "t1",
			Slot:             1,
			NodeID:           "n1",
			ContainerID:      "c1",
			CPUCores:         float64(i) / 10,
			MemoryBytes:      uint64(1 << 30),
			MemoryLimitBytes: uint64(2 << 30),
		})
	}
	samples = append(samples, tasks.Sample{Timestamp: base, Service: "other", TaskID: "x"})
	if err := db.SaveTaskSamples(samples); err != nil {
		t.Fatal(err)
	}

	got, err := db.TaskSamples("web", base.Add(time.Second), 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d samples; want the 3 most recent", len(got))
	}
	for i, want := range samples[2:5] {
		if !got[i].Timestamp.Equal(want.Timestamp) || got[i].CPUCores != want.CPUCores {
			t.Fatalf("sample %d = %+v; want %+v (oldest first)", i, got[i], want)
		}
	}
	if got[0].MemoryBytes != 1<<30 || got[0].MemoryLimitBytes != 2<<30 {
		t.Fatalf("memory not preserved: %+v", got[0])
	}

	if err := db.DeleteTaskSamplesBefore(base.Add(3 * time.Second)); err != nil {
		t.Fatal(err)
	}
	remaining, _ := db.TaskSamples("web", base, 100)
	if len(remaining) != 2 {
		t.Fatalf("%d samples left after cleanup; want 2", len(remaining))
	}
}
