package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"
)

type fakeNodes struct {
	info  EngineInfo
	nodes []Node
	err   error
}

func (f fakeNodes) Info(context.Context) (EngineInfo, error) { return f.info, f.err }
func (f fakeNodes) Nodes(context.Context) ([]Node, error)    { return f.nodes, f.err }

func managerInfo(nodeID string) EngineInfo {
	var info EngineInfo
	info.Swarm.NodeID = nodeID
	info.Swarm.LocalNodeState = "active"
	info.Swarm.ControlAvailable = true
	return info
}

func node(id, state, addr string) Node {
	var n Node
	n.ID = id
	n.Description.Hostname = "host-" + id
	n.Status.State = state
	n.Status.Addr = addr
	return n
}

func TestClusterMergesLocalAndPeerSamples(t *testing.T) {
	t0 := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	var seenAuth, seenService string
	peer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		seenService = r.URL.Query().Get("service")
		_ = json.NewEncoder(w).Encode([]Sample{{Timestamp: t0, Service: "web", TaskID: "remote", NodeID: "n2"}})
	}))
	defer peer.Close()
	peerURL, _ := url.Parse(peer.URL)
	host, portText, _ := net.SplitHostPort(peerURL.Host)
	port, _ := strconv.Atoi(portText)

	local := &memoryStore{samples: []Sample{{Timestamp: t0.Add(time.Second), Service: "web", TaskID: "local", NodeID: "n1"}}}
	cluster := NewCluster(fakeNodes{
		info:  managerInfo("n1"),
		nodes: []Node{node("n1", "ready", "10.0.0.1"), node("n2", "ready", host)},
	}, local, port, "secret")

	result, err := cluster.Samples(context.Background(), "web", t0.Add(-time.Hour), 100)
	if err != nil {
		t.Fatal(err)
	}
	if result.Partial || len(result.Samples) != 2 {
		t.Fatalf("result = %+v; want two samples and not partial", result)
	}
	if result.Samples[0].TaskID != "remote" || result.Samples[1].TaskID != "local" {
		t.Fatalf("samples not ordered by time: %+v", result.Samples)
	}
	if seenAuth != "Bearer secret" || seenService != "web" {
		t.Fatalf("peer saw auth %q and service %q", seenAuth, seenService)
	}
}

func TestClusterReportsUnreachableAndDownNodes(t *testing.T) {
	closed := httptest.NewServer(http.NotFoundHandler())
	closedURL, _ := url.Parse(closed.URL)
	host, portText, _ := net.SplitHostPort(closedURL.Host)
	port, _ := strconv.Atoi(portText)
	closed.Close()

	cluster := NewCluster(fakeNodes{
		info: managerInfo("n1"),
		nodes: []Node{
			node("n1", "ready", "10.0.0.1"),
			node("n2", "ready", host),
			node("n3", "down", "10.0.0.3"),
		},
	}, &memoryStore{}, port, "secret")

	result, err := cluster.Samples(context.Background(), "web", time.Now().Add(-time.Hour), 100)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Partial {
		t.Fatal("an unreachable ready node must make the result partial")
	}
	byID := map[string]NodeResult{}
	for _, n := range result.Nodes {
		byID[n.NodeID] = n
	}
	if !byID["n1"].Reachable || byID["n2"].Reachable || byID["n2"].Error == "" {
		t.Fatalf("node results = %+v", result.Nodes)
	}
	if byID["n3"].Reachable || byID["n3"].Error != "node is down" {
		t.Fatalf("down node result = %+v", byID["n3"])
	}
}

func TestClusterRequiresAManager(t *testing.T) {
	info := managerInfo("n1")
	info.Swarm.ControlAvailable = false
	_, err := NewCluster(fakeNodes{info: info}, &memoryStore{}, 4500, "t").
		Samples(context.Background(), "web", time.Now(), 10)
	if !errors.Is(err, ErrNotManager) {
		t.Fatalf("err = %v; want ErrNotManager", err)
	}
}

func TestPeerAddressFallsBackToManagerAddress(t *testing.T) {
	n := node("n1", "ready", "0.0.0.0")
	n.ManagerStatus = &struct {
		Addr   string `json:"Addr"`
		Leader bool   `json:"Leader"`
	}{Addr: "10.0.0.5:2377"}
	if got := peerAddress(n); got != "10.0.0.5" {
		t.Fatalf("peerAddress = %q; want 10.0.0.5", got)
	}
}

func TestIsAlertingNode(t *testing.T) {
	leader := node("n1", "ready", "10.0.0.1")
	leader.ManagerStatus = &struct {
		Addr   string `json:"Addr"`
		Leader bool   `json:"Leader"`
	}{Leader: true}
	follower := node("n2", "ready", "10.0.0.2")
	follower.ManagerStatus = &struct {
		Addr   string `json:"Addr"`
		Leader bool   `json:"Leader"`
	}{}

	if !IsAlertingNode(context.Background(), fakeNodes{info: managerInfo("n1"), nodes: []Node{leader, follower}}) {
		t.Fatal("the leader should alert")
	}
	if IsAlertingNode(context.Background(), fakeNodes{info: managerInfo("n2"), nodes: []Node{leader, follower}}) {
		t.Fatal("a follower manager should not alert")
	}
	worker := managerInfo("n3")
	worker.Swarm.ControlAvailable = false
	if IsAlertingNode(context.Background(), fakeNodes{info: worker}) {
		t.Fatal("a worker should not alert")
	}
	if !IsAlertingNode(context.Background(), fakeNodes{err: errors.New("no docker")}) {
		t.Fatal("outside a swarm the agent keeps alerting as before")
	}
}
