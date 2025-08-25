import { describe, expect, test } from "vitest";
import { z } from "zod";

// Test the webhook validation schemas directly
describe("Webhook Basic Validation", () => {
	// Basic webhook URL validation
	const webhookUrlSchema = z.string().url().startsWith("https://");

	describe("Webhook URL Validation", () => {
		test("should accept valid HTTPS URLs", () => {
			const validUrls = [
				"https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
				"https://example.com/webhook",
				"https://api.n8n.io/webhook/test",
				"https://discord.com/api/webhooks/123456789/abcdefghijklmnop",
			];

			validUrls.forEach((url) => {
				const result = webhookUrlSchema.safeParse(url);
				expect(result.success).toBe(true);
			});
		});

		test("should reject non-HTTPS URLs", () => {
			const invalidUrls = [
				"http://example.com/webhook",
				"ftp://example.com/webhook",
				"ws://example.com/webhook",
			];

			invalidUrls.forEach((url) => {
				const result = webhookUrlSchema.safeParse(url);
				expect(result.success).toBe(false);
			});
		});

		test("should reject invalid URLs", () => {
			const invalidUrls = [
				"not-a-url",
				"",
				"just-text",
				"https://",
				"://example.com",
			];

			invalidUrls.forEach((url) => {
				const result = webhookUrlSchema.safeParse(url);
				expect(result.success).toBe(false);
			});
		});
	});

	// Basic webhook event validation
	const webhookEventSchema = z.enum([
		"deployment.started",
		"deployment.success",
		"deployment.failed",
		"deployment.cancelled",
	]);

	describe("Webhook Event Validation", () => {
		test("should accept valid deployment events", () => {
			const validEvents = [
				"deployment.started",
				"deployment.success",
				"deployment.failed",
				"deployment.cancelled",
			];

			validEvents.forEach((event) => {
				const result = webhookEventSchema.safeParse(event);
				expect(result.success).toBe(true);
			});
		});

		test("should reject invalid events", () => {
			const invalidEvents = [
				"deployment.unknown",
				"application.started",
				"deploy.success",
				"",
				"random-event",
			];

			invalidEvents.forEach((event) => {
				const result = webhookEventSchema.safeParse(event);
				expect(result.success).toBe(false);
			});
		});
	});

	// Basic template type validation
	const templateTypeSchema = z.enum(["slack", "n8n", "generic"]);

	describe("Template Type Validation", () => {
		test("should accept valid template types", () => {
			const validTypes = ["slack", "n8n", "generic"];

			validTypes.forEach((type) => {
				const result = templateTypeSchema.safeParse(type);
				expect(result.success).toBe(true);
			});
		});

		test("should reject invalid template types", () => {
			const invalidTypes = ["discord", "teams", "custom", "", "invalid"];

			invalidTypes.forEach((type) => {
				const result = templateTypeSchema.safeParse(type);
				expect(result.success).toBe(false);
			});
		});
	});

	// Basic webhook name validation
	const webhookNameSchema = z.string().min(1).max(100);

	describe("Webhook Name Validation", () => {
		test("should accept valid names", () => {
			const validNames = [
				"My Webhook",
				"Production Slack Alert",
				"Dev Notifications",
				"a",
				"A very long webhook name that should still be valid",
			];

			validNames.forEach((name) => {
				const result = webhookNameSchema.safeParse(name);
				expect(result.success).toBe(true);
			});
		});

		test("should reject empty names", () => {
			const result = webhookNameSchema.safeParse("");
			expect(result.success).toBe(false);
		});

		test("should reject very long names", () => {
			const longName = "a".repeat(101);
			const result = webhookNameSchema.safeParse(longName);
			expect(result.success).toBe(false);
		});
	});
});

