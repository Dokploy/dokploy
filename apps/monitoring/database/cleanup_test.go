package database

import "testing"

func TestStartMetricsCleanupUsesDefaultForEmptySchedule(t *testing.T) {
	cleanupCron, err := StartMetricsCleanup(nil, 2, "")
	if err != nil {
		t.Fatalf("StartMetricsCleanup() error = %v", err)
	}
	defer cleanupCron.Stop()

	if len(cleanupCron.Entries()) != 1 {
		t.Fatalf("StartMetricsCleanup() registered %d jobs, want 1", len(cleanupCron.Entries()))
	}
}

func TestStartMetricsCleanupRejectsInvalidSchedule(t *testing.T) {
	cleanupCron, err := StartMetricsCleanup(nil, 2, "not a cron expression")
	if err == nil {
		cleanupCron.Stop()
		t.Fatal("StartMetricsCleanup() error = nil, want an invalid cron error")
	}
}
