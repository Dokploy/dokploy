package main

import (
	"log"
	"os"
	"strconv"
	"time"

	"github.com/dokploy/monitoring/database"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
)

func getServerMetrics() database.ServerMetric {
	v, _ := mem.VirtualMemory()
	c, _ := cpu.Percent(0, false)
	cpuInfo, _ := cpu.Info()
	cpuModel := ""
	if len(cpuInfo) > 0 {
		cpuModel = cpuInfo[0].ModelName
	}

	return database.ServerMetric{
		Timestamp:   time.Now().Unix(),
		CPUUsage:    c[0],
		MemoryUsage: v.UsedPercent,
		MemoryTotal: v.Total,
		CPUModel:    cpuModel,
	}
}

func main() {
	godotenv.Load()

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

	// Get current metrics
	app.Get("/metrics/current", func(c *fiber.Ctx) error {
		metrics := getServerMetrics()
		return c.JSON(metrics)
	})

	// Get metrics in range
	app.Get("/metrics/range", func(c *fiber.Ctx) error {
		start := c.Query("start")
		end := c.Query("end")

		startTime, err := strconv.ParseInt(start, 10, 64)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": "Invalid start time",
			})
		}

		endTime, err := strconv.ParseInt(end, 10, 64)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": "Invalid end time",
			})
		}

		metrics, err := db.GetMetricsInRange(startTime, endTime)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "Failed to fetch metrics",
			})
		}

		return c.JSON(metrics)
	})

	// Get last N metrics
	app.Get("/metrics/last/:count", func(c *fiber.Ctx) error {
		count, err := strconv.Atoi(c.Params("count"))
		if err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": "Invalid count",
			})
		}

		metrics, err := db.GetLastNMetrics(count)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error": "Failed to fetch metrics",
			})
		}

		return c.JSON(metrics)
	})

	// Start metrics collection in background
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		for range ticker.C {
			metrics := getServerMetrics()
			log.Printf("Saving metrics: %v", metrics)
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
