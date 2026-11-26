package tasks

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"
)

type Store interface {
	SaveTaskSamples(samples []Sample) error
	TaskSamples(service string, since time.Time, limit int) ([]Sample, error)
	DeleteTaskSamplesBefore(cutoff time.Time) error
}

// Dokploy's own services (database, Traefik, this agent) are never scaled by
// users, so sampling them only adds load.
const infrastructurePrefix = "dokploy-"

type Collector struct {
	source      ContainerSource
	store       Store
	interval    time.Duration
	retention   time.Duration
	concurrency int
	statTimeout time.Duration
	now         func() time.Time

	mu       sync.Mutex
	previous map[string]RawStats
}

func NewCollector(source ContainerSource, store Store, interval, retention time.Duration) *Collector {
	return &Collector{
		source:      source,
		store:       store,
		interval:    interval,
		retention:   retention,
		concurrency: 8,
		statTimeout: 5 * time.Second,
		now:         time.Now,
		previous:    map[string]RawStats{},
	}
}

type statsResult struct {
	container ContainerSummary
	identity  replicaIdentity
	stats     RawStats
	err       error
}

// CollectOnce reads every running swarm task and Docker Compose replica once
// and stores a sample for each one that was also read on the previous call. A
// failed read skips that container only.
func (c *Collector) CollectOnce(ctx context.Context) (int, error) {
	containers, err := c.source.ListRunningContainers(ctx)
	if err != nil {
		return 0, err
	}

	results := make([]statsResult, 0, len(containers))
	var resultsMu sync.Mutex
	semaphore := make(chan struct{}, c.concurrency)
	var wg sync.WaitGroup
	for _, container := range containers {
		identity, ok := identify(container)
		if !ok || strings.HasPrefix(identity.owner, infrastructurePrefix) {
			continue
		}
		wg.Add(1)
		go func(container ContainerSummary, identity replicaIdentity) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			statCtx, cancel := context.WithTimeout(ctx, c.statTimeout)
			defer cancel()
			stats, err := c.source.ContainerStats(statCtx, container.ID)
			resultsMu.Lock()
			results = append(results, statsResult{container, identity, stats, err})
			resultsMu.Unlock()
		}(container, identity)
	}
	wg.Wait()

	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	current := make(map[string]RawStats, len(results))
	samples := make([]Sample, 0, len(results))
	for _, result := range results {
		if result.err != nil {
			continue
		}
		current[result.container.ID] = result.stats
		previous, seen := c.previous[result.container.ID]
		if !seen {
			continue
		}
		if sample, ok := newSample(result.container, result.identity, previous, result.stats, now); ok {
			samples = append(samples, sample)
		}
	}
	// Containers that stopped drop out here, so a replacement never computes a
	// delta against a different container's counters.
	c.previous = current

	if len(samples) == 0 {
		return 0, nil
	}
	return len(samples), c.store.SaveTaskSamples(samples)
}

func (c *Collector) Run(ctx context.Context) {
	if _, err := c.CollectOnce(ctx); err != nil {
		log.Printf("Task metrics: %v", err)
	}
	collect := time.NewTicker(c.interval)
	defer collect.Stop()
	prune := time.NewTicker(time.Hour)
	defer prune.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-collect.C:
			if _, err := c.CollectOnce(ctx); err != nil {
				log.Printf("Task metrics: %v", err)
			}
		case <-prune.C:
			if err := c.store.DeleteTaskSamplesBefore(c.now().Add(-c.retention)); err != nil {
				log.Printf("Task metrics cleanup: %v", err)
			}
		}
	}
}
