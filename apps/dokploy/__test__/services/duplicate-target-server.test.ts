import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findServerById:
		vi.fn<
			(serverId: string) => Promise<{
				serverStatus: string;
				serverType: string;
			}>
		>(),
	getAccessibleServerIds:
		vi.fn<
			(session: {
				userId: string;
				activeOrganizationId: string;
			}) => Promise<Set<string>>
		>(),
	getWebServerSettings:
		vi.fn<() => Promise<{ remoteServersOnly: boolean } | undefined>>(),
	resolveNetworkIds:
		vi.fn<
			(
				networkIds: string[] | null | undefined,
				serverId: string | null,
			) => Promise<{ kept: string[]; dropped: string[] }>
		>(),
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/constants")>()),
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
}));

vi.mock("@dokploy/server/services/network", () => ({
	resolveNetworkIds: mocks.resolveNetworkIds,
}));

const { assertDuplicateTargetServer, duplicateServerOverride } = await import(
	"@dokploy/server/services/duplicate"
);

const session = {
	userId: "user-1",
	activeOrganizationId: "org-1",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getWebServerSettings.mockResolvedValue({
		remoteServersOnly: false,
	});
	mocks.resolveNetworkIds.mockResolvedValue({
		kept: ["network-2"],
		dropped: ["Network 1"],
	});
});

describe("duplicateServerOverride", () => {
	it("keeps the source placement without resolving networks", async () => {
		await expect(
			duplicateServerOverride(
				{ kind: "keep" },
				{ serverId: "server-1", networkIds: ["network-1"] },
			),
		).resolves.toEqual({});
		expect(mocks.resolveNetworkIds).not.toHaveBeenCalled();
	});

	it("targets Dokploy and keeps networks available there", async () => {
		await expect(
			duplicateServerOverride(
				{ kind: "dokploy" },
				{ serverId: "server-1", networkIds: ["network-1", "network-2"] },
			),
		).resolves.toEqual({
			serverId: null,
			networkIds: ["network-2"],
		});
		expect(mocks.resolveNetworkIds).toHaveBeenCalledWith(
			["network-1", "network-2"],
			null,
		);
	});

	it("targets a remote server and keeps networks available there", async () => {
		mocks.resolveNetworkIds.mockResolvedValue({
			kept: ["network-1"],
			dropped: [],
		});
		await expect(
			duplicateServerOverride(
				{ kind: "remote", serverId: "server-2" },
				{ serverId: "server-1", networkIds: ["network-1"] },
			),
		).resolves.toEqual({
			serverId: "server-2",
			networkIds: ["network-1"],
		});
		expect(mocks.resolveNetworkIds).toHaveBeenCalledWith(
			["network-1"],
			"server-2",
		);
	});

	it("does not resolve networks when targeting the source server", async () => {
		await expect(
			duplicateServerOverride(
				{ kind: "remote", serverId: "server-1" },
				{ serverId: "server-1", networkIds: ["network-1"] },
			),
		).resolves.toEqual({ serverId: "server-1" });
		expect(mocks.resolveNetworkIds).not.toHaveBeenCalled();
	});

	it("supports source rows without network ids", async () => {
		await expect(
			duplicateServerOverride(
				{ kind: "remote", serverId: "server-2" },
				{ serverId: "server-1" },
			),
		).resolves.toEqual({ serverId: "server-2" });
		expect(mocks.resolveNetworkIds).not.toHaveBeenCalled();
	});

	it("filters compose service networks for the target server", async () => {
		const serviceNetworks = [
			{
				serviceName: "web",
				networkIds: ["network-1", "network-2"],
				detachDokployNetwork: false,
			},
			{
				serviceName: "worker",
				networkIds: ["network-2", "network-3"],
				detachDokployNetwork: true,
			},
		];

		await expect(
			duplicateServerOverride(
				{ kind: "remote", serverId: "server-2" },
				{ serverId: "server-1", serviceNetworks },
			),
		).resolves.toEqual({
			serverId: "server-2",
			serviceNetworks: [
				{ ...serviceNetworks[0], networkIds: ["network-2"] },
				{ ...serviceNetworks[1], networkIds: ["network-2"] },
			],
		});
		expect(mocks.resolveNetworkIds).toHaveBeenCalledTimes(1);
		expect(mocks.resolveNetworkIds).toHaveBeenCalledWith(
			["network-1", "network-2", "network-3"],
			"server-2",
		);
	});

	it("filters network ids and service networks with one resolver call", async () => {
		mocks.resolveNetworkIds.mockResolvedValue({
			kept: ["network-2", "network-3"],
			dropped: ["Network 1"],
		});
		const serviceNetworks = [
			{
				serviceName: "web",
				networkIds: ["network-2", "network-3"],
				detachDokployNetwork: false,
			},
		];

		await expect(
			duplicateServerOverride(
				{ kind: "remote", serverId: "server-2" },
				{
					serverId: "server-1",
					networkIds: ["network-1", "network-2"],
					serviceNetworks,
				},
			),
		).resolves.toEqual({
			serverId: "server-2",
			networkIds: ["network-2"],
			serviceNetworks: [
				{ ...serviceNetworks[0], networkIds: ["network-2", "network-3"] },
			],
		});
		expect(mocks.resolveNetworkIds).toHaveBeenCalledTimes(1);
		expect(mocks.resolveNetworkIds).toHaveBeenCalledWith(
			["network-1", "network-2", "network-3"],
			"server-2",
		);
	});
});

