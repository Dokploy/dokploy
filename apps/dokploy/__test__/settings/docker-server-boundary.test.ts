import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkGPUStatus: vi.fn(),
	checkPermission: vi.fn(),
	checkPortInUse: vi.fn(),
	checkPostgresHealth: vi.fn(),
	checkRedisHealth: vi.fn(),
	checkTraefikHealth: vi.fn(),
	cleanAllDeploymentQueue: vi.fn(),
	cleanupAll: vi.fn(),
	cleanupAllBackground: vi.fn(),
	cleanupBuilders: vi.fn(),
	cleanupContainers: vi.fn(),
	cleanupImages: vi.fn(),
	cleanupSystem: vi.fn(),
	cleanupVolumes: vi.fn(),
	execAsync: vi.fn(),
	findServerById: vi.fn(),
	generateOpenApiDocument: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getDockerDiskUsage: vi.fn(),
	getDokployImageTag: vi.fn(),
	getLogCleanupStatus: vi.fn(),
	getUpdateData: vi.fn(),
	getWebServerSettings: vi.fn(),
	hasValidLicense: vi.fn(),
	parseRawConfig: vi.fn(),
	paths: vi.fn(),
	prepareEnvironmentVariables: vi.fn(),
	processLogs: vi.fn(),
	readConfig: vi.fn(),
	readConfigInPath: vi.fn(),
	readDirectory: vi.fn(),
	readEnvironmentVariables: vi.fn(),
	readMainConfig: vi.fn(),
	readMonitoringConfig: vi.fn(),
	readPorts: vi.fn(),
	recreateDirectory: vi.fn(),
	reloadDockerResource: vi.fn(),
	removeJob: vi.fn(),
	schedule: vi.fn(),
	scheduleJob: vi.fn(),
	sendDockerCleanupNotifications: vi.fn(),
	setupGPUSupport: vi.fn(),
	spawnAsync: vi.fn(),
	startLogCleanup: vi.fn(),
	stopLogCleanup: vi.fn(),
	updateLetsEncryptEmail: vi.fn(),
	updateServerById: vi.fn(),
	updateServerTraefik: vi.fn(),
	updateWebServerSettings: vi.fn(),
	writeConfig: vi.fn(),
	writeMainConfig: vi.fn(),
	writeTraefikConfigInPath: vi.fn(),
	writeTraefikSetup: vi.fn(),
}));

const redactWebServerSettings = <T>(settings: T) => settings;

