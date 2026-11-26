import {
	canRunBlueGreen,
	rolloutBlueGreen,
} from "@dokploy/server/utils/docker/blue-green";
import { pointDomainsAt } from "@dokploy/server/utils/traefik/blue-green";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { switchMock, convergeMock } = vi.hoisted(() => ({
	switchMock: vi.fn(async () => true),
	convergeMock: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/blue-green", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/traefik/blue-green")
	>()),
	switchApplicationTraffic: switchMock,
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	waitForSwarmServiceConvergence: convergeMock,
}));

const config = (url: string): FileConfig => ({
	http: {
		routers: {},
		services: {
			"app-service-1": { loadBalancer: { servers: [{ url }] } },
			"other-service-1": {
				loadBalancer: { servers: [{ url: "http://app:80" }] },
			},
		},
	},
});

describe("pointDomainsAt", () => {
	it("moves only the host of the application's own services", () => {
		const c = config("http://app:3000");
		expect(pointDomainsAt(c, "app", "app-green")).toBe(true);
		const services = c.http?.services as Record<
			string,
			{ loadBalancer: { servers: { url: string }[] } }
		>;
		expect(services["app-service-1"]?.loadBalancer.servers[0]?.url).toBe(
			"http://app-green:3000",
		);
		expect(services["other-service-1"]?.loadBalancer.servers[0]?.url).toBe(
			"http://app:80",
		);
	});

	it("moves back from the twin and reports no change when already there", () => {
		const c = config("http://app-green:3000/x");
		expect(pointDomainsAt(c, "app", "app")).toBe(true);
		expect(pointDomainsAt(c, "app", "app")).toBe(false);
		const services = c.http?.services as Record<
			string,
			{ loadBalancer: { servers: { url: string }[] } }
		>;
		expect(services["app-service-1"]?.loadBalancer.servers[0]?.url).toBe(
			"http://app:3000/x",
		);
	});

	it("does not touch a different application whose name starts the same", () => {
		const c = config("http://app-two:3000");
		expect(pointDomainsAt(c, "app", "app-green")).toBe(false);
	});
});

describe("canRunBlueGreen", () => {
	const existing = (replicas: number) =>
		({ Spec: { Mode: { Replicated: { Replicas: replicas } } } }) as never;
	const settings = (replicas: number, ports = 0) =>
		({
			Mode: { Replicated: { Replicas: replicas } },
			EndpointSpec: { Ports: Array.from({ length: ports }, () => ({})) },
		}) as never;

	it("needs a running service and a replicated target", () => {
		expect(canRunBlueGreen({ existing: null, settings: settings(1) })).toBe(
			false,
		);
		expect(
			canRunBlueGreen({ existing: existing(0), settings: settings(1) }),
		).toBe(false);
		expect(
			canRunBlueGreen({ existing: existing(2), settings: settings(0) }),
		).toBe(false);
		expect(
			canRunBlueGreen({ existing: existing(2), settings: settings(2) }),
		).toBe(true);
	});

	it("falls back to a rolling update when ports are published", () => {
		expect(
			canRunBlueGreen({ existing: existing(1), settings: settings(1, 1) }),
		).toBe(false);
	});
});

describe("rolloutBlueGreen", () => {
	const makeDocker = (updateState: string) => {
		const removed: string[] = [];
		const state = { startedAt: "old" };
		const docker = {
			createService: vi.fn(async () => undefined),
			getService: vi.fn((name: string) => ({
				remove: async () => {
					removed.push(name);
				},
				inspect: async () => ({
					UpdateStatus: { State: updateState, StartedAt: state.startedAt },
				}),
			})),
		};
		const update = async () => {
			state.startedAt = "new";
		};
		return { docker, removed, update };
	};
	const settings = {
		Name: "app",
		TaskTemplate: {
			ContainerSpec: {
				Image: "app:1",
				Labels: { "dokploy.application.id": "x", keep: "me" },
			},
		},
	} as never;

	beforeEach(() => {
		switchMock.mockClear();
		convergeMock.mockClear();
		convergeMock.mockResolvedValue(undefined);
	});

	it("switches to the twin, updates the service, switches back, removes the twin", async () => {
		const { docker, removed, update } = makeDocker("completed");
		const order: string[] = [];
		switchMock.mockImplementation(async (...args: unknown[]) => {
			order.push(`switch:${args[2]}`);
			return true;
		});
		await rolloutBlueGreen({
			docker: docker as never,
			serverId: null,
			appName: "app",
			settings,
			updateService: async () => {
				order.push("update");
				await update();
			},
			settleMs: 0,
		});

		expect(order).toEqual([
			"switch:app",
			"switch:app-green",
			"update",
			"switch:app",
		]);
		expect(removed).toEqual(["app-green", "app-green"]);
		const [twin] = docker.createService.mock.calls[0] as unknown as [
			{
				Name: string;
				TaskTemplate: { ContainerSpec: { Labels: Record<string, string> } };
			},
		];
		expect(twin.Name).toBe("app-green");
		expect(twin.TaskTemplate.ContainerSpec.Labels).toEqual({ keep: "me" });
	});

	it("leaves traffic on the old version when the twin never becomes healthy", async () => {
		const { docker, removed } = makeDocker("completed");
		convergeMock.mockRejectedValue(new Error("did not converge"));
		const updateService = vi.fn();
		await expect(
			rolloutBlueGreen({
				docker: docker as never,
				serverId: null,
				appName: "app",
				settings,
				updateService,
				settleMs: 0,
			}),
		).rejects.toThrow("did not converge");

		expect(updateService).not.toHaveBeenCalled();
		expect(switchMock).not.toHaveBeenCalledWith("app", null, "app-green");
		expect(removed).toContain("app-green");
	});

	it("moves traffic back and removes the twin when the update rolls back", async () => {
		const { docker, removed, update } = makeDocker("rollback_completed");
		await expect(
			rolloutBlueGreen({
				docker: docker as never,
				serverId: null,
				appName: "app",
				settings,
				updateService: update,
				settleMs: 0,
			}),
		).rejects.toThrow("rollback_completed");

		expect(switchMock).toHaveBeenLastCalledWith("app", null, "app");
		expect(removed).toContain("app-green");
	});
});
