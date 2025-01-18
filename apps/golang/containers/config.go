package containers

import (
	"strings"

	"github.com/mauriciogm/dokploy/apps/golang/config"
)

var monitorConfig *MonitoringConfig

func LoadConfig() error {
	cfg := config.GetMetricsConfig()
	monitorConfig = &MonitoringConfig{
		IncludeServices: make([]ContainerConfig, len(cfg.Containers.Services.Include)),
		ExcludeServices: make([]ContainerConfig, len(cfg.Containers.Services.Exclude)),
	}

	// Convert Include services
	for i, svc := range cfg.Containers.Services.Include {
		monitorConfig.IncludeServices[i] = ContainerConfig{
			AppName:       svc.AppName,
			RetentionDays: svc.RetentionDays,
		}
	}

	// Convert Exclude services
	for i, appName := range cfg.Containers.Services.Exclude {
		monitorConfig.ExcludeServices[i] = ContainerConfig{
			AppName: appName,
		}
	}

	return nil
}

func ShouldMonitorContainer(containerName string) bool {
	if monitorConfig == nil {
		return false
	}

	for _, excluded := range monitorConfig.ExcludeServices {
		if strings.Contains(containerName, excluded.AppName) {
			return false
		}
	}

	if len(monitorConfig.IncludeServices) > 0 {
		for _, included := range monitorConfig.IncludeServices {
			if strings.Contains(containerName, included.AppName) {
				return true
			}
		}
		return false
	}

	return true
}

func GetContainerConfig(containerName string) *ContainerConfig {
	if monitorConfig == nil {
		return &ContainerConfig{RetentionDays: 4}
	}

	for _, included := range monitorConfig.IncludeServices {
		if strings.Contains(containerName, included.AppName) {
			return &included
		}
	}

	return &ContainerConfig{RetentionDays: 4}
}

func GetServiceName(containerName string) string {
	name := strings.TrimPrefix(containerName, "/")
	parts := strings.Split(name, "-")
	if len(parts) > 1 {
		return strings.Join(parts[:len(parts)-1], "-")
	}
	return name
}
