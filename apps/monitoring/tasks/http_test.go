package tasks

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

func testApp(store Store, cluster *Cluster) *fiber.App {
	app := fiber.New()
	RegisterRoutes(app, store, cluster)
	return app
}

func TestTaskSamplesEndpoint(t *testing.T) {
	recent := time.Now().UTC().Add(-time.Minute).Truncate(time.Millisecond)
	store := &memoryStore{samples: []Sample{
		{Timestamp: recent, Service: "web", TaskID: "a"},
		{Timestamp: recent, Service: "api", TaskID: "b"},
		{Timestamp: recent.Add(-2 * time.Hour), Service: "web", TaskID: "old"},
	}}
	app := testApp(store, nil)

	resp, err := app.Test(httptest.NewRequest("GET", "/metrics/tasks?service=web", nil))
	if err != nil {
		t.Fatal(err)
	}
	var samples []Sample
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &samples); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
	if resp.StatusCode != 200 || len(samples) != 1 || samples[0].TaskID != "a" {
		t.Fatalf("status %d samples %+v; want only the recent web sample", resp.StatusCode, samples)
	}
	if got := resp.Header.Get(FeaturesHeader); got != "compose" {
		t.Fatalf("%s = %q; want compose", FeaturesHeader, got)
	}
}

func TestTaskSamplesEndpointValidatesInput(t *testing.T) {
	app := testApp(&memoryStore{}, nil)
	for _, target := range []string{
		"/metrics/tasks",
		"/metrics/tasks?service=web&since=yesterday",
		"/metrics/tasks?service=web&limit=0",
		"/metrics/tasks/cluster",
	} {
		resp, err := app.Test(httptest.NewRequest("GET", target, nil))
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != 400 {
			t.Fatalf("%s returned %d; want 400", target, resp.StatusCode)
		}
	}
}

func TestClusterEndpointOnAWorker(t *testing.T) {
	info := managerInfo("n1")
	info.Swarm.ControlAvailable = false
	app := testApp(&memoryStore{}, NewCluster(fakeNodes{info: info}, &memoryStore{}, 4500, "t"))
	resp, err := app.Test(httptest.NewRequest("GET", "/metrics/tasks/cluster?service=web", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 409 {
		t.Fatalf("status %d; want 409 from a worker", resp.StatusCode)
	}
}
