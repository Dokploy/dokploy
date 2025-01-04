package containers

type Container struct {
	BlockIO  string `json:"BlockIO"`
	CPUPerc  string `json:"CPUPerc"`
	ID       string `json:"ID"`
	MemPerc  string `json:"MemPerc"`
	MemUsage string `json:"MemUsage"`
	Name     string `json:"Name"`
	NetIO    string `json:"NetIO"`
}

type ContainerMetric struct {
	Timestamp string          `json:"timestamp"`
	CPU       float64         `json:"CPU"`
	Memory    MemoryMetric    `json:"Memory"`
	Network   NetworkMetric   `json:"Network"`
	BlockIO   BlockIOMetric   `json:"BlockIO"`
	Container string          `json:"Container"`
	ID        string          `json:"ID"`
	Name      string          `json:"Name"`
}

type MemoryMetric struct {
	Percentage float64 `json:"percentage"`
	Used       float64 `json:"used"`
	Total      float64 `json:"total"`
	Unit       string  `json:"unit"`
}

type NetworkMetric struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	InputUnit  string  `json:"inputUnit"`
	OutputUnit string  `json:"outputUnit"`
}

type BlockIOMetric struct {
	Read      float64 `json:"read"`
	Write     float64 `json:"write"`
	ReadUnit  string  `json:"readUnit"`
	WriteUnit string  `json:"writeUnit"`
}

type ContainerConfig struct {
	AppName      string `json:"appName"`
	MaxFileSizeMB int    `json:"maxFileSizeMB"`
}

type MonitoringConfig struct {
	IncludeServices []ContainerConfig `json:"includeServices"`
	ExcludeServices []ContainerConfig `json:"excludeServices"`
}
