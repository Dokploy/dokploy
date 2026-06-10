import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

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
	compileAndWriteCaddyConfig: vi.fn(),
	compileWriteAndValidateCaddyConfigSafely: vi.fn(),
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
	ACCESS_LOG_RETAINED_LINES: 1000,
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
	checkPortInUse,
	compileAndWriteCaddyConfig,
	compileWriteAndValidateCaddyConfigSafely,
	getCaddyCompileSettings,
	getWebServerResourceName,
	getWebServerSettings,
	parseRawConfig,
	paths,
	prepareEnvironmentVariables,
	processLogs,
	readEnvironmentVariables,
	readMainConfig,
	readMonitoringConfig,
	readPorts,
	resolveWebServerProvider,
	updateWebServerSettings,
	writeMainConfig,
	writeWebServerSetup,
} from "@dokploy/server";
import { apiUpdateWebServerSettings } from "@dokploy/server/db/schema";
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

const tempRoot = join(tmpdir(), "dokploy-caddy-request-logs-test");
const caddyAccessLogPath = join(tempRoot, "caddy", "access.log");

let requestLogsEnabled = false;

beforeEach(() => {
	vi.clearAllMocks();
	rmSync(tempRoot, { recursive: true, force: true });
	mkdirSync(dirname(caddyAccessLogPath), { recursive: true });
	requestLogsEnabled = false;
	vi.mocked(paths).mockReturnValue({
		DYNAMIC_TRAEFIK_PATH: join(tempRoot, "traefik", "dynamic"),
		CADDY_ACCESS_LOG_PATH: caddyAccessLogPath,
	} as never);
	vi.mocked(getWebServerResourceName).mockImplementation((provider) =>
		provider === "caddy" ? "dokploy-caddy" : "dokploy-traefik",
	);
	vi.mocked(getWebServerSettings).mockImplementation(
		async () => ({ requestLogsEnabled }) as never,
	);
	vi.mocked(updateWebServerSettings).mockImplementation(async (updates) => {
		if ("requestLogsEnabled" in updates) {
			requestLogsEnabled = Boolean(updates.requestLogsEnabled);
		}
		return { requestLogsEnabled } as never;
	});
	vi.mocked(getCaddyCompileSettings).mockImplementation(async () => ({
		letsEncryptEmail: "ops@example.com",
		accessLogs: requestLogsEnabled ? { enabled: true } : null,
	}));
	vi.mocked(compileAndWriteCaddyConfig).mockResolvedValue({} as never);
	vi.mocked(compileWriteAndValidateCaddyConfigSafely).mockResolvedValue(
		{} as never,
	);
	vi.mocked(checkPortInUse).mockResolvedValue({ isInUse: false } as never);
	vi.mocked(readEnvironmentVariables).mockResolvedValue("CADDY_ENV=1");
	vi.mocked(prepareEnvironmentVariables).mockReturnValue(["CADDY_ENV=1"]);
	vi.mocked(readPorts).mockResolvedValue([
		{ targetPort: 80, publishedPort: 80, protocol: "tcp" },
	] as never);
	vi.mocked(writeWebServerSetup).mockResolvedValue(undefined as never);
	vi.mocked(readMainConfig).mockReturnValue("entryPoints: {}\n");
	vi.mocked(readMonitoringConfig).mockResolvedValue("traefik-log\n");
	vi.mocked(parseRawConfig).mockReturnValue({
		data: [],
		totalCount: 1,
	} as never);
	vi.mocked(processLogs).mockReturnValue([
		{ hour: "2026-06-02T00:00:00Z", count: 1 },
	] as never);
});

afterEach(() => {
	rmSync(tempRoot, { recursive: true, force: true });
});

test("keeps Traefik request toggles on the existing Traefik YAML path", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("traefik");

	await caller.toggleRequests({ enable: true });

	expect(writeMainConfig).toHaveBeenCalledWith(
		expect.stringContaining("/etc/dokploy/traefik/dynamic/access.log"),
	);
	expect(compileAndWriteCaddyConfig).not.toHaveBeenCalled();
	expect(compileWriteAndValidateCaddyConfigSafely).not.toHaveBeenCalled();
	expect(audit).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ resourceName: "toggle-requests" }),
	);
});

test("reports Caddy request analytics state from persisted settings", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	requestLogsEnabled = true;

	const state = await caller.getRequestAnalyticsState();

	expect(state).toEqual({
		provider: "caddy",
		enabled: true,
		reloadResourceName: "dokploy-caddy",
		accessLogPath: caddyAccessLogPath,
	});
	expect(readMainConfig).not.toHaveBeenCalled();
});