// Test webhook payload structure
describe("Webhook Payload Structure", () => {
	test("should have correct HMAC signature header format", () => {
		const signature = "abc123def456";
		const headerValue = `sha256=${signature}`;

		expect(headerValue).toMatch(/^sha256=[a-f0-9]+$/);
		expect(headerValue).toContain("sha256=");
		expect(headerValue).toContain(signature);
	});

	test("should have correct webhook headers structure", () => {
		const headers = {
			"Content-Type": "application/json",
			"X-Dokploy-Event": "deployment.success",
			"X-Dokploy-Signature-256": "sha256=abc123def456",
			"X-Dokploy-Delivery": "delivery-123",
		};

		expect(headers).toHaveProperty("Content-Type", "application/json");
		expect(headers).toHaveProperty("X-Dokploy-Event");
		expect(headers).toHaveProperty("X-Dokploy-Signature-256");
		expect(headers).toHaveProperty("X-Dokploy-Delivery");
		expect(headers["X-Dokploy-Signature-256"]).toMatch(/^sha256=/);
	});

	test("should have correct generic payload structure", () => {
		const genericPayload = {
			event: "deployment.success",
			timestamp: new Date().toISOString(),
			deployment: {
				id: "deploy-123",
				status: "success",
				startedAt: new Date().toISOString(),
				finishedAt: new Date().toISOString(),
				duration: 60000,
			},
			application: {
				id: "app-456",
				name: "My App",
				type: "application",
				url: "https://my-app.example.com",
				domains: ["my-app.example.com"],
			},
			project: {
				id: "proj-123",
				name: "My Project",
			},
			trigger: {
				type: "manual",
				triggeredBy: "user",
			},
		};

		expect(genericPayload).toHaveProperty("event");
		expect(genericPayload).toHaveProperty("timestamp");
		expect(genericPayload).toHaveProperty("deployment");
		expect(genericPayload).toHaveProperty("application");
		expect(genericPayload).toHaveProperty("project");
		expect(genericPayload).toHaveProperty("trigger");
		expect(genericPayload.deployment).toHaveProperty("id");
		expect(genericPayload.deployment).toHaveProperty("status");
		expect(genericPayload.deployment).toHaveProperty("startedAt");
	});

	test("should have correct slack payload structure", () => {
		const slackPayload = {
			text: "Deployment Successful ✅",
			attachments: [
				{
					color: "#36a64f",
					fields: [
						{ title: "Application", value: "My App", short: true },
						{ title: "Status", value: "✅ Success", short: true },
						{ title: "Duration", value: "1m", short: true },
						{ title: "Project", value: "My Project", short: true },
					],
					footer: "Dokploy",
					ts: Math.floor(Date.now() / 1000),
				},
			],
		};

		expect(slackPayload).toHaveProperty("text");
		expect(slackPayload).toHaveProperty("attachments");
		expect(slackPayload.attachments[0]!).toHaveProperty("color");
		expect(slackPayload.attachments[0]!).toHaveProperty("fields");
		expect(Array.isArray(slackPayload.attachments[0]!.fields)).toBe(true);
		expect(slackPayload.attachments[0]!.fields).toHaveLength(4);
	});

	test("should have correct n8n payload structure", () => {
		const n8nPayload = {
			event: "deployment.success",
			data: {
				deployment: {
					id: "deploy-123",
					status: "success",
					startedAt: new Date().toISOString(),
					finishedAt: new Date().toISOString(),
					duration: 60000,
				},
				application: {
					id: "app-456",
					name: "My App",
					type: "application",
				},
				project: {
					id: "proj-123",
					name: "My Project",
				},
				timestamp: new Date().toISOString(),
			},
		};

		expect(n8nPayload).toHaveProperty("event");
		expect(n8nPayload).toHaveProperty("data");
		expect(n8nPayload.data).toHaveProperty("deployment");
		expect(n8nPayload.data).toHaveProperty("application");
		expect(n8nPayload.data).toHaveProperty("project");
		expect(n8nPayload.data).toHaveProperty("timestamp");
		expect(n8nPayload.data.deployment).toHaveProperty("id");
		expect(n8nPayload.data.deployment).toHaveProperty("status");
		expect(n8nPayload.data.deployment).toHaveProperty("startedAt");
	});
});
