import { readPorts } from "@dokploy/server/services/settings";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/setup/traefik-setup", () => ({
	initializeStandaloneTraefik: vi.fn(),
	initializeTraefikService: vi.fn(),
}));

describe.each([undefined, "server-id"])(
	"readPorts (server: %s)",
	(serverId) => {
		const exec = serverId ? mocks.execAsyncRemote : mocks.execAsync;

		beforeEach(() => {
			vi.resetAllMocks();
		});

		it("returns no additional ports when standalone ports are unpublished", async () => {
			exec
				.mockResolvedValueOnce({ stdout: "standalone\n" })
				.mockResolvedValueOnce({
					stdout: JSON.stringify({ "80/tcp": null }),
				});

			await expect(readPorts("dokploy-traefik", serverId)).resolves.toEqual([]);
		});

		it("preserves published ports alongside unpublished standalone ports", async () => {
			exec
				.mockResolvedValueOnce({ stdout: "standalone\n" })
				.mockResolvedValueOnce({
					stdout: JSON.stringify({
						"80/tcp": null,
						"443/tcp": [{ HostIp: "0.0.0.0", HostPort: "443" }],
						"8080/tcp": [
							{ HostIp: "0.0.0.0", HostPort: "9080" },
							{ HostIp: "::", HostPort: "9080" },
						],
						"8443/udp": [{ HostIp: "0.0.0.0", HostPort: "9443" }],
					}),
				});

			await expect(readPorts("dokploy-traefik", serverId)).resolves.toEqual([
				{ targetPort: 8080, publishedPort: 9080, protocol: "tcp" },
				{ targetPort: 8443, publishedPort: 9443, protocol: "udp" },
			]);
		});

		it("returns no additional ports for empty standalone mappings", async () => {
			exec
				.mockResolvedValueOnce({ stdout: "standalone\n" })
				.mockResolvedValueOnce({
					stdout: JSON.stringify({ "8080/tcp": [] }),
				});

			await expect(readPorts("dokploy-traefik", serverId)).resolves.toEqual([]);
		});
	},
);
