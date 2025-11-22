package main

import (
	"log"
	"os"
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
	prometheusExporter "github.com/mauriciogm/dokploy/apps/monitoring/prometheus"
)

func main() {
	godotenv.Load()

	// Get configuration
	cfg := config.GetMetricsConfig()
	token := cfg.Server.Token
	METRICS_URL_CALLBACK := cfg.Server.UrlCallback
	log.Printf("Environment variables:")
	log.Printf("METRICS_CONFIG: %s", os.Getenv("METRICS_CONFIG"))

	if token == "" || METRICS_URL_CALLBACK == "" {
		log.Fatal("token and urlCallback are required in the configuration")
	}

	db, err := database.InitDB()
	if err != nil {
		log.Fatal(err)
	}

	// Initialize Prometheus exporter if enabled
	var promExporter *prometheusExporter.PrometheusExporter
	if cfg.Server.Prometheus.Enabled {
		promExporter = prometheusExporter.NewPrometheusExporter(db)
		log.Printf("Prometheus metrics exporter enabled")
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

	// Prometheus metrics endpoint (no authentication required for scraping)
	if cfg.Server.Prometheus.Enabled {
		app.Get("/metrics/prometheus", func(c *fiber.Ctx) error {
			metricsText, err := promExporter.GetMetricsText()
			if err != nil {
				return c.Status(500).SendString("Error generating metrics: " + err.Error())
			}

			c.Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
			return c.SendString(metricsText)
		})
		log.Printf("Prometheus metrics endpoint available at /metrics/prometheus")
	}

	app.Use(func(c *fiber.Ctx) error {
		if c.Path() == "/health" {
			return c.Next()
		}
		if c.Path() == "/metrics/prometheus" && cfg.Server.Prometheus.Enabled {
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

	containerMonitor, err := containers.NewContainerMonitor(db)
	if err != nil {
		log.Fatalf("Failed to create container monitor: %v", err)
	}

	// Set Prometheus callback for container metrics if enabled
	if cfg.Server.Prometheus.Enabled && promExporter != nil {
		containerMonitor.SetMetricsCallback(func(metric *database.ContainerMetric) {
			promExporter.UpdateContainerMetrics(*metric)
		})
	}

	if err := containerMonitor.Start(); err != nil {
		log.Fatalf("Failed to start container monitor: %v", err)
	}
	defer containerMonitor.Stop()

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
			if saveErr := db.SaveMetric(metrics); saveErr != nil {
				log.Printf("Error saving metrics: %v", saveErr)
			}

			// Update Prometheus metrics if enabled
			if cfg.Server.Prometheus.Enabled && promExporter != nil {
				promExporter.UpdateServerMetrics(metrics, cfg.Server.ServerType)
			}

			if checkErr := monitoring.CheckThresholds(metrics); checkErr != nil {
				log.Printf("Error checking thresholds: %v", checkErr)
			}
		}
	}()

	port := cfg.Server.Port
	if port == 0 {
		port = 3001
	}

	log.Printf("Server starting on port %d", port)
	log.Fatal(app.Listen(":" + strconv.Itoa(port)))
}
