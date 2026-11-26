package monitoring

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	hostProcDir   = "/host/proc"
	hostCgroupDir = "/host/sys/fs/cgroup"
	bytesPerGiB   = 1024 * 1024 * 1024
)

// The agent's own /proc is the physical machine's when the server is a VM or
// LXC guest, so CPU and memory totals come from the host's /proc mounted at
// /host/proc, which holds the guest's own view.
func init() {
	if os.Getenv("HOST_PROC") != "" {
		return
	}
	if _, err := os.Stat(filepath.Join(hostProcDir, "stat")); err == nil {
		os.Setenv("HOST_PROC", hostProcDir)
	}
}

func readCgroupNumber(path, key string) (uint64, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, false
	}
	text := strings.TrimSpace(string(data))
	if key == "" {
		n, err := strconv.ParseUint(text, 10, 64)
		return n, err == nil
	}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == key {
			n, err := strconv.ParseUint(fields[1], 10, 64)
			return n, err == nil
		}
	}
	return 0, false
}

// /host/proc/meminfo is scoped to the reader's own cgroup, so its free and
// available figures describe the agent container only. The guest's usage is
// in the root cgroup of the host's /sys, minus the cache the kernel can drop,
// which is what `free` reports as used. The root cgroup of a plain host has
// no memory.current, which is when the caller keeps its own figure.
func hostMemoryUsedGB(cgroupDir string, fallbackGB, totalGB float64) float64 {
	current, ok := readCgroupNumber(filepath.Join(cgroupDir, "memory.current"), "")
	if !ok {
		return fallbackGB
	}
	cache, ok := readCgroupNumber(filepath.Join(cgroupDir, "memory.stat"), "file")
	if !ok || cache > current {
		return fallbackGB
	}
	usedGB := float64(current-cache) / bytesPerGiB
	if usedGB > totalGB {
		return fallbackGB
	}
	return usedGB
}
