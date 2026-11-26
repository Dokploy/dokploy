import { getStackServiceCapacity } from "@dokploy/server/services/scaling/capacity-service";
import { describe, expect, it, vi } from "vitest";

const { getRemoteDockerMock } = vi.hoisted(() => ({
	getRemoteDockerMock: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const node = (id: string) => ({
	ID: id,
	Description: {
		Hostname: id,
		Resources: { NanoCPUs: 2e9, MemoryBytes: 4 * 1024 ** 3 },
	},
	Spec: { Role: "worker", Availability: "active" },
	Status: { State: "ready" },
});

const capacityFor = (image: string) => {
	getRemoteDockerMock.mockResolvedValue({
		getService: () => ({
			inspect: async () => ({
				ID: "svc-1",
				Spec: {
					Mode: { Replicated: { Replicas: 1 } },
					TaskTemplate: { ContainerSpec: { Image: image } },
				},
			}),
		}),
		listNodes: async () => [node("vm-1"), node("vm-2")],
		listTasks: async () => [],
	});
	return getStackServiceCapacity(
		{ composeId: "c1", serverId: null, server: null },
		"shop_api",
		2,
		{ fresh: true },
	);
};

describe("stack images on several nodes", () => {
	it("warns when the image never came from a registry", async () => {
		const { warnings } = await capacityFor("shop-api:latest");
		const warning = warnings.find(
			(item) => item.code === "image_not_distributed",
		);
		expect(warning?.message).toContain("compose file");
		expect(warning?.message).not.toContain("Advanced");
	});

	it("trusts an image Swarm pinned to a registry digest", async () => {
		const { warnings } = await capacityFor(
			`ghcr.io/acme/api:1@sha256:${"a".repeat(64)}`,
		);
		expect(warnings.map((item) => item.code)).not.toContain(
			"image_not_distributed",
		);
	});
});
