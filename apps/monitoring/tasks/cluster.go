package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"sync"
	"time"
)

var ErrNotManager = errors.New("this node is not a swarm manager")

type NodeResult struct {
	NodeID    string `json:"nodeId"`
	Hostname  string `json:"hostname"`
	Reachable bool   `json:"reachable"`
	Samples   int    `json:"samples"`
	Error     string `json:"error,omitempty"`
}

type ClusterResult struct {
	Samples []Sample     `json:"samples"`
	Nodes   []NodeResult `json:"nodes"`
	// Partial is set when a ready node's agent could not be read, so the
	// samples may be missing replicas that are running.
	Partial bool `json:"partial"`
}

// Cluster answers for the whole swarm from a manager: each node only sees its
// own containers, so the manager asks every node's agent and merges the results.
type Cluster struct {
	nodes       NodeSource
	local       Store
	port        int
	token       string
	client      *http.Client
	concurrency int
}

func NewCluster(nodes NodeSource, local Store, port int, token string) *Cluster {
	return &Cluster{
		nodes:       nodes,
		local:       local,
		port:        port,
		token:       token,
		client:      &http.Client{Timeout: 3 * time.Second},
		concurrency: 8,
	}
}

// peerAddress prefers the node's data address; a manager may report 0.0.0.0
// there, in which case its manager address is used.
func peerAddress(node Node) string {
	address := node.Status.Addr
	if (address == "" || address == "0.0.0.0") && node.ManagerStatus != nil {
		if host, _, err := net.SplitHostPort(node.ManagerStatus.Addr); err == nil {
			address = host
		}
	}
	return address
}

func (c *Cluster) fetchPeer(ctx context.Context, address, service string, since time.Time, limit int) ([]Sample, error) {
	query := url.Values{
		"service": {service},
		"since":   {since.UTC().Format(time.RFC3339Nano)},
		"limit":   {strconv.Itoa(limit)},
	}
	target := fmt.Sprintf("http://%s/metrics/tasks?%s",
		net.JoinHostPort(address, strconv.Itoa(c.port)), query.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return nil, fmt.Errorf("%s: %s", resp.Status, body)
	}
	var samples []Sample
	if err := json.NewDecoder(resp.Body).Decode(&samples); err != nil {
		return nil, err
	}
	return samples, nil
}

func (c *Cluster) Samples(ctx context.Context, service string, since time.Time, limit int) (ClusterResult, error) {
	info, err := c.nodes.Info(ctx)
	if err != nil {
		return ClusterResult{}, err
	}
	if !info.Swarm.ControlAvailable {
		return ClusterResult{}, ErrNotManager
	}
	nodes, err := c.nodes.Nodes(ctx)
	if err != nil {
		return ClusterResult{}, err
	}

	results := make([]NodeResult, len(nodes))
	collected := make([][]Sample, len(nodes))
	semaphore := make(chan struct{}, c.concurrency)
	var wg sync.WaitGroup
	for i, node := range nodes {
		results[i] = NodeResult{NodeID: node.ID, Hostname: node.Description.Hostname}
		// Swarm moves tasks off nodes that are down, so their agents have
		// nothing current to report.
		if node.Status.State != "ready" {
			results[i].Error = "node is " + node.Status.State
			continue
		}
		wg.Add(1)
		go func(i int, node Node) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			var samples []Sample
			var err error
			if node.ID == info.Swarm.NodeID {
				samples, err = c.local.TaskSamples(service, since, limit)
			} else {
				samples, err = c.fetchPeer(ctx, peerAddress(node), service, since, limit)
			}
			if err != nil {
				results[i].Error = err.Error()
				return
			}
			results[i].Reachable = true
			results[i].Samples = len(samples)
			collected[i] = samples
		}(i, node)
	}
	wg.Wait()

	merged := ClusterResult{Samples: []Sample{}, Nodes: results}
	for i, result := range results {
		if !result.Reachable && nodes[i].Status.State == "ready" {
			merged.Partial = true
		}
		merged.Samples = append(merged.Samples, collected[i]...)
	}
	sort.SliceStable(merged.Samples, func(a, b int) bool {
		return merged.Samples[a].Timestamp.Before(merged.Samples[b].Timestamp)
	})
	return merged, nil
}

// IsAlertingNode reports whether this agent should send threshold alerts. The
// agent runs on every node, but alerts are attributed to the server as a whole,
// so only the swarm leader sends them; outside a swarm it behaves as before.
func IsAlertingNode(ctx context.Context, nodes NodeSource) bool {
	info, err := nodes.Info(ctx)
	if err != nil || info.Swarm.LocalNodeState != "active" {
		return true
	}
	if !info.Swarm.ControlAvailable {
		return false
	}
	all, err := nodes.Nodes(ctx)
	if err != nil {
		return true
	}
	for _, node := range all {
		if node.ID == info.Swarm.NodeID {
			return node.ManagerStatus != nil && node.ManagerStatus.Leader
		}
	}
	return true
}
