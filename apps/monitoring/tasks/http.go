package tasks

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

// FeaturesHeader lists what this agent collects beyond swarm tasks, so Dokploy
// can tell an agent that predates a feature from one with no data yet.
const (
	FeaturesHeader = "X-Dokploy-Agent-Features"
	features       = "compose"
)

const (
	defaultWindow = time.Hour
	defaultLimit  = 5000
	maxLimit      = 20000
)

type query struct {
	service string
	since   time.Time
	limit   int
}

func parseQuery(c *fiber.Ctx, now time.Time) (query, error) {
	parsed := query{
		service: c.Query("service"),
		since:   now.Add(-defaultWindow),
		limit:   defaultLimit,
	}
	if parsed.service == "" {
		return query{}, errors.New("service is required")
	}
	if raw := c.Query("since"); raw != "" {
		since, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return query{}, errors.New("since must be an RFC 3339 timestamp")
		}
		parsed.since = since
	}
	if raw := c.Query("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 {
			return query{}, errors.New("limit must be a positive number")
		}
		parsed.limit = min(limit, maxLimit)
	}
	return parsed, nil
}

// RegisterRoutes adds the task metric endpoints. They must be registered after
// the token middleware so they share its protection.
func RegisterRoutes(app *fiber.App, store Store, cluster *Cluster) {
	app.Get("/metrics/tasks", func(c *fiber.Ctx) error {
		c.Set(FeaturesHeader, features)
		q, err := parseQuery(c, time.Now())
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		samples, err := store.TaskSamples(q.service, q.since, q.limit)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		if samples == nil {
			samples = []Sample{}
		}
		return c.JSON(samples)
	})

	app.Get("/metrics/tasks/cluster", func(c *fiber.Ctx) error {
		c.Set(FeaturesHeader, features)
		q, err := parseQuery(c, time.Now())
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		result, err := cluster.Samples(c.UserContext(), q.service, q.since, q.limit)
		if errors.Is(err, ErrNotManager) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
		}
		if err != nil {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
		}
		return c.JSON(result)
	})
}
