import { describe, expect, it, vi } from "vitest";
import {
	setupCAdvisor,
	setupNodeExporter,
	setupPrometheus,
	setupPrometheusStack,
	stopPrometheusStack,
} from "../../../../packages/server/src/setup/prometheus-setup";

// Mock Docker and utilities
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	pullImage: vi.fn().mockResolvedValue(undefined),
	pullRemoteImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn().mockResolvedValue({
		getContainer: vi.fn().mockReturnValue({
			inspect: vi.fn().mockRejectedValue(new Error("Container not found")),
			remove: vi.fn().mockResolvedValue(undefined),
			start: vi.fn().mockResolvedValue(undefined),
		}),
		createContainer: vi.fn().mockResolvedValue({
			start: vi.fn().mockResolvedValue(undefined),
		}),
	}),
}));

describe("Prometheus Setup Integration", () => {
	describe("setupPrometheus", () => {
		it("should setup Prometheus successfully", async () => {
			await expect(setupPrometheus()).resolves.not.toThrow();
		});
	});

	describe("setupNodeExporter", () => {
		it("should setup Node Exporter successfully", async () => {
			await expect(setupNodeExporter()).resolves.not.toThrow();
		});
	});

	describe("setupCAdvisor", () => {
		it("should setup cAdvisor successfully", async () => {
			await expect(setupCAdvisor()).resolves.not.toThrow();
		});
	});

	describe("setupPrometheusStack", () => {
		it("should setup complete Prometheus stack", async () => {
			await expect(setupPrometheusStack()).resolves.not.toThrow();
		});
	});

	describe("stopPrometheusStack", () => {
		it("should stop Prometheus stack without errors", async () => {
			await expect(stopPrometheusStack()).resolves.not.toThrow();
		});
	});
});
