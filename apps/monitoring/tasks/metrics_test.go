package tasks

import (
	"math"
	"testing"
	"time"
)

func stats(total, system uint64, online uint32) RawStats {
	var s RawStats
	s.CPUStats.CPUUsage.TotalUsage = total
	s.CPUStats.SystemCPUUsage = system
	s.CPUStats.OnlineCPUs = online
	return s
}

func TestCPUCores(t *testing.T) {
	cases := []struct {
		name     string
		previous RawStats
		current  RawStats
		want     float64
		ok       bool
	}{
		{"half of a 4 CPU host is 2 cores", stats(0, 0, 4), stats(500, 1000, 4), 2, true},
		{"idle", stats(100, 0, 2), stats(100, 1000, 2), 0, true},
		{"restart resets the counter", stats(900, 0, 2), stats(100, 1000, 2), 0, false},
		{"host counter did not move", stats(0, 1000, 2), stats(10, 1000, 2), 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := cpuCores(tc.previous, tc.current)
			if ok != tc.ok || math.Abs(got-tc.want) > 1e-9 {
				t.Fatalf("cpuCores = %v, %v; want %v, %v", got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestCPUCoresFallsBackToPerCPUCount(t *testing.T) {
	current := stats(400, 1000, 0)
	current.CPUStats.CPUUsage.PercpuUsage = []uint64{1, 1}
	got, ok := cpuCores(stats(0, 0, 0), current)
	if !ok || math.Abs(got-0.8) > 1e-9 {
		t.Fatalf("cpuCores = %v, %v; want 0.8, true", got, ok)
	}
	if _, ok := cpuCores(stats(0, 0, 0), stats(400, 1000, 0)); ok {
		t.Fatal("expected no value without a CPU count")
	}
}

func TestWorkingSetBytes(t *testing.T) {
	memory := func(usage uint64, values map[string]uint64) RawStats {
		var s RawStats
		s.MemoryStats.Usage = usage
		s.MemoryStats.Stats = values
		return s
	}
	cases := []struct {
		name string
		in   RawStats
		want uint64
	}{
		{"cgroup v2 subtracts inactive_file", memory(1000, map[string]uint64{"inactive_file": 300}), 700},
		{"cgroup v1 subtracts total_inactive_file", memory(1000, map[string]uint64{"total_inactive_file": 400, "inactive_file": 10}), 600},
		{"no page cache figures", memory(1000, nil), 1000},
		{"cache larger than usage is ignored", memory(100, map[string]uint64{"inactive_file": 300}), 100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := workingSetBytes(tc.in); got != tc.want {
				t.Fatalf("workingSetBytes = %d; want %d", got, tc.want)
			}
		})
	}
}

func TestSlotOf(t *testing.T) {
	cases := map[string]int{
		"web.3.k2j4x9":         3,
		"web.12.abc":           12,
		"web.n8t3i53p0uw.abc1": 0,
		"other.1.abc":          0,
	}
	for name, want := range cases {
		if got := slotOf("web", name); got != want {
			t.Fatalf("slotOf(%q) = %d; want %d", name, got, want)
		}
	}
}

func TestNewSampleUsesTheReadTime(t *testing.T) {
	read := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	current := stats(500, 1000, 4)
	current.Read = read
	current.MemoryStats.Usage = 2048
	current.MemoryStats.Limit = 4096
	container := ContainerSummary{
		ID: "c1",
		Labels: map[string]string{
			labelServiceName: "web",
			labelTaskID:      "task1",
			labelTaskName:    "web.2.task1",
			labelNodeID:      "node1",
		},
	}
	identity, _ := identify(container)
	sample, ok := newSample(container, identity, stats(0, 0, 4), current, time.Now())
	if !ok {
		t.Fatal("expected a sample")
	}
	want := Sample{
		Timestamp: read, Service: "web", TaskID: "task1", Slot: 2, NodeID: "node1",
		ContainerID: "c1", CPUCores: 2, MemoryBytes: 2048, MemoryLimitBytes: 4096,
	}
	if sample != want {
		t.Fatalf("sample = %+v; want %+v", sample, want)
	}
}

func composeContainer(id, project, service, number string) ContainerSummary {
	return ContainerSummary{ID: id, Labels: map[string]string{
		labelComposeProject: project,
		labelComposeService: service,
		labelComposeNumber:  number,
		labelComposeOneoff:  "False",
	}}
}

func TestIdentify(t *testing.T) {
	swarm, ok := identify(ContainerSummary{ID: "c1", Labels: map[string]string{
		labelServiceName: "shop_web",
		labelTaskID:      "task1",
		labelTaskName:    "shop_web.3.task1",
		labelNodeID:      "node1",
	}})
	if !ok || swarm != (replicaIdentity{owner: "shop_web", service: "shop_web", taskID: "task1", slot: 3, nodeID: "node1"}) {
		t.Fatalf("swarm task = %+v, %v", swarm, ok)
	}

	compose, ok := identify(composeContainer("c2", "shop", "web", "2"))
	if !ok || compose != (replicaIdentity{owner: "shop", service: "compose:shop/web", taskID: "c2", slot: 2}) {
		t.Fatalf("compose replica = %+v, %v", compose, ok)
	}

	oneoff := composeContainer("c3", "shop", "web", "1")
	oneoff.Labels[labelComposeOneoff] = "True"
	for name, container := range map[string]ContainerSummary{
		"one-off":       oneoff,
		"plain":         {ID: "c4", Labels: map[string]string{}},
		"no service":    {ID: "c5", Labels: map[string]string{labelComposeProject: "shop"}},
		"task, no name": {ID: "c6", Labels: map[string]string{labelTaskID: "t"}},
	} {
		if identity, ok := identify(container); ok {
			t.Fatalf("%s container identified as %+v", name, identity)
		}
	}
}
