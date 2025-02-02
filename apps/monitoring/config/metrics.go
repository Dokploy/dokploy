package config

import (
	"encoding/json"
	"log"
	"os"
	"sync"
)

type Config struct {
	Server struct {
		ServerType    string `json:"type"`
		RefreshRate   int    `json:"refreshRate"`
		Port          int    `json:"port"`
		Token         string `json:"token"`
		UrlCallback   string `json:"urlCallback"`
		CronJob       string `json:"cronJob"`
		RetentionDays int    `json:"retentionDays"`
		Thresholds    struct {
			CPU    int `json:"cpu"`
			Memory int `json:"memory"`
		} `json:"thresholds"`
	} `json:"server"`
	Containers struct {
		RefreshRate int `json:"refreshRate"`
		Services    struct {
			Include []string `json:"include"`
			Exclude []string `json:"exclude"`
		} `json:"services"`
	} `json:"containers"`
}

var (
	config     *Config
	configOnce sync.Once
)

func GetMetricsConfig() *Config {
	configOnce.Do(func() {
		configJSON := os.Getenv("METRICS_CONFIG")
		if configJSON == "" {
			log.Fatal("METRICS_CONFIG environment variable is required")
		}

		config = &Config{}
		if err := json.Unmarshal([]byte(configJSON), config); err != nil {
			log.Fatalf("Error parsing METRICS_CONFIG: %v", err)
		}

		// Validate required fields
		if config.Server.Token == "" || config.Server.UrlCallback == "" {
			log.Fatal("token and urlCallback are required in the configuration")
		}
	})

	return config
}