describe("assertDuplicateTargetServer", () => {
	it("accepts keeping each source server without querying placement", async () => {
		await expect(
			assertDuplicateTargetServer(session, { kind: "keep" }),
		).resolves.toBeUndefined();
		expect(mocks.getWebServerSettings).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.findServerById).not.toHaveBeenCalled();
	});

	it("rejects Dokploy when only remote servers are allowed", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			remoteServersOnly: true,
		});

		await expect(
			assertDuplicateTargetServer(session, { kind: "dokploy" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "The Dokploy server is not available as a target",
		});
	});

	it("accepts Dokploy when local deployments are allowed", async () => {
		await expect(
			assertDuplicateTargetServer(session, { kind: "dokploy" }),
		).resolves.toBeUndefined();
	});

	it("rejects an inaccessible remote server", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));

		await expect(
			assertDuplicateTargetServer(session, {
				kind: "remote",
				serverId: "server-2",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
		expect(mocks.findServerById).not.toHaveBeenCalled();
	});

	it.each([
		{ serverStatus: "inactive", serverType: "deploy" },
		{ serverStatus: "active", serverType: "build" },
	])("rejects an unavailable deployment server", async (server) => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		mocks.findServerById.mockResolvedValue(server);

		await expect(
			assertDuplicateTargetServer(session, {
				kind: "remote",
				serverId: "server-2",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "The target server is not available for deployments",
		});
	});

	it("accepts an accessible active deployment server", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		mocks.findServerById.mockResolvedValue({
			serverStatus: "active",
			serverType: "deploy",
		});

		await expect(
			assertDuplicateTargetServer(session, {
				kind: "remote",
				serverId: "server-2",
			}),
		).resolves.toBeUndefined();
	});
});

describe("assertDuplicateTargetServer in cloud", () => {
	it("rejects Dokploy", async () => {
		vi.resetModules();
		vi.doMock("@dokploy/server/constants", async (importOriginal) => ({
			...(await importOriginal<typeof import("@dokploy/server/constants")>()),
			IS_CLOUD: true,
		}));
		const { assertDuplicateTargetServer: assertCloudTargetServer } =
			await import("@dokploy/server/services/duplicate");

		await expect(
			assertCloudTargetServer(session, { kind: "dokploy" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "The Dokploy server is not available as a target",
		});
		expect(mocks.getWebServerSettings).not.toHaveBeenCalled();
	});
});
