package containers

import (
	"encoding/json"
	"os"
	"strings"
)

var config *MonitoringConfig

func LoadConfig() error {
	configStr := os.Getenv("CONTAINER_MONITORING_CONFIG")
	if configStr == "" {
		config = &MonitoringConfig{
			IncludeServices: []ContainerConfig{},
			ExcludeServices: []ContainerConfig{},
		}
		return nil
	}

	config = &MonitoringConfig{}
	return json.Unmarshal([]byte(configStr), config)
}

func ShouldMonitorContainer(containerName string) bool {
	if config == nil {
		return false
	}

	for _, excluded := range config.ExcludeServices {
		if strings.Contains(containerName, excluded.AppName) {
			return false
		}
	}

	if len(config.IncludeServices) > 0 {
		for _, included := range config.IncludeServices {
			if strings.Contains(containerName, included.AppName) {
				return true
			}
		}
		return false
	}

	return true
}

func GetContainerConfig(containerName string) *ContainerConfig {
	if config == nil {
		return &ContainerConfig{MaxFileSizeMB: 10}
	}

	for _, included := range config.IncludeServices {
		if strings.Contains(containerName, included.AppName) {
			return &included
		}
	}

	return &ContainerConfig{MaxFileSizeMB: 10}
}

func GetServiceName(containerName string) string {
	name := strings.TrimPrefix(containerName, "/")
	parts := strings.Split(name, "-")
	if len(parts) > 1 {
		return strings.Join(parts[:len(parts)-1], "-")
	}
	return name
}
