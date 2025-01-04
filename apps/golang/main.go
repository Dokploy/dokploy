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
	"github.com/mauriciogm/dokploy/apps/golang/middleware"
	"github.com/mauriciogm/dokploy/apps/golang/monitoring"
)

func main() {
	godotenv.Load()

	log.Printf("Environment variables:")
	log.Printf("REFRESH_RATE_SERVER: %s", os.Getenv("REFRESH_RATE_SERVER"))
	log.Printf("CONTAINER_REFRESH_RATE: %s", os.Getenv("CONTAINER_REFRESH_RATE"))
	log.Printf("CONTAINER_MONITORING_CONFIG: %s", os.Getenv("CONTAINER_MONITORING_CONFIG"))

	token := os.Getenv("METRICS_TOKEN")
	METRICS_URL_CALLBACK := os.Getenv("METRICS_URL_CALLBACK")
	if token == "" || METRICS_URL_CALLBACK == "" {
		log.Fatal("METRICS_TOKEN and METRICS_URL_CALLBACK environment variables are required")
	}

	db, err := database.InitDB()
	if err != nil {
		log.Fatal(err)
	}

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
	if err := containerMonitor.Start(); err != nil {
		log.Fatalf("Failed to start container monitor: %v", err)
	}
	defer containerMonitor.Stop()

	app.Get("/metrics/containers", func(c *fiber.Ctx) error {
		limit := c.Query("limit", "50")
		appName := c.Query("appName", "")

		limitNum, err := strconv.Atoi(limit)
		if err != nil {
			limitNum = 50
		}

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

	go func() {
		refreshRate := os.Getenv("REFRESH_RATE_SERVER")
		duration := 10 * time.Second
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
