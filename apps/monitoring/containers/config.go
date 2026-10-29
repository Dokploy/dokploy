package containers

import (
	"strings"

	"github.com/mauriciogm/dokploy/apps/monitoring/config"
)

var monitorConfig *MonitoringConfig

func LoadConfig() error {
	cfg := config.GetMetricsConfig()
	monitorConfig = &MonitoringConfig{
		IncludeServices: make([]string, len(cfg.Containers.Services.Include)),
		ExcludeServices: make([]string, len(cfg.Containers.Services.Exclude)),
	}

	// Convert Include services
	for i, svc := range cfg.Containers.Services.Include {
		monitorConfig.IncludeServices[i] = svc
	}

	// Convert Exclude services
	for i, appName := range cfg.Containers.Services.Exclude {
		monitorConfig.ExcludeServices[i] = appName
	}

	return nil
}

func ShouldMonitorContainer(containerName string) bool {
	if monitorConfig == nil {
		return false
	}

	for _, excluded := range monitorConfig.ExcludeServices {
		if strings.Contains(containerName, excluded) {
			return false
		}
	}

	if len(monitorConfig.IncludeServices) > 0 {
		for _, included := range monitorConfig.IncludeServices {
			if strings.Contains(containerName, included) {
				return true
			}
		}
		return false
	}

	return true
}

// GetServiceName returns the deduplication key of a container: its name
// without the swarm task suffix (myapp.1.abc123 → myapp), so replicas of the
// same swarm service are stored once per tick. Names without a task suffix
// (docker compose containers) are already unique per container and are kept
// as-is. Splitting on "-" here used to conflate distinct services sharing a
// name prefix (app-x-mysql and app-x-redis both mapped to "app-x"), so only
// the first of them in `docker stats` output was stored each tick — even
// though metrics are stored and queried by full container_name.
func GetServiceName(containerName string) string {
	name := strings.TrimPrefix(containerName, "/")
	if dot := strings.Index(name, "."); dot != -1 {
		return name[:dot]
	}
	return name
}
