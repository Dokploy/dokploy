import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	updateApplication: vi.fn(),
	deployApplication: vi.fn(),
	findServerById: vi.fn(),
	execAsync: vi.fn(),
	findLibreDBStudioByApplicationId: vi.fn(),
	removeStudioSeedDirectory: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { network: { findMany: vi.fn(async () => []) } },
		update: vi.fn(),
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	deployApplication: mocks.deployApplication,
	findApplicationById: mocks.findApplicationById,
	updateApplication: mocks.updateApplication,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/libredb-studio", () => ({
	findLibreDBStudioByApplicationId: mocks.findLibreDBStudioByApplicationId,
}));

vi.mock(
	"@dokploy/server/utils/libredb-studio/writer",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/utils/libredb-studio/writer")
		>()),
		removeStudioSeedDirectory: mocks.removeStudioSeedDirectory,
	}),
);

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsync,
}));

vi.mock("@dokploy/server/utils/process/remoteStream", () => ({
	pipeBetweenServers: vi.fn(async () => 0),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: vi.fn(async () => undefined),
	removeMonitoringDirectory: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	readConfig: vi.fn(() => null),
	readRemoteConfig: vi.fn(async () => null),
	removeTraefikConfig: vi.fn(async () => undefined),
	writeConfig: vi.fn(),
	writeConfigRemote: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/forward-auth", () => ({
	removeForwardAuthMiddleware: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/middleware", () => ({
	deleteAllMiddlewares: vi.fn(async () => undefined),
	removePathMiddlewares: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/redirect", () => ({
	createRedirectMiddleware: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/utils/traefik/security", () => ({
	createSecurityMiddleware: vi.fn(async () => undefined),
}));

const { transferService } = await import("@dokploy/server/services/transfer");
const { getStudioSeedPaths } = await import(
	"@dokploy/server/utils/libredb-studio/writer"
);

const application = {
	applicationId: "app-1",
	appName: "demo-shop-libredb-studio-x1y2z3",
	serverId: null,
	server: null,
	replicas: 1,
	mounts: [],
	domains: [],
	security: [],
	redirects: [],
	networkIds: [],
	environment: { project: { organizationId: "org-1" } },
};

const transfer = (log: (message: string) => void = () => undefined) =>
	transferService(
		{
			serviceType: "application",
			serviceId: "app-1",
			targetServerId: "server-2",
			removeSourceData: false,
			organizationId: "org-1",
		},
		log,
	);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findApplicationById.mockResolvedValue(application);
	mocks.updateApplication.mockResolvedValue(application);
	mocks.deployApplication.mockResolvedValue(true);
	mocks.findServerById.mockResolvedValue({
		serverId: "server-2",
		name: "Edge box",
		organizationId: "org-1",
		serverStatus: "active",
		serverType: "deploy",
	});
	mocks.execAsync.mockResolvedValue({ stdout: "no", stderr: "" });
	mocks.removeStudioSeedDirectory.mockResolvedValue(undefined);
});

describe("transferring a LibreDB Studio application", () => {
	it("removes the seed directory on the source server before deploying on the target", async () => {
		mocks.findLibreDBStudioByApplicationId.mockResolvedValue({
			libredbStudioId: "studio-1",
		});

		await transfer();

		expect(mocks.findLibreDBStudioByApplicationId).toHaveBeenCalledWith(
			"app-1",
		);
		expect(mocks.removeStudioSeedDirectory).toHaveBeenCalledWith({
			appName: "demo-shop-libredb-studio-x1y2z3",
			serverId: null,
		});
		expect(
			mocks.removeStudioSeedDirectory.mock.invocationCallOrder[0],
		).toBeLessThan(mocks.deployApplication.mock.invocationCallOrder[0] ?? 0);
	});

	it("leaves other applications alone", async () => {
		mocks.findLibreDBStudioByApplicationId.mockResolvedValue(null);

		await transfer();

		expect(mocks.removeStudioSeedDirectory).not.toHaveBeenCalled();
		expect(mocks.deployApplication).toHaveBeenCalledTimes(1);
	});

	it("fails the transfer instead of deploying when the seed cannot be removed", async () => {
		mocks.findLibreDBStudioByApplicationId.mockResolvedValue({
			libredbStudioId: "studio-1",
		});
		mocks.removeStudioSeedDirectory.mockRejectedValue(
			new Error("permission denied"),
		);

		await expect(transfer()).rejects.toThrow("permission denied");
		expect(mocks.deployApplication).not.toHaveBeenCalled();
	});

	it.each([
		{
			step: "Looking up the LibreDB Studio",
			arrange: () =>
				mocks.findLibreDBStudioByApplicationId.mockRejectedValue(
					new Error("connection reset"),
				),
			reason: "connection reset",
		},
		{
			step: "Removing the LibreDB Studio seed",
			arrange: () => {
				mocks.findLibreDBStudioByApplicationId.mockResolvedValue({
					libredbStudioId: "studio-1",
				});
				mocks.removeStudioSeedDirectory.mockRejectedValue(
					new Error("permission denied"),
				);
			},
			reason: "permission denied",
		},
	])(
		"sets the status to error and logs the recovery when $step fails",
		async ({ step, arrange, reason }) => {
			arrange();
			const messages: string[] = [];

			await expect(
				transfer((message) => messages.push(message)),
			).rejects.toThrow(reason);

			const { parentDir } = getStudioSeedPaths(application.appName, null);
			expect(mocks.updateApplication).toHaveBeenLastCalledWith("app-1", {
				applicationStatus: "error",
			});
			expect(messages).toContain(
				`${step} failed: ${reason}. Remove ${parentDir} on Dokploy Server, then run Deploy to start the Studio on Edge box`,
			);
			expect(mocks.deployApplication).not.toHaveBeenCalled();
		},
	);
});
