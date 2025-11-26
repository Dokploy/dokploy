import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkPrometheusHealth,
	getCPUMetrics,
	getDiskMetrics,
	getMemoryMetrics,
	getNetworkMetrics,
	getSystemMetrics,
	queryPrometheus,
	queryPrometheusRange,
} from "../../../../packages/server/src/monitoring/prometheus-utils";

// Mock fetch
global.fetch = vi.fn();

// Mock findServerById
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn().mockResolvedValue({
		ipAddress: "192.168.1.100",
	}),
}));

describe("Prometheus Utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("queryPrometheus", () => {
		it("should query Prometheus successfully", async () => {
			const mockResponse = {
				status: "success",
				data: {
					resultType: "vector",
					result: [
						{
							metric: { __name__: "up", job: "prometheus" },
							value: [1234567890, "1"],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await queryPrometheus("up");
			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("http://localhost:9090/api/v1/query?query=up"),
			);
		});

		it("should handle query errors", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			});

			await expect(queryPrometheus("invalid_query")).rejects.toThrow(
				"Prometheus query failed: Internal Server Error",
			);
		});

		it("should use remote server URL when serverId is provided", async () => {
			const mockResponse = {
				status: "success",
				data: { resultType: "vector", result: [] },
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			await queryPrometheus("up", "server-123");
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("http://192.168.1.100:9090"),
			);
		});
	});

	describe("queryPrometheusRange", () => {
		it("should query Prometheus range successfully", async () => {
			const mockResponse = {
				status: "success",
				data: {
					resultType: "matrix",
					result: [
						{
							metric: { __name__: "up" },
							values: [
								[1234567890, "1"],
								[1234567900, "1"],
							],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await queryPrometheusRange(
				"up",
				"1234567890",
				"1234567900",
				"10s",
			);
			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("api/v1/query_range"),
			);
		});
	});

	describe("getCPUMetrics", () => {
		it("should get CPU metrics", async () => {
			const mockResponse = {
				status: "success",
				data: {
					resultType: "vector",
					result: [
						{
							metric: {},
							value: [1234567890, "25.5"],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await getCPUMetrics();
			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("node_cpu_seconds_total"),
			);
		});
	});

	describe("getMemoryMetrics", () => {
		it("should get memory metrics", async () => {
			const mockResponse = {
				status: "success",
				data: {
					resultType: "vector",
					result: [
						{
							metric: {},
							value: [1234567890, "65.2"],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await getMemoryMetrics();
			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("node_memory"),
			);
		});
	});

	describe("getDiskMetrics", () => {
		it("should get disk metrics", async () => {
			const mockResponse = {
				status: "success",
				data: {
					resultType: "vector",
					result: [
						{
							metric: {},
							value: [1234567890, "45.8"],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await getDiskMetrics();
			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("node_filesystem"),
			);
		});
	});

	describe("getNetworkMetrics", () => {
		it("should get network metrics", async () => {
			const mockReceiveResponse = {
				status: "success",
				data: {
					resultType: "vector",
					result: [
						{
							metric: {},
							value: [1234567890, "1024"],
						},
					],
				},
			};

			const mockTransmitResponse = {
				status: "success",
				data: {
					resultType: "vector",
					result: [
						{
							metric: {},
							value: [1234567890, "2048"],
						},
					],
				},
			};

			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockReceiveResponse,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockTransmitResponse,
				});

			const result = await getNetworkMetrics();
			expect(result.receive).toEqual(mockReceiveResponse);
			expect(result.transmit).toEqual(mockTransmitResponse);
		});
	});

	describe("getSystemMetrics", () => {
		it("should get all system metrics", async () => {
			const mockResponse = {
				status: "success",
				data: { resultType: "vector", result: [] },
			};

			// Mock 5 fetch calls: cpu, memory, disk, network receive, network transmit
			(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockResponse,
				});

			const result = await getSystemMetrics();
			expect(result).toHaveProperty("cpu");
			expect(result).toHaveProperty("memory");
			expect(result).toHaveProperty("disk");
			expect(result).toHaveProperty("network");
		});
	});

	describe("checkPrometheusHealth", () => {
		it("should return true when Prometheus is healthy", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: true,
			});

			const result = await checkPrometheusHealth();
			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith(
				"http://localhost:9090/-/healthy",
			);
		});

		it("should return false when Prometheus is unhealthy", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
			});

			const result = await checkPrometheusHealth();
			expect(result).toBe(false);
		});

		it("should return false when fetch fails", async () => {
			(global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

			const result = await checkPrometheusHealth();
			expect(result).toBe(false);
		});
	});
});
