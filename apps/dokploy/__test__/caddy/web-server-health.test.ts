import { beforeEach, expect, test, vi } from "vitest";

const dockerMock = vi.hoisted(() => ({
	getContainer: vi.fn(),
	getService: vi.fn(),
	listTasks: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	docker: dockerMock,
	paths: vi.fn(() => ({})),
}));

import {
	checkTraefikHealth,
	checkWebServerHealth,
} from "@dokploy/server/utils/docker/utils";

beforeEach(() => {
	vi.clearAllMocks();
	dockerMock.getContainer.mockReturnValue({
		inspect: vi.fn().mockResolvedValue({ State: { Running: true } }),
	});
	dockerMock.getService.mockReturnValue({
		inspect: vi.fn().mockResolvedValue({
			Spec: { Mode: { Replicated: { Replicas: 1 } } },
		}),
	});
	dockerMock.listTasks.mockResolvedValue([
		{
			Status: {
				State: "running",
				ContainerStatus: { ContainerID: "container-1" },
			},
		},
	]);
});

test("checks the Caddy resource when the active web server provider is Caddy", async () => {
	const result = await checkWebServerHealth("caddy");

	expect(result).toEqual({ provider: "caddy", status: "healthy" });
	expect(dockerMock.getContainer).toHaveBeenCalledWith("dokploy-caddy");
	expect(dockerMock.getService).not.toHaveBeenCalled();
});

test("checks the Traefik resource when the active web server provider is Traefik", async () => {
	const result = await checkWebServerHealth("traefik");

	expect(result).toEqual({ provider: "traefik", status: "healthy" });
	expect(dockerMock.getContainer).toHaveBeenCalledWith("dokploy-traefik");
});

test("falls back to the active Caddy swarm service when no standalone Caddy container exists", async () => {
	dockerMock.getContainer.mockReturnValueOnce({
		inspect: vi.fn().mockRejectedValue(new Error("missing container")),
	});

	const result = await checkWebServerHealth("caddy");

	expect(result).toEqual({ provider: "caddy", status: "healthy" });
	expect(dockerMock.getService).toHaveBeenCalledWith("dokploy-caddy");
	expect(dockerMock.listTasks).toHaveBeenCalledWith({
		filters: JSON.stringify({
			service: ["dokploy-caddy"],
			"desired-state": ["running"],
		}),
	});
});

test("keeps the Traefik-specific helper on the Traefik resource", async () => {
	dockerMock.getContainer.mockReturnValueOnce({
		inspect: vi.fn().mockResolvedValue({ State: { Running: false } }),
	});

	const result = await checkTraefikHealth();

	expect(result).toEqual({
		status: "unhealthy",
		message: "Container is not running",
	});
	expect(dockerMock.getContainer).toHaveBeenCalledWith("dokploy-traefik");
});
