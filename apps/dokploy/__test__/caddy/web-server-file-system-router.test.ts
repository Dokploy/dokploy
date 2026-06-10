import { beforeEach, expect, test, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
	applyCaddyMigration: vi.fn(),
	checkGPUStatus: vi.fn(),
	checkPortInUse: vi.fn(),
	checkPostgresHealth: vi.fn(),
	checkRedisHealth: vi.fn(),
	checkWebServerHealth: vi.fn(),
	cleanupAll: vi.fn(),
	cleanupAllBackground: vi.fn(),
	cleanupBuilders: vi.fn(),
	cleanupContainers: vi.fn(),
	cleanupImages: vi.fn(),
	cleanupSystem: vi.fn(),
	cleanupVolumes: vi.fn(),
	compileWriteAndReloadCaddyConfigSafely: vi.fn(),
	execAsync: vi.fn(),
	findServerById: vi.fn(),
	getCaddyCompileSettings: vi.fn(),
	getCaddyMigrationReport: vi.fn(),
	getCaddyTrustedProxySettings: vi.fn(),
	getDockerDiskUsage: vi.fn(),
	getDokployImageTag: vi.fn(),
	getLogCleanupStatus: vi.fn(),
	getUpdateData: vi.fn(),
	getWebServerPaths: vi.fn(),
	getWebServerResourceName: vi.fn(),
	getWebServerSettings: vi.fn(),
	isCaddyAdminAdditionalPort: vi.fn(),
	isCaddyReservedAdditionalPort: vi.fn(),
	parseRawConfig: vi.fn(),
	paths: vi.fn(),
	prepareCaddyMigration: vi.fn(),
	prepareEnvironmentVariables: vi.fn(),
	processLogs: vi.fn(),
	readCaddyConfigFileIfExists: vi.fn(),
	readConfig: vi.fn(),
	readConfigInPath: vi.fn(),
	readDirectory: vi.fn(),
	readEnvironmentVariables: vi.fn(),
	readMainConfig: vi.fn(),
	readMonitoringConfig: vi.fn(),
	readPorts: vi.fn(),
	recreateDirectory: vi.fn(),
	reloadCaddyAfterValidation: vi.fn(),
	reloadDockerResource: vi.fn(),
	resolveWebServerProvider: vi.fn(),
	rollbackCaddyMigration: vi.fn(),
	sendDockerCleanupNotifications: vi.fn(),
	setupGPUSupport: vi.fn(),
	spawnAsync: vi.fn(),
	startLogCleanup: vi.fn(),
	stopLogCleanup: vi.fn(),
	updateCaddyTrustedProxySettings: vi.fn(),
	updateLetsEncryptEmail: vi.fn(),
	updateLocalWebServerProvider: vi.fn(),
	updateRemoteWebServerProvider: vi.fn(),
	updateServerById: vi.fn(),
	updateServerCaddy: vi.fn(),
	updateServerTraefik: vi.fn(),
	updateWebServerSettings: vi.fn(),
	writeConfig: vi.fn(),
	writeMainConfig: vi.fn(),
	writeTraefikConfigInPath: vi.fn(),
	writeTraefikSetup: vi.fn(),
	writeWebServerSetup: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	...serverMocks,
	CLEANUP_CRON_JOB: "cleanup",
	DEFAULT_UPDATE_DATA: { latestVersion: null, updateAvailable: false },
	IS_CLOUD: false,
}));

vi.mock("@dokploy/trpc-openapi", () => ({
	generateOpenApiDocument: vi.fn(),
}));

vi.mock("@/server/api/root", () => ({
	appRouter: {},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanAllDeploymentQueue: vi.fn(),
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
}));

import {
	findServerById,
	getWebServerPaths,
	paths,
	readConfigInPath,
	readDirectory,
	resolveWebServerProvider,
	writeTraefikConfigInPath,
} from "@dokploy/server";
import { settingsRouter } from "@/server/api/routers/settings";
import { audit } from "@/server/api/utils/audit";

const caller = settingsRouter.createCaller({
	session: {
		userId: "user-1",
		activeOrganizationId: "org-1",
	},
	user: {
		id: "user-1",
		role: "owner",
		ownerId: "user-1",
		email: "owner@example.com",
		enableEnterpriseFeatures: true,
		isValidEnterpriseLicense: true,
	},
	req: { headers: {} },
	res: {},
} as never);

const caddyPaths = {
	MAIN_CADDY_PATH: "/etc/dokploy/caddy",
	CADDY_CONFIG_PATH: "/etc/dokploy/caddy/caddy.json",
	CADDY_FRAGMENTS_PATH: "/etc/dokploy/caddy/fragments",
	CADDY_MIGRATIONS_PATH: "/etc/dokploy/caddy/migrations",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(findServerById).mockResolvedValue({
		serverId: "server-1",
		organizationId: "org-1",
	} as never);
	vi.mocked(paths).mockReturnValue({
		MAIN_TRAEFIK_PATH: "/etc/dokploy/traefik",
		...caddyPaths,
	} as never);
	vi.mocked(getWebServerPaths).mockImplementation(
		(provider) =>
			({
				basePath:
					provider === "caddy"
						? caddyPaths.MAIN_CADDY_PATH
						: "/etc/dokploy/traefik",
				activeConfigPath:
					provider === "caddy"
						? caddyPaths.CADDY_CONFIG_PATH
						: "/etc/dokploy/traefik/traefik.yml",
				fragmentsPath:
					provider === "caddy"
						? caddyPaths.CADDY_FRAGMENTS_PATH
						: "/etc/dokploy/traefik/dynamic",
			}) as never,
	);
	vi.mocked(readConfigInPath).mockImplementation(
		async (filePath: string) => `contents:${filePath}`,
	);
});

