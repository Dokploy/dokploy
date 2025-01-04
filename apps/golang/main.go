package main

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
	"github.com/mauriciogm/dokploy/apps/golang/containers"
	"github.com/mauriciogm/dokploy/apps/golang/database"
	"github.com/mauriciogm/dokploy/apps/golang/monitoring"
)

func main() {
	godotenv.Load()

	// Print environment variables at startup
	log.Printf("Environment variables:")
	log.Printf("REFRESH_RATE_SERVER: %s", os.Getenv("REFRESH_RATE_SERVER"))
	log.Printf("CONTAINER_REFRESH_RATE: %s", os.Getenv("CONTAINER_REFRESH_RATE"))
	log.Printf("CONTAINER_MONITORING_CONFIG: %s", os.Getenv("CONTAINER_MONITORING_CONFIG"))

	// Initialize database
	db, err := database.InitDB()
	if err != nil {
		log.Fatal(err)
	}

	app := fiber.New()

	// CORS configuration
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// Health check endpoint
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok",
		})
	})

	// Get metrics endpoint (compatible with frontend)
	app.Get("/metrics", func(c *fiber.Ctx) error {
		limit := c.Query("limit", "50")

		var metrics []monitoring.SystemMetrics
		if limit == "all" {
			// Get all metrics
			dbMetrics, err := db.GetLastNMetrics(10000)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error": "Failed to fetch metrics",
				})
			}
			for _, m := range dbMetrics {
				metrics = append(metrics, monitoring.ConvertToSystemMetrics(m))
			}
		} else {
			// Get limited metrics
			n, err := strconv.Atoi(limit)
			if err != nil {
				n = 50 // default value
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

	// Iniciar el monitoreo de contenedores
	containerMonitor, err := containers.NewContainerMonitor(db)
	if err != nil {
		log.Fatalf("Failed to create container monitor: %v", err)
	}
	if err := containerMonitor.Start(); err != nil {
		log.Fatalf("Failed to start container monitor: %v", err)
	}
	defer containerMonitor.Stop()

	// Endpoint para obtener métricas de contenedores
	app.Get("/metrics/containers", func(c *fiber.Ctx) error {
		limit := c.Query("limit", "50")
		appName := c.Query("appName", "")

		limitNum, err := strconv.Atoi(limit)
		if err != nil {
			limitNum = 50
		}

		// log.Printf("Fetching container metrics for app: %s, limit: %d", appName, limitNum)
		var metrics []database.ContainerMetric
		if appName != "" {
			metrics, err = db.GetContainerMetrics(appName, limitNum)
		} else {
			metrics, err = db.GetAllContainerMetrics(limitNum)
		}

		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "Error getting container metrics: " + err.Error(),
			})
		}

		return c.JSON(metrics)
	})

	// Start metrics collection in background
	go func() {
		refreshRate := os.Getenv("REFRESH_RATE_SERVER")

		duration := 10 * time.Second // default value
		if refreshRate != "" {
			if seconds, err := strconv.Atoi(refreshRate); err == nil {
				duration = time.Duration(seconds) * time.Second
			} else {
				log.Printf("Invalid REFRESH_RATE_SERVER value, using default: %v", err)
			}
		}

		log.Printf("Refreshing server metrics every %v", duration)
		ticker := time.NewTicker(duration)
		for range ticker.C {
			metrics := monitoring.GetServerMetrics()
			// log.Printf("Saving metrics: %v", metrics)
			if err := db.SaveMetric(metrics); err != nil {
				log.Printf("Error saving metrics: %v", err)
			}
		}
	}()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(app.Listen(":" + port))
}
