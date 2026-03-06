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
)

var maxMetricsLimit = 2000

func init() {
	if v := os.Getenv("MAX_METRICS_LIMIT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxMetricsLimit = n
		}
	}
}

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
		before := c.Query("before", "")

		var metrics []monitoring.SystemMetrics
		var dbMetrics []database.ServerMetric
		var queryErr error

		if before != "" {
			cursor, parseErr := time.Parse(time.RFC3339Nano, before)
			if parseErr != nil {
				return c.Status(400).JSON(fiber.Map{
					"error": "Invalid 'before' timestamp format. Use RFC3339Nano.",
				})
			}
			n := 50
			if limit != "all" {
				if parsed, err := strconv.Atoi(limit); err == nil {
					n = parsed
				}
			}
			if n > maxMetricsLimit {
				n = maxMetricsLimit
			}
			dbMetrics, queryErr = db.GetMetricsBefore(cursor, n)
		} else if limit == "all" {
			log.Printf("DEPRECATION WARNING: limit=all is deprecated. Results capped at %d. Use pagination with 'before' parameter.", maxMetricsLimit)
			dbMetrics, queryErr = db.GetLastNMetrics(maxMetricsLimit)
		} else {
			n, err := strconv.Atoi(limit)
			if err != nil {
				n = 50
			}
			if n > maxMetricsLimit {
				n = maxMetricsLimit
			}
			dbMetrics, queryErr = db.GetLastNMetrics(n)
		}

		if queryErr != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "Failed to fetch metrics",
			})
		}

		for _, m := range dbMetrics {
			metrics = append(metrics, monitoring.ConvertToSystemMetrics(m))
		}

		// Report total count so clients know if results were truncated
		totalCount, _ := db.GetMetricsCount()
		c.Set("X-Total-Count", strconv.Itoa(totalCount))

		return c.JSON(metrics)
	})

	containerMonitor, err := containers.NewContainerMonitor(db)
	if err != nil {
		log.Fatalf("Failed to create container monitor: %v", err)
	}
	if err := containerMonitor.Start(); err != nil {
		log.Fatalf("Failed to start container monitor: %v", err)
	}
	defer containerMonitor.Stop()

	app.Get("/metrics/containers", func(c *fiber.Ctx) error {
		limit := c.Query("limit", "50")
		appName := c.Query("appName", "")
		before := c.Query("before", "")

		if appName == "" {
			return c.JSON([]database.ContainerMetric{})
		}

		var metrics []database.ContainerMetric
		var err error

		if before != "" {
			cursor, parseErr := time.Parse(time.RFC3339Nano, before)
			if parseErr != nil {
				return c.Status(400).JSON(fiber.Map{
					"error": "Invalid 'before' timestamp format. Use RFC3339Nano.",
				})
			}
			n := 50
			if limit != "all" {
				if parsed, pErr := strconv.Atoi(limit); pErr == nil {
					n = parsed
				}
			}
			if n > maxMetricsLimit {
				n = maxMetricsLimit
			}
			metrics, err = db.GetContainerMetricsBefore(appName, cursor, n)
		} else if limit == "all" {
			log.Printf("DEPRECATION WARNING: limit=all is deprecated for container metrics. Results capped at %d.", maxMetricsLimit)
			metrics, err = db.GetLastNContainerMetrics(appName, maxMetricsLimit)
		} else {
			limitNum, parseErr := strconv.Atoi(limit)
			if parseErr != nil {
				limitNum = 50
			}
			if limitNum > maxMetricsLimit {
				limitNum = maxMetricsLimit
			}
			metrics, err = db.GetLastNContainerMetrics(appName, limitNum)
		}

		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "Error getting container metrics: " + err.Error(),
			})
		}

		totalCount, _ := db.GetContainerMetricsCount(appName)
		c.Set("X-Total-Count", strconv.Itoa(totalCount))

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

			if err := monitoring.CheckThresholds(metrics); err != nil {
				log.Printf("Error checking thresholds: %v", err)
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