test("reads and updates Traefik web-server files through provider-aware endpoints", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("traefik");
	vi.mocked(readDirectory).mockResolvedValue([
		{
			id: "/etc/dokploy/traefik/dynamic/app.yml",
			name: "app.yml",
			type: "file",
		},
	] as never);

	const directories = await caller.readWebServerDirectories({
		serverId: "server-1",
	});
	const file = await caller.readWebServerFile({
		serverId: "server-1",
		path: "dynamic/app.yml",
	});
	const updated = await caller.updateWebServerFile({
		serverId: "server-1",
		path: "dynamic/app.yml",
		webServerConfig: "http: {}\n",
	});

	expect(directories).toHaveLength(1);
	expect(readDirectory).toHaveBeenCalledWith(
		"/etc/dokploy/traefik",
		"server-1",
	);
	expect(readConfigInPath).toHaveBeenCalledWith(
		"/etc/dokploy/traefik/dynamic/app.yml",
		"server-1",
	);
	expect(writeTraefikConfigInPath).toHaveBeenCalledWith(
		"/etc/dokploy/traefik/dynamic/app.yml",
		"http: {}\n",
		"server-1",
	);
	expect(audit).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ resourceName: "web-server-file" }),
	);
	expect(file).toBe("contents:/etc/dokploy/traefik/dynamic/app.yml");
	expect(updated).toBe(true);
});

test("limits Caddy web-server file access to safe generated artifacts", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	vi.mocked(readDirectory).mockImplementation(async (dirPath: string) => {
		if (dirPath === caddyPaths.CADDY_FRAGMENTS_PATH) {
			return [
				{
					id: `${caddyPaths.CADDY_FRAGMENTS_PATH}/app.json`,
					name: "app.json",
					type: "file",
				},
			] as never;
		}
		if (dirPath === caddyPaths.CADDY_MIGRATIONS_PATH) {
			return [
				{
					id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1`,
					name: "caddy-1",
					type: "directory",
					children: [
						{
							id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1/caddy.json`,
							name: "caddy.json",
							type: "file",
						},
						{
							id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1/backups`,
							name: "backups",
							type: "directory",
							children: [
								{
									id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1/backups/traefik.yml`,
									name: "traefik.yml",
									type: "file",
								},
							],
						},
					],
				},
				{
					id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/backups`,
					name: "backups",
					type: "directory",
					children: [],
				},
			] as never;
		}
		return [] as never;
	});

	const directories = await caller.readWebServerDirectories({
		serverId: "server-1",
	});
	const file = await caller.readWebServerFile({
		serverId: "server-1",
		path: caddyPaths.CADDY_CONFIG_PATH,
	});

	expect(directories).toEqual([
		{
			id: caddyPaths.CADDY_CONFIG_PATH,
			name: "caddy.json",
			type: "file",
		},
		{
			id: caddyPaths.CADDY_FRAGMENTS_PATH,
			name: "fragments",
			type: "directory",
			children: [
				{
					id: `${caddyPaths.CADDY_FRAGMENTS_PATH}/app.json`,
					name: "app.json",
					type: "file",
				},
			],
		},
		{
			id: caddyPaths.CADDY_MIGRATIONS_PATH,
			name: "migrations",
			type: "directory",
			children: [
				{
					id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1`,
					name: "caddy-1",
					type: "directory",
					children: [
						{
							id: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1/caddy.json`,
							name: "caddy.json",
							type: "file",
						},
					],
				},
			],
		},
	]);
	expect(readConfigInPath).toHaveBeenCalledWith(
		caddyPaths.CADDY_CONFIG_PATH,
		"server-1",
	);
	expect(file).toBe(`contents:${caddyPaths.CADDY_CONFIG_PATH}`);
	await expect(
		caller.readWebServerFile({
			serverId: "server-1",
			path: `${caddyPaths.CADDY_MIGRATIONS_PATH}/caddy-1/backups/traefik.yml`,
		}),
	).rejects.toThrow("migration backups");
	await expect(
		caller.readWebServerFile({
			serverId: "server-1",
			path: "/etc/dokploy/traefik/traefik.yml",
		}),
	).rejects.toThrow("outside of active web server directory");
	await expect(
		caller.updateWebServerFile({
			serverId: "server-1",
			path: caddyPaths.CADDY_CONFIG_PATH,
			webServerConfig: "{}",
		}),
	).rejects.toThrow("read-only");
	expect(writeTraefikConfigInPath).not.toHaveBeenCalled();
});
