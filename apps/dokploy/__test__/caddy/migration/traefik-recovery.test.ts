import { beforeEach, describe, expect, test, vi } from "vitest";

const execAsyncMock = vi.hoisted(() => vi.fn());
const execAsyncRemoteMock = vi.hoisted(() => vi.fn());
const initializeTraefikServiceMock = vi.hoisted(() => vi.fn());
const initializeStandaloneTraefikMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			compose: { findMany: vi.fn().mockResolvedValue([]) },
		},
	},
}));

vi.mock("@dokploy/server/setup/caddy-setup", () => ({
	initializeCaddyService: vi.fn(),
	initializeStandaloneCaddy: vi.fn(),
}));

vi.mock("@dokploy/server/setup/traefik-setup", () => ({
	initializeTraefikService: initializeTraefikServiceMock,
	initializeStandaloneTraefik: initializeStandaloneTraefikMock,
}));

import {
	ensureTraefikRunningFromSnapshot,
	getDockerResourceSnapshot,
} from "@dokploy/server/services/settings";

describe("Traefik rollback recovery", () => {
	let resourceTypes: Record<string, "service" | "standalone" | "unknown">;

	beforeEach(() => {
		vi.clearAllMocks();
		resourceTypes = {
			"dokploy-traefik": "unknown",
			dokploy: "service",
		};
		initializeTraefikServiceMock.mockImplementation(async () => {
			resourceTypes["dokploy-traefik"] = "service";
		});
		initializeStandaloneTraefikMock.mockImplementation(async () => {
			resourceTypes["dokploy-traefik"] = "standalone";
		});
		execAsyncMock.mockImplementation(async (command: string) => {
			const resourceName = command.match(/RESOURCE_NAME="([^"]+)"/)?.[1];
			if (resourceName) {
				return {
					stdout: `${resourceTypes[resourceName] ?? "unknown"}\n`,
					stderr: "",
				};
			}
			if (command.includes("docker start dokploy-traefik")) {
				throw new Error("No such container: dokploy-traefik");
			}
			if (command.includes("docker service inspect dokploy-traefik")) {
				return {
					stdout: JSON.stringify({ Replicated: { Replicas: 1 } }),
					stderr: "",
				};
			}
			if (command.includes("docker service ps dokploy-traefik")) {
				return { stdout: "Running 1 second ago\n", stderr: "" };
			}
			if (
				command.includes("docker container inspect dokploy-traefik") &&
				command.includes("'{{json .}}'")
			) {
				return {
					stdout: `${JSON.stringify({
						State: {
							Running: resourceTypes["dokploy-traefik"] === "standalone",
						},
						HostConfig: { Binds: [], RestartPolicy: { Name: "always" } },
						NetworkSettings: { Networks: { "dokploy-network": {} } },
						Config: { Labels: {} },
					})}\n`,
					stderr: "",
				};
			}
			if (
				command.includes("docker container inspect dokploy-traefik") &&
				command.includes(".State.Running")
			) {
				return { stdout: "true\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		});
		execAsyncRemoteMock.mockImplementation(execAsyncMock);
	});

	test("recreates missing standalone Traefik with captured snapshot metadata", async () => {
		await ensureTraefikRunningFromSnapshot({
			resourceName: "dokploy-traefik",
			resourceType: "standalone",
			running: true,
			env: "FOO=bar\nBAZ=qux",
			additionalPorts: [
				{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
			],
			image: "traefik:v3.7.1",
			binds: [
				"/etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml:ro",
				"/etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic",
				"/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json",
				"/var/run/docker.sock:/var/run/docker.sock:ro",
			],
			networks: ["dokploy-network"],
			labels: { "example.label": "preserved" },
			restartPolicy: { Name: "unless-stopped" },
		});

		expect(initializeStandaloneTraefikMock).toHaveBeenCalledWith({
			env: ["FOO=bar", "BAZ=qux"],
			additionalPorts: [
				{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
			],
			image: "traefik:v3.7.1",
			serverId: undefined,
			binds: [
				"/etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml:ro",
				"/etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic",
				"/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json",
				"/var/run/docker.sock:/var/run/docker.sock:ro",
			],
			networks: ["dokploy-network"],
			labels: { "example.label": "preserved" },
			serviceMounts: undefined,
			restartPolicy: { Name: "unless-stopped" },
			serviceNetworks: [],
			servicePlacement: undefined,
			serviceLabels: { "example.label": "preserved" },
			serviceEndpointPorts: undefined,
		});
		expect(initializeTraefikServiceMock).not.toHaveBeenCalled();
	});

	test("captures standalone Traefik binds and networks in rollback snapshot", async () => {
		resourceTypes["dokploy-traefik"] = "standalone";
		execAsyncMock.mockImplementation(async (command: string) => {
			const resourceName = command.match(/RESOURCE_NAME="([^"]+)"/)?.[1];
			if (resourceName) {
				return {
					stdout: `${resourceTypes[resourceName] ?? "unknown"}\n`,
					stderr: "",
				};
			}
			if (command.includes("docker container inspect dokploy-traefik")) {
				if (command.includes("'{{json .}}'")) {
					return {
						stdout: `${JSON.stringify({
							State: { Running: true },
							HostConfig: {
								Binds: [
									"/etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml:ro",
									"/etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic",
									"/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json",
									"/var/run/docker.sock:/var/run/docker.sock:ro",
								],
								RestartPolicy: { Name: "always" },
							},
							NetworkSettings: { Networks: { "dokploy-network": {} } },
							Config: { Labels: { "example.label": "preserved" } },
						})}\n`,
						stderr: "",
					};
				}
				if (command.includes(".Config.Image")) {
					return { stdout: "traefik:v3.7.1\n", stderr: "" };
				}
			}
			if (command.includes("docker container inspect dokploy-traefik")) {
				return { stdout: "{}\n", stderr: "" };
			}
			return { stdout: "[]\n", stderr: "" };
		});

		const snapshot = await getDockerResourceSnapshot("dokploy-traefik");

		expect(snapshot.binds).toEqual([
			"/etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml:ro",
			"/etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic",
			"/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json",
			"/var/run/docker.sock:/var/run/docker.sock:ro",
		]);
		expect(snapshot.networks).toEqual(["dokploy-network"]);
		expect(snapshot.labels).toEqual({ "example.label": "preserved" });
		expect(snapshot.restartPolicy).toEqual({ Name: "always" });
	});

	test("recreates missing Traefik service with captured service shape", async () => {
		await ensureTraefikRunningFromSnapshot({
			resourceName: "dokploy-traefik",
			resourceType: "service",
			running: false,
			replicas: 2,
			env: "FOO=bar",
			additionalPorts: [
				{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
			],
			image: "traefik:v3.7.1",
			mounts: [
				{
					Type: "bind",
					Source: "/etc/dokploy/traefik/acme.json",
					Target: "/letsencrypt/acme.json",
				},
			],
			networks: [{ Target: "dokploy-network" }],
			labels: { "service.label": "preserved" },
			containerLabels: { "container.label": "preserved" },
			placement: { Constraints: ["node.role==manager"] },
			endpointPorts: [
				{
					TargetPort: 443,
					PublishedPort: 443,
					Protocol: "tcp",
					PublishMode: "host",
				},
			],
		});

		expect(initializeTraefikServiceMock).toHaveBeenCalledWith(
			expect.objectContaining({
				env: ["FOO=bar"],
				replicas: 2,
				serviceMounts: [
					{
						Type: "bind",
						Source: "/etc/dokploy/traefik/acme.json",
						Target: "/letsencrypt/acme.json",
					},
				],
				serviceNetworks: [{ Target: "dokploy-network" }],
				serviceLabels: { "service.label": "preserved" },
				serviceContainerLabels: { "container.label": "preserved" },
				servicePlacement: { Constraints: ["node.role==manager"] },
				serviceEndpointPorts: [
					{
						TargetPort: 443,
						PublishedPort: 443,
						Protocol: "tcp",
						PublishMode: "host",
					},
				],
			}),
		);
	});

	test("falls back to generic setup when exact recreation fails", async () => {
		initializeStandaloneTraefikMock.mockRejectedValueOnce(
			new Error("stale mount"),
		);

		await ensureTraefikRunningFromSnapshot({
			resourceName: "dokploy-traefik",
			resourceType: "standalone",
			running: true,
			image: "traefik:v3.7.1",
		});

		expect(initializeStandaloneTraefikMock).toHaveBeenCalledOnce();
		expect(initializeTraefikServiceMock).toHaveBeenCalledWith(
			expect.objectContaining({ image: "traefik:v3.7.1" }),
		);
	});

	test("falls back to standalone recreation when no service shape can be inferred", async () => {
		resourceTypes.dokploy = "unknown";

		await ensureTraefikRunningFromSnapshot({
			resourceName: "dokploy-traefik",
			resourceType: "unknown",
			running: false,
		});

		expect(initializeStandaloneTraefikMock).toHaveBeenCalledWith({
			env: undefined,
			additionalPorts: [],
			image: undefined,
			serverId: undefined,
		});
	});
});
