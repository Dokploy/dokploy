package tasks

import (
	"context"
	"errors"
	"sort"
	"sync"
	"testing"
	"time"
)

type fakeSource struct {
	mu         sync.Mutex
	containers []ContainerSummary
	stats      map[string]RawStats
	failing    map[string]bool
	requested  []string
}

func (f *fakeSource) ListRunningContainers(context.Context) ([]ContainerSummary, error) {
	return f.containers, nil
}

func (f *fakeSource) ContainerStats(_ context.Context, id string) (RawStats, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.requested = append(f.requested, id)
	if f.failing[id] {
		return RawStats{}, errors.New("container gone")
	}
	return f.stats[id], nil
}

type memoryStore struct {
	mu      sync.Mutex
	samples []Sample
}

func (m *memoryStore) SaveTaskSamples(samples []Sample) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.samples = append(m.samples, samples...)
	return nil
}

func (m *memoryStore) TaskSamples(service string, since time.Time, limit int) ([]Sample, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Sample{}
	for _, sample := range m.samples {
		if sample.Service == service && !sample.Timestamp.Before(since) {
			out = append(out, sample)
		}
	}
	if len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out, nil
}

func (m *memoryStore) DeleteTaskSamplesBefore(time.Time) error { return nil }

func taskContainer(id, service string, slot string) ContainerSummary {
	return ContainerSummary{ID: id, Labels: map[string]string{
		labelServiceName: service,
		labelTaskID:      "task-" + id,
		labelTaskName:    service + "." + slot + ".task-" + id,
		labelNodeID:      "node-1",
	}}
}

func TestCollectorStoresSamplesFromTheSecondReading(t *testing.T) {
	source := &fakeSource{
		containers: []ContainerSummary{taskContainer("a", "web", "1"), taskContainer("b", "web", "2")},
		stats:      map[string]RawStats{"a": stats(0, 0, 2), "b": stats(0, 0, 2)},
	}
	store := &memoryStore{}
	collector := NewCollector(source, store, time.Second, time.Hour)

	if count, err := collector.CollectOnce(context.Background()); err != nil || count != 0 {
		t.Fatalf("first reading stored %d samples, err %v; want 0", count, err)
	}

	source.stats = map[string]RawStats{"a": stats(250, 1000, 2), "b": stats(1000, 1000, 2)}
	count, err := collector.CollectOnce(context.Background())
	if err != nil || count != 2 {
		t.Fatalf("second reading stored %d samples, err %v; want 2", count, err)
	}
	sort.Slice(store.samples, func(i, j int) bool { return store.samples[i].Slot < store.samples[j].Slot })
	if store.samples[0].CPUCores != 0.5 || store.samples[1].CPUCores != 2 {
		t.Fatalf("cores = %v, %v; want 0.5, 2", store.samples[0].CPUCores, store.samples[1].CPUCores)
	}
}

func TestCollectorSkipsInfrastructureAndIsolatesFailures(t *testing.T) {
	source := &fakeSource{
		containers: []ContainerSummary{
			taskContainer("app", "web", "1"),
			taskContainer("db", "dokploy-postgres", "1"),
			taskContainer("broken", "api", "1"),
		},
		stats:   map[string]RawStats{"app": stats(0, 0, 1)},
		failing: map[string]bool{"broken": true},
	}
	store := &memoryStore{}
	collector := NewCollector(source, store, time.Second, time.Hour)
	_, _ = collector.CollectOnce(context.Background())
	source.stats = map[string]RawStats{"app": stats(500, 1000, 1)}
	count, err := collector.CollectOnce(context.Background())

	if err != nil || count != 1 || store.samples[0].Service != "web" {
		t.Fatalf("stored %d samples (%+v), err %v; want one sample for web", count, store.samples, err)
	}
	for _, id := range source.requested {
		if id == "db" {
			t.Fatal("dokploy infrastructure should not be sampled")
		}
	}
}

func TestCollectorForgetsContainersThatStopped(t *testing.T) {
	source := &fakeSource{
		containers: []ContainerSummary{taskContainer("a", "web", "1")},
		stats:      map[string]RawStats{"a": stats(0, 0, 1)},
	}
	store := &memoryStore{}
	collector := NewCollector(source, store, time.Second, time.Hour)
	_, _ = collector.CollectOnce(context.Background())

	source.containers = nil
	_, _ = collector.CollectOnce(context.Background())
	source.containers = []ContainerSummary{taskContainer("a", "web", "1")}
	source.stats = map[string]RawStats{"a": stats(500, 1000, 1)}
	count, _ := collector.CollectOnce(context.Background())

	if count != 0 {
		t.Fatalf("stored %d samples; a reappearing container must start a new baseline", count)
	}
}

func TestCollectorSamplesComposeReplicas(t *testing.T) {
	oneoff := composeContainer("run", "shop", "web", "1")
	oneoff.Labels[labelComposeOneoff] = "True"
	source := &fakeSource{
		containers: []ContainerSummary{
			composeContainer("web2", "shop", "web", "2"),
			composeContainer("internal", "dokploy-tools", "x", "1"),
			oneoff,
			{ID: "plain", Labels: map[string]string{}},
		},
		stats: map[string]RawStats{"web2": stats(0, 0, 1)},
	}
	store := &memoryStore{}
	collector := NewCollector(source, store, time.Second, time.Hour)
	_, _ = collector.CollectOnce(context.Background())
	source.stats = map[string]RawStats{"web2": stats(250, 1000, 1)}
	count, err := collector.CollectOnce(context.Background())

	if err != nil || count != 1 {
		t.Fatalf("stored %d samples, err %v; want 1", count, err)
	}
	got := store.samples[0]
	if got.Service != "compose:shop/web" || got.TaskID != "web2" || got.Slot != 2 || got.NodeID != "" {
		t.Fatalf("sample = %+v; want compose:shop/web, slot 2, keyed by container", got)
	}
	for _, id := range source.requested {
		if id != "web2" {
			t.Fatalf("read stats of %q; only compose replicas outside Dokploy should be read", id)
		}
	}
}
