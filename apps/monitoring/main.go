package main

import (
	"context"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
	"github.com/mauriciogm/dokploy/apps/monitoring/config"
	"github.com/mauriciogm/dokploy/apps/monitoring/containers"
	"github.com/mauriciogm/dokploy/apps/monitoring/database"
	"github.com/mauriciogm/dokploy/apps/monitoring/middleware"
	"github.com/mauriciogm/dokploy/apps/monitoring/monitoring"
	"github.com/mauriciogm/dokploy/apps/monitoring/tasks"
)

const dockerSocketPath = "/var/run/docker.sock"

func secondsOr(value, fallback int) time.Duration {
	if value <= 0 {
		value = fallback
	}
	return time.Duration(value) * time.Second
}

func main() {
	godotenv.Load()

	// Get configuration
	cfg := config.GetMetricsConfig()
	token := cfg.Server.Token
	METRICS_URL_CALLBACK := cfg.Server.UrlCallback

	if token == "" || METRICS_URL_CALLBACK == "" {
		log.Fatal("token and urlCallback are required in the configuration")
	}

	db, err := database.InitDB()
	if err != nil {
		log.Fatal(err)
	}

	// Iniciar el sistema de limpieza de métricas
	cleanupCron, err := database.StartMetricsCleanup(db.DB, cfg.Server.RetentionDays, cfg.Server.CronJob)
	if err != nil {
		log.Fatalf("Error starting metrics cleanup system: %v", err)
	}
	defer cleanupCron.Stop()

	app := fiber.New()

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok",
		})
	})

	app.Use(func(c *fiber.Ctx) error {
		if c.Path() == "/health" {
			return c.Next()
		}
		return middleware.AuthMiddleware()(c)
	})

	app.Get("/metrics", func(c *fiber.Ctx) error {
		limit := c.Query("limit", "50")

		var metrics []monitoring.SystemMetrics
		if limit == "all" {
			dbMetrics, err := db.GetAllMetrics()
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error": "Failed to fetch metrics",
				})
			}
			for _, m := range dbMetrics {
				metrics = append(metrics, monitoring.ConvertToSystemMetrics(m))
			}
		} else {
			n, err := strconv.Atoi(limit)
			if err != nil {
				n = 50
			}
			dbMetrics, err := db.GetLastNMetrics(n)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error": "Failed to fetch metrics",
				})
			}
			for _, m := range dbMetrics {
				metrics = append(metrics, monitoring.ConvertToSystemMetrics(m))
			}
		}

		return c.JSON(metrics)
	})

	// The panel's own /proc is the physical machine's, so it asks the agent for
	// the server's current CPU and memory instead of the last stored sample.
	app.Get("/metrics/live", func(c *fiber.Ctx) error {
		return c.JSON(monitoring.ConvertToSystemMetrics(monitoring.GetServerMetrics()))
	})

	containerMonitor, err := containers.NewContainerMonitor(db)
	if err != nil {
		log.Fatalf("Failed to create container monitor: %v", err)
	}
	if err := containerMonitor.Start(); err != nil {
		log.Fatalf("Failed to start container monitor: %v", err)
	}
	defer containerMonitor.Stop()

	port := cfg.Server.Port
	if port == 0 {
		port = 3001
	}

	if err := db.InitTaskMetricsTable(); err != nil {
		log.Fatalf("Failed to create task metrics table: %v", err)
	}
	dockerClient := tasks.NewDockerClient(dockerSocketPath)
	tasks.RegisterRoutes(app, db, tasks.NewCluster(dockerClient, db, port, token))
	if cfg.Tasks.Enabled {
		interval := secondsOr(cfg.Tasks.RefreshRate, 15)
		retentionHours := cfg.Tasks.RetentionHours
		if retentionHours <= 0 {
			retentionHours = 24
		}
		retention := time.Duration(retentionHours) * time.Hour
		go tasks.NewCollector(dockerClient, db, interval, retention).Run(context.Background())
		log.Printf("Collecting task metrics every %v", interval)
	}

	app.Get("/metrics/containers", func(c *fiber.Ctx) error {
		limit := c.Query("limit", "50")
		appName := c.Query("appName", "")

		if appName == "" {
			return c.JSON([]database.ContainerMetric{})
		}

		var metrics []database.ContainerMetric
		var err error

		if limit == "all" {
			metrics, err = db.GetAllMetricsContainer(appName)
		} else {
			limitNum, parseErr := strconv.Atoi(limit)
			if parseErr != nil {
				limitNum = 50
			}
			metrics, err = db.GetLastNContainerMetrics(appName, limitNum)
		}

		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "Error getting container metrics: " + err.Error(),
			})
		}

		return c.JSON(metrics)
	})

	go func() {
		refreshRate := cfg.Server.RefreshRate
		duration := time.Duration(refreshRate) * time.Second

		log.Printf("Refreshing server metrics every %v", duration)
		ticker := time.NewTicker(duration)
		defer ticker.Stop()

		for range ticker.C {
			metrics := monitoring.GetServerMetrics()
			if err := db.SaveMetric(metrics); err != nil {
				log.Printf("Error saving metrics: %v", err)
			}

			if tasks.IsAlertingNode(context.Background(), dockerClient) {
				if err := monitoring.CheckThresholds(metrics); err != nil {
					log.Printf("Error checking thresholds: %v", err)
				}
			}
		}
	}()

	log.Printf("Server starting on port %d", port)
	log.Fatal(app.Listen(":" + strconv.Itoa(port)))
}
