package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/mauriciogm/dokploy/apps/monitoring/config"
)

func AuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		expectedToken := config.GetMetricsConfig().Server.Token

		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(401).JSON(fiber.Map{
				"error": "Authorization header is required",
			})
		}

		// Check if the header starts with "Bearer "
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(401).JSON(fiber.Map{
				"error": "Invalid authorization format. Use 'Bearer TOKEN'",
			})
		}

		// Extract the token
		token := strings.TrimPrefix(authHeader, "Bearer ")

		if token != expectedToken {
			return c.Status(401).JSON(fiber.Map{
				"error": "Invalid token",
			})
		}

		return c.Next()
	}
}
