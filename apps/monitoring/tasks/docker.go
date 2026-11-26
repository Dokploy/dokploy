package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

const (
	labelServiceName = "com.docker.swarm.service.name"
	labelTaskID      = "com.docker.swarm.task.id"
	labelTaskName    = "com.docker.swarm.task.name"
	labelNodeID      = "com.docker.swarm.node.id"

	labelComposeProject = "com.docker.compose.project"
	labelComposeService = "com.docker.compose.service"
	labelComposeNumber  = "com.docker.compose.container-number"
	labelComposeOneoff  = "com.docker.compose.oneoff"
)

type ContainerSummary struct {
	ID     string            `json:"Id"`
	Labels map[string]string `json:"Labels"`
}

type RawStats struct {
	Read     time.Time `json:"read"`
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

type EngineInfo struct {
	Swarm struct {
		NodeID           string `json:"NodeID"`
		LocalNodeState   string `json:"LocalNodeState"`
		ControlAvailable bool   `json:"ControlAvailable"`
	} `json:"Swarm"`
}

type Node struct {
	ID          string `json:"ID"`
	Description struct {
		Hostname string `json:"Hostname"`
	} `json:"Description"`
	Status struct {
		State string `json:"State"`
		Addr  string `json:"Addr"`
	} `json:"Status"`
	ManagerStatus *struct {
		Addr   string `json:"Addr"`
		Leader bool   `json:"Leader"`
	} `json:"ManagerStatus"`
}

type ContainerSource interface {
	ListRunningContainers(ctx context.Context) ([]ContainerSummary, error)
	ContainerStats(ctx context.Context, id string) (RawStats, error)
}

type NodeSource interface {
	Info(ctx context.Context) (EngineInfo, error)
	Nodes(ctx context.Context) ([]Node, error)
}

// DockerClient talks to the local Engine API over its unix socket. The
// collector needs structured stats and swarm labels, which the text output of
// `docker stats` does not carry.
type DockerClient struct {
	http *http.Client
}

func NewDockerClient(socketPath string) *DockerClient {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var dialer net.Dialer
			return dialer.DialContext(ctx, "unix", socketPath)
		},
	}
	return &DockerClient{http: &http.Client{Transport: transport, Timeout: 10 * time.Second}}
}

func (c *DockerClient) get(ctx context.Context, path string, query url.Values, out any) error {
	target := "http://docker" + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("docker %s: %s: %s", path, resp.Status, body)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// ListRunningContainers returns every running container. Swarm tasks and
// Docker Compose replicas carry different labels, and the Engine API ANDs
// label filters, so the collector picks its containers from the full list.
func (c *DockerClient) ListRunningContainers(ctx context.Context) ([]ContainerSummary, error) {
	filters, err := json.Marshal(map[string][]string{
		"status": {"running"},
	})
	if err != nil {
		return nil, err
	}
	var containers []ContainerSummary
	err = c.get(ctx, "/containers/json", url.Values{"filters": {string(filters)}}, &containers)
	return containers, err
}

// ContainerStats reads one sample without waiting for a second one, so a
// stats call costs milliseconds instead of a second per container. CPU usage is
// derived from the difference between consecutive collector ticks instead.
func (c *DockerClient) ContainerStats(ctx context.Context, id string) (RawStats, error) {
	var stats RawStats
	err := c.get(ctx, "/containers/"+url.PathEscape(id)+"/stats",
		url.Values{"stream": {"false"}, "one-shot": {"true"}}, &stats)
	return stats, err
}

func (c *DockerClient) Info(ctx context.Context) (EngineInfo, error) {
	var info EngineInfo
	err := c.get(ctx, "/info", nil, &info)
	return info, err
}

func (c *DockerClient) Nodes(ctx context.Context) ([]Node, error) {
	var nodes []Node
	err := c.get(ctx, "/nodes", nil, &nodes)
	return nodes, err
}