test("toggles Caddy request logs without writing Traefik main config", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	await caller.toggleRequests({ enable: true });

	expect(updateWebServerSettings).toHaveBeenCalledWith({
		requestLogsEnabled: true,
	});
	expect(getCaddyCompileSettings).toHaveBeenCalledWith();
	expect(compileWriteAndValidateCaddyConfigSafely).toHaveBeenCalledWith({
		letsEncryptEmail: "ops@example.com",
		accessLogs: { enabled: true },
	});
	expect(compileAndWriteCaddyConfig).not.toHaveBeenCalled();
	expect(writeMainConfig).not.toHaveBeenCalled();
	expect(requestLogsEnabled).toBe(true);
});

test("preserves Caddy request-log settings when rewriting web-server setup", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	requestLogsEnabled = true;

	await caller.writeWebServerEnv({ env: "CADDY_ENV=1" });

	expect(writeWebServerSetup).toHaveBeenCalledWith(
		"caddy",
		expect.objectContaining({
			env: ["CADDY_ENV=1"],
			additionalPorts: [{ targetPort: 80, publishedPort: 80, protocol: "tcp" }],
			letsEncryptEmail: "ops@example.com",
			accessLogs: { enabled: true },
		}),
	);

	vi.mocked(writeWebServerSetup).mockClear();
	await caller.updateWebServerPorts({
		additionalPorts: [
			{ targetPort: 9000, publishedPort: 9000, protocol: "tcp" },
		],
	});

	expect(checkPortInUse).toHaveBeenCalledWith(9000, undefined);
	expect(writeWebServerSetup).toHaveBeenCalledWith(
		"caddy",
		expect.objectContaining({
			env: ["CADDY_ENV=1"],
			additionalPorts: [
				{ targetPort: 9000, publishedPort: 9000, protocol: "tcp" },
			],
			letsEncryptEmail: "ops@example.com",
			accessLogs: { enabled: true },
		}),
	);
});

test("restores Caddy request-log setting when generated config write fails", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	requestLogsEnabled = true;
	vi.mocked(compileWriteAndValidateCaddyConfigSafely).mockRejectedValueOnce(
		new Error("caddy write failed") as never,
	);

	await expect(caller.toggleRequests({ enable: false })).rejects.toThrow(
		"caddy write failed",
	);

	expect(updateWebServerSettings).toHaveBeenNthCalledWith(1, {
		requestLogsEnabled: false,
	});
	expect(updateWebServerSettings).toHaveBeenNthCalledWith(2, {
		requestLogsEnabled: true,
	});
	expect(requestLogsEnabled).toBe(true);
	expect(audit).not.toHaveBeenCalled();
});

test("does not allow generic web-server settings updates to toggle Caddy request logs", () => {
	const parsed = apiUpdateWebServerSettings.parse({
		requestLogsEnabled: true,
	});

	expect(parsed).not.toHaveProperty("requestLogsEnabled");
});

test("reads Caddy request stats from the Caddy access-log path", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	writeFileSync(caddyAccessLogPath, '{"caddy":true}\n');

	const logs = await caller.readStatsLogs({
		page: { pageIndex: 0, pageSize: 10 },
	});
	const stats = await caller.readStats();

	expect(readMonitoringConfig).not.toHaveBeenCalled();
	expect(parseRawConfig).toHaveBeenCalledWith(
		'{"caddy":true}\n',
		{ pageIndex: 0, pageSize: 10 },
		undefined,
		undefined,
		undefined,
		undefined,
	);
	expect(processLogs).toHaveBeenCalledWith('{"caddy":true}\n', undefined);
	expect(logs.totalCount).toBe(1);
	expect(stats).toEqual([{ hour: "2026-06-02T00:00:00Z", count: 1 }]);
});

test("reads the latest Caddy request log entries for paginated stats", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	writeFileSync(
		caddyAccessLogPath,
		Array.from({ length: 1001 }, (_, index) =>
			JSON.stringify({ caddy: true, index }),
		).join("\n"),
	);

	await caller.readStatsLogs({
		page: { pageIndex: 0, pageSize: 10 },
	});

	const rawLog = vi.mocked(parseRawConfig).mock.calls[0]?.[0] as string;
	expect(rawLog.split("\n").filter(Boolean)).toHaveLength(1000);
	expect(rawLog).not.toContain('"index":0');
	expect(rawLog).toContain('"index":1000');
});

test("bounds Caddy date-range request stats reads to the retained line window", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	writeFileSync(
		caddyAccessLogPath,
		Array.from({ length: 1001 }, (_, index) =>
			JSON.stringify({ caddy: true, index }),
		).join("\n"),
	);

	await caller.readStats({
		dateRange: {
			start: "2026-06-02T00:00:00.000Z",
			end: "2026-06-02T23:59:59.999Z",
		},
	});

	const rawLog = vi.mocked(processLogs).mock.calls[0]?.[0] as string;
	expect(rawLog.split("\n").filter(Boolean)).toHaveLength(1000);
	expect(rawLog).not.toContain('"index":0');
	expect(rawLog).toContain('"index":1000');
});