vi.mock("@dokploy/server", () => ({
	CLEANUP_CRON_JOB: "0 0 * * *",
	DEFAULT_UPDATE_DATA: {},
	IS_CLOUD: false,
	checkGPUStatus: mocks.checkGPUStatus,
	checkPortInUse: mocks.checkPortInUse,
	checkPostgresHealth: mocks.checkPostgresHealth,
	checkRedisHealth: mocks.checkRedisHealth,
	checkTraefikHealth: mocks.checkTraefikHealth,
	cleanupAll: mocks.cleanupAll,
	cleanupAllBackground: mocks.cleanupAllBackground,
	cleanupBuilders: mocks.cleanupBuilders,
	cleanupContainers: mocks.cleanupContainers,
	cleanupImages: mocks.cleanupImages,
	cleanupSystem: mocks.cleanupSystem,
	cleanupVolumes: mocks.cleanupVolumes,
	execAsync: mocks.execAsync,
	findServerById: mocks.findServerById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getDockerDiskUsage: mocks.getDockerDiskUsage,
	getDokployImageTag: mocks.getDokployImageTag,
	getLogCleanupStatus: mocks.getLogCleanupStatus,
	getUpdateData: mocks.getUpdateData,
	getWebServerSettings: mocks.getWebServerSettings,
	parseRawConfig: mocks.parseRawConfig,
	paths: mocks.paths,
	prepareEnvironmentVariables: mocks.prepareEnvironmentVariables,
	processLogs: mocks.processLogs,
	readConfig: mocks.readConfig,
	readConfigInPath: mocks.readConfigInPath,
	readDirectory: mocks.readDirectory,
	readEnvironmentVariables: mocks.readEnvironmentVariables,
	readMainConfig: mocks.readMainConfig,
	readMonitoringConfig: mocks.readMonitoringConfig,
	redactWebServerSettings,
	readPorts: mocks.readPorts,
	recreateDirectory: mocks.recreateDirectory,
	reloadDockerResource: mocks.reloadDockerResource,
	sendDockerCleanupNotifications: mocks.sendDockerCleanupNotifications,
	setupGPUSupport: mocks.setupGPUSupport,
	spawnAsync: mocks.spawnAsync,
	startLogCleanup: mocks.startLogCleanup,
	stopLogCleanup: mocks.stopLogCleanup,
	updateLetsEncryptEmail: mocks.updateLetsEncryptEmail,
	updateServerById: mocks.updateServerById,
	updateServerTraefik: mocks.updateServerTraefik,
	updateWebServerSettings: mocks.updateWebServerSettings,
	writeConfig: mocks.writeConfig,
	writeMainConfig: mocks.writeMainConfig,
	writeTraefikConfigInPath: mocks.writeTraefikConfigInPath,
	writeTraefikSetup: mocks.writeTraefikSetup,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

vi.mock("@dokploy/trpc-openapi", () => ({
	generateOpenApiDocument: mocks.generateOpenApiDocument,
}));

vi.mock("node-schedule", () => ({
	scheduledJobs: {},
	scheduleJob: mocks.scheduleJob,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/queues/concurrency", () => ({
	assertBuildsConcurrencyAllowed: vi.fn(),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanAllDeploymentQueue: mocks.cleanAllDeploymentQueue,
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: mocks.removeJob,
	schedule: mocks.schedule,
}));

vi.mock("../../server/api/root", () => ({
	appRouter: {},
}));

const { settingsRouter } = await import("../../server/api/routers/settings");

const createCaller = (role: "owner" | "admin" | "member" = "admin") =>
	settingsRouter.createCaller({
		db: {},
		req: {
			headers: {
				host: "dokploy.example.com",
				"x-forwarded-proto": "https",
			},
		},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role,
		},
	} as never);

describe("settings Docker server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.hasValidLicense.mockResolvedValue(true);
		mocks.generateOpenApiDocument.mockReturnValue({
			components: {},
			info: {},
			security: [],
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.cleanupBuilders.mockResolvedValue(undefined);
		mocks.cleanupContainers.mockResolvedValue(undefined);
		mocks.cleanupImages.mockResolvedValue(undefined);
		mocks.cleanupSystem.mockResolvedValue(undefined);
		mocks.cleanupVolumes.mockResolvedValue(undefined);
		mocks.cleanupAllBackground.mockResolvedValue({
			message: "Docker cleanup has been initiated in the background",
		});
		mocks.reloadDockerResource.mockResolvedValue(undefined);
		mocks.findServerById.mockResolvedValue({
			enableDockerCleanup: false,
			organizationId: "org-1",
			serverId: "server-1",
			serverStatus: "active",
		});
		mocks.paths.mockReturnValue({
			MAIN_TRAEFIK_PATH: "/etc/dokploy/traefik",
		});
		mocks.readConfigInPath.mockResolvedValue("http: {}");
		mocks.readDirectory.mockResolvedValue([]);
		mocks.updateServerById.mockResolvedValue({
			enableDockerCleanup: false,
			organizationId: "org-1",
			serverId: "server-1",
			serverStatus: "active",
		});
	});

	it("denies inaccessible server cleanup before Docker side effects", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().cleanUnusedImages({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.cleanupImages).not.toHaveBeenCalled();
	});

	it("denies inaccessible server reload before Docker side effects", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().reloadTraefik({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.reloadDockerResource).not.toHaveBeenCalled();
	});

	it("denies inaccessible cleanup schedule updates before server mutation", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().updateDockerCleanup({
				enableDockerCleanup: false,
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.updateServerById).not.toHaveBeenCalled();
		expect(mocks.findServerById).not.toHaveBeenCalled();
	});

	it("denies inaccessible Traefik directory listing before remote read", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().readDirectories({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.readDirectory).not.toHaveBeenCalled();
	});

	it("denies inaccessible Traefik file reads before remote read", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().readTraefikFile({
				path: `${process.cwd()}/.docker/traefik/dynamic/app.yml`,
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.readConfigInPath).not.toHaveBeenCalled();
	});

	it("denies inaccessible Traefik file updates before remote write", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().updateTraefikFile({
				path: "/etc/dokploy/traefik/dynamic/app.yml",
				traefikConfig: "http: {}",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.writeTraefikConfigInPath).not.toHaveBeenCalled();
	});

	it("denies inaccessible dashboard toggles before Traefik reads", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().toggleDashboard({
				enableDashboard: true,
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.readPorts).not.toHaveBeenCalled();
		expect(mocks.readEnvironmentVariables).not.toHaveBeenCalled();
		expect(mocks.checkPortInUse).not.toHaveBeenCalled();
		expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
	});

	it("denies inaccessible Traefik env writes before Traefik reads", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().writeTraefikEnv({
				env: "FOO=bar",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.prepareEnvironmentVariables).not.toHaveBeenCalled();
		expect(mocks.readPorts).not.toHaveBeenCalled();
		expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
	});

	it("denies inaccessible GPU setup before remote setup helpers", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().setupGPU({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.setupGPUSupport).not.toHaveBeenCalled();
	});

	it("denies inaccessible GPU status reads before remote status helpers", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().checkGPUStatus({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.checkGPUStatus).not.toHaveBeenCalled();
	});

	it("denies inaccessible Traefik port writes before Traefik reads", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().updateTraefikPorts({
				additionalPorts: [
					{
						protocol: "tcp",
						publishedPort: 8443,
						targetPort: 8443,
					},
				],
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.readEnvironmentVariables).not.toHaveBeenCalled();
		expect(mocks.checkPortInUse).not.toHaveBeenCalled();
		expect(mocks.writeTraefikSetup).not.toHaveBeenCalled();
	});

	it("denies inaccessible Traefik port reads before Traefik reads", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().getTraefikPorts({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.readPorts).not.toHaveBeenCalled();
	});

	it("allows accessible server cleanup", async () => {
		await expect(
			createCaller().cleanAll({ serverId: "server-1" }),
		).resolves.toEqual({
			message: "Docker cleanup has been initiated in the background",
		});

		expect(mocks.cleanupAllBackground).toHaveBeenCalledWith("server-1");
	});

	it("requires api.read before generating the OpenAPI document", async () => {
		const result = await createCaller().getOpenApiDocument();

		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			api: ["read"],
		});
		expect(mocks.generateOpenApiDocument).toHaveBeenCalled();
		expect(result).toMatchObject({
			info: {
				title: "Dokploy API",
			},
			security: [{ apiKey: [] }],
		});
	});

	it("does not generate the OpenAPI document without api.read", async () => {
		mocks.checkPermission.mockRejectedValueOnce(new Error("Permission denied"));

		await expect(createCaller().getOpenApiDocument()).rejects.toThrow(
			"Permission denied",
		);

		expect(mocks.generateOpenApiDocument).not.toHaveBeenCalled();
	});

	it("denies org admins from changing instance-wide SSO policy", async () => {
		await expect(
			createCaller("admin").updateEnforceSSO({ enforceSSO: false }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.hasValidLicense).not.toHaveBeenCalled();
		expect(mocks.updateWebServerSettings).not.toHaveBeenCalled();
	});

	it("denies org admins from changing remote-only deployment policy", async () => {
		await expect(
			createCaller("admin").updateRemoteServersOnly({
				remoteServersOnly: false,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.hasValidLicense).not.toHaveBeenCalled();
		expect(mocks.updateWebServerSettings).not.toHaveBeenCalled();
	});

	it("allows owners with an enterprise license to change instance-wide restrictions", async () => {
		await expect(
			createCaller("owner").updateEnforceSSO({ enforceSSO: true }),
		).resolves.toBe(true);

		expect(mocks.hasValidLicense).toHaveBeenCalledWith("org-1");
		expect(mocks.updateWebServerSettings).toHaveBeenCalledWith({
			enforceSSO: true,
		});
	});

	it("allows owners with an enterprise license to change remote-only deployment policy", async () => {
		await expect(
			createCaller("owner").updateRemoteServersOnly({
				remoteServersOnly: true,
			}),
		).resolves.toBe(true);

		expect(mocks.hasValidLicense).toHaveBeenCalledWith("org-1");
		expect(mocks.updateWebServerSettings).toHaveBeenCalledWith({
			remoteServersOnly: true,
		});
	});
});
