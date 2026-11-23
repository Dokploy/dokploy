package tasks

import (
	"strconv"
	"strings"
	"time"
)

type Sample struct {
	Timestamp        time.Time `json:"timestamp"`
	Service          string    `json:"service"`
	TaskID           string    `json:"taskId"`
	Slot             int       `json:"slot"`
	NodeID           string    `json:"nodeId"`
	ContainerID      string    `json:"containerId"`
	CPUCores         float64   `json:"cpuCores"`
	MemoryBytes      uint64    `json:"memoryBytes"`
	MemoryLimitBytes uint64    `json:"memoryLimitBytes"`
}

// cpuCores returns the CPU used between two readings of the same container, in
// cores. It reports false when there is no usable interval: the container was
// restarted (counters went backwards) or the host counter did not move.
func cpuCores(previous, current RawStats) (float64, bool) {
	used := current.CPUStats.CPUUsage.TotalUsage
	usedBefore := previous.CPUStats.CPUUsage.TotalUsage
	system := current.CPUStats.SystemCPUUsage
	systemBefore := previous.CPUStats.SystemCPUUsage
	if used < usedBefore || system <= systemBefore {
		return 0, false
	}
	cpus := float64(current.CPUStats.OnlineCPUs)
	if cpus == 0 {
		cpus = float64(len(current.CPUStats.CPUUsage.PercpuUsage))
	}
	if cpus == 0 {
		return 0, false
	}
	return float64(used-usedBefore) / float64(system-systemBefore) * cpus, true
}

// workingSetBytes excludes reclaimable page cache, as `docker stats` does, so
// a container that only reads files does not look close to its memory limit.
func workingSetBytes(stats RawStats) uint64 {
	memory := stats.MemoryStats
	if inactive, cgroupV1 := memory.Stats["total_inactive_file"]; cgroupV1 && inactive < memory.Usage {
		return memory.Usage - inactive
	}
	if inactive := memory.Stats["inactive_file"]; inactive < memory.Usage {
		return memory.Usage - inactive
	}
	return memory.Usage
}

// ComposeServiceKey is the service name under which replicas of a Docker
// Compose service are stored. Swarm service names cannot contain ":" or "/",
// so it never collides with one.
func ComposeServiceKey(project, service string) string {
	return "compose:" + project + "/" + service
}

type replicaIdentity struct {
	// owner is the swarm service or compose project, used to skip Dokploy's own.
	owner   string
	service string
	taskID  string
	slot    int
	nodeID  string
}

// identify tells a swarm task container or a Docker Compose replica apart from
// any other container. A compose replica has no task, so its container ID
// stands in for one, and its container number is its slot. One-off containers
// (docker compose run) are not replicas.
func identify(container ContainerSummary) (replicaIdentity, bool) {
	labels := container.Labels
	if taskID := labels[labelTaskID]; taskID != "" {
		service := labels[labelServiceName]
		return replicaIdentity{
			owner:   service,
			service: service,
			taskID:  taskID,
			slot:    slotOf(service, labels[labelTaskName]),
			nodeID:  labels[labelNodeID],
		}, service != ""
	}
	project, service := labels[labelComposeProject], labels[labelComposeService]
	if project == "" || service == "" || strings.EqualFold(labels[labelComposeOneoff], "true") {
		return replicaIdentity{}, false
	}
	slot, err := strconv.Atoi(labels[labelComposeNumber])
	if err != nil || slot < 0 {
		slot = 0
	}
	return replicaIdentity{
		owner:   project,
		service: ComposeServiceKey(project, service),
		taskID:  container.ID,
		slot:    slot,
	}, true
}

// slotOf reads the slot from a task name such as "web.3.k2j4x". Global
// services name tasks after the node instead and have no slot.
func slotOf(service, taskName string) int {
	rest := strings.TrimPrefix(taskName, service+".")
	if rest == taskName {
		return 0
	}
	slot, err := strconv.Atoi(strings.SplitN(rest, ".", 2)[0])
	if err != nil {
		return 0
	}
	return slot
}

func newSample(container ContainerSummary, identity replicaIdentity, previous, current RawStats, now time.Time) (Sample, bool) {
	cores, ok := cpuCores(previous, current)
	if !ok {
		return Sample{}, false
	}
	timestamp := current.Read
	if timestamp.IsZero() {
		timestamp = now
	}
	return Sample{
		Timestamp:        timestamp.UTC(),
		Service:          identity.service,
		TaskID:           identity.taskID,
		Slot:             identity.slot,
		NodeID:           identity.nodeID,
		ContainerID:      container.ID,
		CPUCores:         cores,
		MemoryBytes:      workingSetBytes(current),
		MemoryLimitBytes: current.MemoryStats.Limit,
	}, true
}
