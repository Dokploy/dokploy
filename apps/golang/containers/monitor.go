package containers

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mauriciogm/dokploy/apps/golang/database"
)

type ContainerMonitor struct {
	db        *database.DB
	isRunning bool
	mu        sync.Mutex
	stopChan  chan struct{}
}

func NewContainerMonitor(db *database.DB) (*ContainerMonitor, error) {
	if err := db.InitContainerMetricsTable(); err != nil {
		return nil, fmt.Errorf("failed to initialize container metrics table: %v", err)
	}

	return &ContainerMonitor{
		db:       db,
		stopChan: make(chan struct{}),
	}, nil
}

func (cm *ContainerMonitor) Start() error {
	if err := LoadConfig(); err != nil {
		return fmt.Errorf("error loading config: %v", err)
	}

	refreshRateSeconds := 10 // default 10 segundos
	if rateStr := os.Getenv("CONTAINER_REFRESH_RATE"); rateStr != "" {
		if rate, err := strconv.Atoi(rateStr); err == nil {
			refreshRateSeconds = rate
		}
	}

	refreshRateMs := refreshRateSeconds * 1000
	log.Printf("Container metrics collection will run every %d seconds", refreshRateSeconds)

	ticker := time.NewTicker(time.Duration(refreshRateMs) * time.Millisecond)
	go func() {
		for {
			select {
			case <-ticker.C:
				cm.collectMetrics()
			case <-cm.stopChan:
				ticker.Stop()
				return
			}
		}
	}()

	return nil
}

func (cm *ContainerMonitor) Stop() {
	close(cm.stopChan)
}

func (cm *ContainerMonitor) collectMetrics() {
	cm.mu.Lock()
	if cm.isRunning {
		cm.mu.Unlock()
		log.Println("Previous collection still running, skipping...")
		return
	}
	cm.isRunning = true
	cm.mu.Unlock()

	defer func() {
		cm.mu.Lock()
		cm.isRunning = false
		cm.mu.Unlock()
	}()

	cmd := exec.Command("docker", "stats", "--no-stream", "--format",
		`{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}`)

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("Error getting docker stats: %v", err)
		return
	}

	lines := string(output)
	if lines == "" {
		return
	}

	seenServices := make(map[string]bool)
	for _, line := range strings.Split(lines, "\n") {
		if line == "" {
			continue
		}

		var container Container
		if err := json.Unmarshal([]byte(line), &container); err != nil {
			log.Printf("Error parsing container data: %v", err)
			continue
		}

		if !ShouldMonitorContainer(container.Name) {
			continue
		}

		serviceName := GetServiceName(container.Name)

		if seenServices[serviceName] {
			continue
		}

		seenServices[serviceName] = true

		// Procesar métricas
		metric := processContainerMetrics(container)

		// log.Printf("Saving metrics for %s: %+v", serviceName, metric)

		if err := cm.db.SaveContainerMetric(metric); err != nil {
			log.Printf("Error saving metrics for %s: %v", serviceName, err)
		}
	}
}

func processContainerMetrics(container Container) *database.ContainerMetric {

	// Procesar CPU
	cpu, _ := strconv.ParseFloat(strings.TrimSuffix(container.CPUPerc, "%"), 64)

	// Procesar Memoria
	memPerc, _ := strconv.ParseFloat(strings.TrimSuffix(container.MemPerc, "%"), 64)
	memParts := strings.Split(container.MemUsage, " / ")

	var usedValue, totalValue float64
	var usedUnit, totalUnit string

	if len(memParts) == 2 {
		// Procesar used memory
		usedParts := strings.Fields(memParts[0])
		if len(usedParts) > 0 {
			usedValue, _ = strconv.ParseFloat(strings.TrimRight(usedParts[0], "MiBGiB"), 64)
			usedUnit = strings.TrimLeft(usedParts[0], "0123456789.")
			// Convertir MiB a MB y GiB a GB
			if usedUnit == "MiB" {
				usedUnit = "MB"
			} else if usedUnit == "GiB" {
				usedUnit = "GB"
			}
		}

		// Procesar total memory
		totalParts := strings.Fields(memParts[1])
		if len(totalParts) > 0 {
			totalValue, _ = strconv.ParseFloat(strings.TrimRight(totalParts[0], "MiBGiB"), 64)
			totalUnit = strings.TrimLeft(totalParts[0], "0123456789.")
			// Convertir MiB a MB y GiB a GB
			if totalUnit == "MiB" {
				totalUnit = "MB"
			} else if totalUnit == "GiB" {
				totalUnit = "GB"
			}
		}
	}

	// Procesar Network I/O
	netParts := strings.Split(container.NetIO, " / ")

	var netInValue, netOutValue float64
	var netInUnit, netOutUnit string

	if len(netParts) == 2 {
		// Procesar input
		inParts := strings.Fields(netParts[0])
		if len(inParts) > 0 {
			netInValue, _ = strconv.ParseFloat(strings.TrimRight(inParts[0], "kMGTB"), 64)
			netInUnit = strings.TrimLeft(inParts[0], "0123456789.")
		}

		// Procesar output
		outParts := strings.Fields(netParts[1])
		if len(outParts) > 0 {
			netOutValue, _ = strconv.ParseFloat(strings.TrimRight(outParts[0], "kMGTB"), 64)
			netOutUnit = strings.TrimLeft(outParts[0], "0123456789.")
		}
	}

	// Procesar Block I/O
	blockParts := strings.Split(container.BlockIO, " / ")

	var blockReadValue, blockWriteValue float64
	var blockReadUnit, blockWriteUnit string

	if len(blockParts) == 2 {
		// Procesar read
		readParts := strings.Fields(blockParts[0])
		if len(readParts) > 0 {
			blockReadValue, _ = strconv.ParseFloat(strings.TrimRight(readParts[0], "kMGTB"), 64)
			blockReadUnit = strings.TrimLeft(readParts[0], "0123456789.")
		}

		// Procesar write
		writeParts := strings.Fields(blockParts[1])
		if len(writeParts) > 0 {
			blockWriteValue, _ = strconv.ParseFloat(strings.TrimRight(writeParts[0], "kMGTB"), 64)
			blockWriteUnit = strings.TrimLeft(writeParts[0], "0123456789.")
		}
	}

	return &database.ContainerMetric{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		CPU:       cpu,
		Memory: database.MemoryMetric{
			Percentage: memPerc,
			Used:       usedValue,
			Total:      totalValue,
			UsedUnit:   usedUnit,
			TotalUnit:  totalUnit,
		},
		Network: database.NetworkMetric{
			Input:      netInValue,
			Output:     netOutValue,
			InputUnit:  netInUnit,
			OutputUnit: netOutUnit,
		},
		BlockIO: database.BlockIOMetric{
			Read:      blockReadValue,
			Write:     blockWriteValue,
			ReadUnit:  blockReadUnit,
			WriteUnit: blockWriteUnit,
		},
		Container: container.ID,
		ID:        container.ID,
		Name:      container.Name,
	}
}

func parseValue(value string) (float64, string) {
	parts := strings.Fields(value)
	if len(parts) < 1 {
		return 0, "B"
	}
	v, _ := strconv.ParseFloat(parts[0], 64)
	unit := strings.TrimLeft(value, "0123456789.")
	return v, unit
}
