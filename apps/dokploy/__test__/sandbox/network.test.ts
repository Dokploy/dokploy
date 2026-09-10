import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn(),
}));

import {
	ensureSandboxNetwork,
	SANDBOX_NETWORK_OPTIONS,
} from "@dokploy/server/services/sandbox";

const notFound = () =>
	Object.assign(new Error("no such network"), { statusCode: 404 });

const createDocker = (inspect: () => Promise<unknown>) => {
	const remove = vi.fn(async () => undefined);
	const createNetwork = vi.fn(async () => undefined);
	const getNetwork = vi.fn(() => ({ inspect, remove }));
	return {
		docker: { getNetwork, createNetwork },
		remove,
		createNetwork,
		getNetwork,
	};
};

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("ensureSandboxNetwork", () => {
	it("creates an internal bridge without inter-container traffic for isolated mode", async () => {
		const { docker, createNetwork } = createDocker(async () => {
			throw notFound();
		});
		const name = await ensureSandboxNetwork(docker as never, "isolated");
		expect(name).toBe("dokploy-sandboxes-isolated");
		expect(createNetwork).toHaveBeenCalledWith(
			expect.objectContaining({
				Name: "dokploy-sandboxes-isolated",
				Driver: "bridge",
				Internal: true,
				Options: SANDBOX_NETWORK_OPTIONS,
			}),
		);
		expect(
			SANDBOX_NETWORK_OPTIONS["com.docker.network.bridge.enable_icc"],
		).toBe("false");
	});

	it("creates a non-internal bridge for internet mode", async () => {
		const { docker, createNetwork } = createDocker(async () => {
			throw notFound();
		});
		await ensureSandboxNetwork(docker as never, "internet");
		expect(createNetwork).toHaveBeenCalledWith(
			expect.objectContaining({
				Name: "dokploy-sandboxes",
				Internal: false,
				Options: SANDBOX_NETWORK_OPTIONS,
			}),
		);
	});

	it("reuses a network that already blocks inter-container traffic", async () => {
		const { docker, createNetwork, remove } = createDocker(async () => ({
			Options: SANDBOX_NETWORK_OPTIONS,
			Containers: {},
		}));
		await ensureSandboxNetwork(docker as never, "isolated");
		expect(createNetwork).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
	});

	it("recreates an unused legacy network that allows inter-container traffic", async () => {
		const { docker, createNetwork, remove } = createDocker(async () => ({
			Options: {},
			Containers: {},
		}));
		await ensureSandboxNetwork(docker as never, "isolated");
		expect(remove).toHaveBeenCalledTimes(1);
		expect(createNetwork).toHaveBeenCalledTimes(1);
	});

	it("keeps a legacy network that still has containers attached and warns", async () => {
		const { docker, createNetwork, remove } = createDocker(async () => ({
			Options: {},
			Containers: { abc: { Name: "dokploy-sandbox-x" } },
		}));
		await ensureSandboxNetwork(docker as never, "isolated");
		expect(remove).not.toHaveBeenCalled();
		expect(createNetwork).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalled();
	});

	it("tolerates a concurrent create of the same network", async () => {
		const { docker, createNetwork } = createDocker(async () => {
			throw notFound();
		});
		createNetwork.mockRejectedValueOnce(
			Object.assign(new Error("exists"), { statusCode: 409 }),
		);
		await expect(
			ensureSandboxNetwork(docker as never, "isolated"),
		).resolves.toBe("dokploy-sandboxes-isolated");
	});
});
