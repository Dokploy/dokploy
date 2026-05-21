import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

// Mock fs for readSecret tests
vi.mock("node:fs");

// Mock dockerode to verify service settings
const mockCreateService = vi.fn().mockResolvedValue({});
const mockGetService = vi.fn().mockReturnValue({
	inspect: vi.fn().mockRejectedValue(new Error("Not found")),
	update: vi.fn().mockResolvedValue({}),
});

vi.mock("dockerode", () => {
	return {
		default: vi.fn().mockImplementation(function() {
			return {
				createService: mockCreateService,
				getService: mockGetService,
				pull: vi.fn().mockResolvedValue({}),
			};
		}),
	};
});

describe("redis-connection", () => {
	afterEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	it("should use REDIS_URL if provided", async () => {
		vi.stubEnv("REDIS_URL", "redis://user:pass@remote-host:6379/1");
		
		const { redisConfig } = await import("../../server/queues/redis-connection");
		
		expect(redisConfig).toEqual({
			url: "redis://user:pass@remote-host:6379/1",
		});
	}, 30000);

	it("should use individual env vars if REDIS_URL is not provided", async () => {
		vi.stubEnv("REDIS_HOST", "custom-host");
		vi.stubEnv("REDIS_PORT", "1234");
		vi.stubEnv("REDIS_DB_INDEX", "2");
		vi.stubEnv("REDIS_PASSWORD", "secret");
		vi.stubEnv("REDIS_USERNAME", "admin");

		const { redisConfig } = await import("../../server/queues/redis-connection");

		expect(redisConfig).toEqual({
			host: "custom-host",
			port: 1234,
			db: 2,
			password: "secret",
			username: "admin",
		});
	});

	it("should read password from REDIS_PASSWORD_FILE if provided", async () => {
		vi.stubEnv("REDIS_PASSWORD_FILE", "/tmp/password.txt");
		vi.mocked(fs.readFileSync).mockReturnValue("file-secret\n");

		const { redisConfig } = await import("../../server/queues/redis-connection");

		expect(redisConfig.password).toBe("file-secret");
		expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/password.txt", "utf8");
	});

	it("should fallback to defaults in development", async () => {
		vi.stubEnv("NODE_ENV", "development");

		const { redisConfig } = await import("../../server/queues/redis-connection");

		expect(redisConfig).toEqual({
			host: "127.0.0.1",
			port: 6379,
			db: 0,
		});
	});

	it("should fallback to production defaults", async () => {
		vi.stubEnv("NODE_ENV", "production");

		const { redisConfig } = await import("../../server/queues/redis-connection");

		expect(redisConfig).toEqual({
			host: "dokploy-redis",
			port: 6379,
			db: 0,
		});
	});

	it("should verify initializeRedis creates service with correct Command and Args when password is set", async () => {
		vi.stubEnv("REDIS_PASSWORD", "test-pass");
		vi.stubEnv("NODE_ENV", "production");
		
		// We need to import initializeRedis AFTER stubbing the env
		const { initializeRedis } = await import("@dokploy/server/setup/redis-setup");
		
		await initializeRedis();
		
		expect(mockCreateService).toHaveBeenCalledWith(expect.objectContaining({
			TaskTemplate: expect.objectContaining({
				ContainerSpec: expect.objectContaining({
					Command: ["redis-server"],
					Args: ["--requirepass", "test-pass"],
				})
			})
		}));
	}, 30000);
});
