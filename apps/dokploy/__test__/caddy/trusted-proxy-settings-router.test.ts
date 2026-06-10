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
	compileWriteAndReloadCaddyConfigSafely,
	findServerById,
	getCaddyCompileSettings,
	getCaddyTrustedProxySettings,
	getWebServerResourceName,
	getWebServerSettings,
	isCaddyAdminAdditionalPort,
	isCaddyReservedAdditionalPort,
	prepareEnvironmentVariables,
	readEnvironmentVariables,
	readPorts,
	resolveWebServerProvider,
	updateCaddyTrustedProxySettings,
	updateServerCaddy,
	updateWebServerSettings,
	writeTraefikSetup,
	writeWebServerSetup,
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

const staticInput = {
	mode: "static" as const,
	ranges: ["192.0.2.0/24"],
	clientIpHeaders: ["X-Forwarded-For"],
	strict: true,
};

type TrustedProxySettings =
	| typeof staticInput
	| {
			mode: "cloudflare";
			ranges?: string[] | null;
			clientIpHeaders?: string[] | null;
			strict?: boolean | null;
	  }
	| null;

let persistedTrustedProxySettings: TrustedProxySettings;
let trustedProxyCallOrder: string[];

const trustedProxyCompileConfig = (settings: TrustedProxySettings) => {
	if (!settings) return null;
	if (settings.mode === "cloudflare") {
		return {
			source: "cloudflare" as const,
			clientIpHeaders: settings.clientIpHeaders ?? undefined,
			strict: settings.strict ?? true,
		};
	}
	return {
		source: "static" as const,
		ranges: settings.ranges,
		clientIpHeaders: settings.clientIpHeaders,
		strict: settings.strict,
	};
};

beforeEach(() => {
	vi.clearAllMocks();
	persistedTrustedProxySettings = null;
	trustedProxyCallOrder = [];
	vi.mocked(getCaddyCompileSettings).mockImplementation(async () => {
		trustedProxyCallOrder.push("read-compile-settings");
		return {
			letsEncryptEmail: "ops@example.com",
			trustedProxies: trustedProxyCompileConfig(persistedTrustedProxySettings),
		} as never;
	});
	vi.mocked(getCaddyTrustedProxySettings).mockImplementation(
		async () => persistedTrustedProxySettings as never,
	);
	vi.mocked(updateCaddyTrustedProxySettings).mockImplementation(
		async (settings) => {
			trustedProxyCallOrder.push("persist-settings");
			persistedTrustedProxySettings = settings as TrustedProxySettings;
			return {} as never;
		},
	);
	vi.mocked(compileWriteAndReloadCaddyConfigSafely).mockResolvedValue(
		undefined as never,
	);
	vi.mocked(readEnvironmentVariables).mockResolvedValue("");
	vi.mocked(prepareEnvironmentVariables).mockReturnValue([]);
	vi.mocked(getWebServerResourceName).mockImplementation((provider) =>
		provider === "caddy" ? "dokploy-caddy" : "dokploy-traefik",
	);
	vi.mocked(checkPortInUse).mockResolvedValue({ isInUse: false } as never);
	vi.mocked(findServerById).mockResolvedValue({
		serverId: "server-1",
		organizationId: "org-1",
	} as never);
	vi.mocked(isCaddyAdminAdditionalPort).mockImplementation(
		(port) => port.targetPort === 2019 && (port.protocol ?? "tcp") === "tcp",
	);
	vi.mocked(isCaddyReservedAdditionalPort).mockImplementation(
		(port) =>
			(port.targetPort === 2019 ||
				port.publishedPort === 2019 ||
				port.targetPort === 2020 ||
				port.publishedPort === 2020) &&
			(port.protocol ?? "tcp") === "tcp",
	);
	vi.mocked(writeWebServerSetup).mockResolvedValue(undefined as never);
	vi.mocked(writeTraefikSetup).mockResolvedValue(undefined as never);
});

test("persists Caddy trusted proxy settings without rebuilding when Traefik is active", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("traefik");

	const result = await caller.updateCaddyTrustedProxySettings(staticInput);

	expect(updateCaddyTrustedProxySettings).toHaveBeenCalledTimes(1);
	expect(updateCaddyTrustedProxySettings).toHaveBeenCalledWith(
		staticInput,
		undefined,
	);
	expect(compileWriteAndReloadCaddyConfigSafely).not.toHaveBeenCalled();
	expect(audit).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ resourceName: "caddy-trusted-proxy" }),
	);
	expect(result).toEqual(staticInput);
});

test("rebuilds Caddy with persisted compile settings when Caddy is active", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	await caller.updateCaddyTrustedProxySettings(staticInput);

	expect(getCaddyCompileSettings).toHaveBeenCalledWith(undefined);
	expect(compileWriteAndReloadCaddyConfigSafely).toHaveBeenCalledWith({
		serverId: undefined,
		letsEncryptEmail: "ops@example.com",
		trustedProxies: {
			source: "static",
			ranges: ["192.0.2.0/24"],
			clientIpHeaders: ["X-Forwarded-For"],
			strict: true,
		},
	});
	expect(trustedProxyCallOrder).toEqual([
		"persist-settings",
		"read-compile-settings",
	]);
	expect(audit).toHaveBeenCalled();
});

test("rebuilds remote Caddy with the remote persisted compile settings", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	await caller.updateCaddyTrustedProxySettings({
		...staticInput,
		serverId: "server-1",
	});

	expect(resolveWebServerProvider).toHaveBeenCalledWith("server-1");
	expect(updateCaddyTrustedProxySettings).toHaveBeenCalledWith(
		staticInput,
		"server-1",
	);
	expect(getCaddyCompileSettings).toHaveBeenCalledWith("server-1");
	expect(compileWriteAndReloadCaddyConfigSafely).toHaveBeenCalledWith({
		serverId: "server-1",
		letsEncryptEmail: "ops@example.com",
		trustedProxies: {
			source: "static",
			ranges: ["192.0.2.0/24"],
			clientIpHeaders: ["X-Forwarded-For"],
			strict: true,
		},
	});
});

test("restores previous trusted proxy settings when active Caddy rebuild fails", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	persistedTrustedProxySettings = {
		mode: "cloudflare",
		clientIpHeaders: ["CF-Connecting-IP"],
		strict: true,
	};
	vi.mocked(compileWriteAndReloadCaddyConfigSafely).mockRejectedValueOnce(
		new Error("caddy reload failed") as never,
	);

	await expect(
		caller.updateCaddyTrustedProxySettings(staticInput),
	).rejects.toThrow("caddy reload failed");

	expect(updateCaddyTrustedProxySettings).toHaveBeenNthCalledWith(
		1,
		staticInput,
		undefined,
	);
	expect(updateCaddyTrustedProxySettings).toHaveBeenNthCalledWith(
		2,
		{
			mode: "cloudflare",
			clientIpHeaders: ["CF-Connecting-IP"],
			strict: true,
		},
		undefined,
	);
	expect(persistedTrustedProxySettings).toEqual({
		mode: "cloudflare",
		clientIpHeaders: ["CF-Connecting-IP"],
		strict: true,
	});
	expect(audit).not.toHaveBeenCalled();
});

test("restores remote trusted proxy settings when remote Caddy rebuild fails", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	persistedTrustedProxySettings = {
		mode: "cloudflare",
		clientIpHeaders: ["CF-Connecting-IP"],
		strict: true,
	};
	vi.mocked(compileWriteAndReloadCaddyConfigSafely).mockRejectedValueOnce(
		new Error("remote caddy reload failed") as never,
	);

	await expect(
		caller.updateCaddyTrustedProxySettings({
			...staticInput,
			serverId: "server-1",
		}),
	).rejects.toThrow("remote caddy reload failed");

	expect(resolveWebServerProvider).toHaveBeenCalledWith("server-1");
	expect(getCaddyCompileSettings).toHaveBeenCalledWith("server-1");
	expect(compileWriteAndReloadCaddyConfigSafely).toHaveBeenCalledWith({
		serverId: "server-1",
		letsEncryptEmail: "ops@example.com",
		trustedProxies: {
			source: "static",
			ranges: ["192.0.2.0/24"],
			clientIpHeaders: ["X-Forwarded-For"],
			strict: true,
		},
	});
	expect(updateCaddyTrustedProxySettings).toHaveBeenNthCalledWith(
		1,
		staticInput,
		"server-1",
	);
	expect(updateCaddyTrustedProxySettings).toHaveBeenNthCalledWith(
		2,
		{
			mode: "cloudflare",
			clientIpHeaders: ["CF-Connecting-IP"],
			strict: true,
		},
		"server-1",
	);
	expect(persistedTrustedProxySettings).toEqual({
		mode: "cloudflare",
		clientIpHeaders: ["CF-Connecting-IP"],
		strict: true,
	});
	expect(audit).not.toHaveBeenCalled();
});

test("reports Caddy dashboard disabled instead of exposing the Caddy admin API", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	const result = await caller.getWebServerDashboardState({});

	expect(result).toEqual({ provider: "caddy", enabled: false });
	expect(readPorts).not.toHaveBeenCalled();
});

test("keeps Traefik dashboard state based on the Traefik dashboard port", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("traefik");
	vi.mocked(readPorts).mockResolvedValue([
		{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
	] as never);

	const result = await caller.getWebServerDashboardState({});

	expect(readPorts).toHaveBeenCalledWith("dokploy-traefik", undefined);
	expect(result).toEqual({ provider: "traefik", enabled: true });
});

test("rejects direct dashboard toggles when Caddy is active", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	await expect(
		caller.toggleDashboard({ enableDashboard: true }),
	).rejects.toThrow("Caddy admin API is kept local-only");

	expect(readPorts).not.toHaveBeenCalled();
	expect(readEnvironmentVariables).not.toHaveBeenCalled();
	expect(prepareEnvironmentVariables).not.toHaveBeenCalled();
	expect(checkPortInUse).not.toHaveBeenCalled();
	expect(writeTraefikSetup).not.toHaveBeenCalled();
	expect(audit).not.toHaveBeenCalled();
});

test("keeps dashboard toggles available when Traefik is active", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("traefik");
	vi.mocked(readPorts).mockResolvedValue([]);
	vi.mocked(readEnvironmentVariables).mockResolvedValue("TRAEFIK_ENV=1");
	vi.mocked(prepareEnvironmentVariables).mockReturnValue(["TRAEFIK_ENV=1"]);

	await caller.toggleDashboard({ enableDashboard: true });

	expect(readPorts).toHaveBeenCalledWith("dokploy-traefik", undefined);
	expect(readEnvironmentVariables).toHaveBeenCalledWith(
		"dokploy-traefik",
		undefined,
	);
	expect(checkPortInUse).toHaveBeenCalledWith(8080, undefined);
	expect(writeTraefikSetup).toHaveBeenCalledWith({
		env: ["TRAEFIK_ENV=1"],
		additionalPorts: [
			{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
		],
		serverId: undefined,
	});
	expect(audit).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ resourceName: "toggle-dashboard" }),
	);
});

test("restores dashboard settings when active Caddy domain rewrite fails", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");
	const previousSettings = {
		host: "old-dashboard.example.com",
		letsEncryptEmail: "old-ops@example.com",
		certificateType: "letsencrypt",
		https: true,
	};
	const updatedSettings = {
		...previousSettings,
		host: "new-dashboard.example.com",
		letsEncryptEmail: "new-ops@example.com",
	};
	vi.mocked(getWebServerSettings).mockResolvedValue(previousSettings as never);
	vi.mocked(updateWebServerSettings)
		.mockResolvedValueOnce(updatedSettings as never)
		.mockResolvedValueOnce(previousSettings as never);
	vi.mocked(updateServerCaddy).mockRejectedValueOnce(
		new Error("caddy reload failed") as never,
	);

	await expect(
		caller.assignDomainServer({
			host: "new-dashboard.example.com",
			letsEncryptEmail: "new-ops@example.com",
			certificateType: "letsencrypt",
			https: true,
		}),
	).rejects.toThrow("caddy reload failed");

	expect(updateWebServerSettings).toHaveBeenNthCalledWith(1, {
		host: "new-dashboard.example.com",
		letsEncryptEmail: "new-ops@example.com",
		certificateType: "letsencrypt",
		https: true,
	});
	expect(updateWebServerSettings).toHaveBeenNthCalledWith(2, previousSettings);
	expect(updateServerCaddy).toHaveBeenCalledWith(
		updatedSettings,
		"new-dashboard.example.com",
	);
	expect(audit).not.toHaveBeenCalled();
});

test("reads remote Traefik dashboard state from the remote web server", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("traefik");
	vi.mocked(readPorts).mockResolvedValue([
		{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
	] as never);

	const result = await caller.getWebServerDashboardState({
		serverId: "server-1",
	});

	expect(resolveWebServerProvider).toHaveBeenCalledWith("server-1");
	expect(readPorts).toHaveBeenCalledWith("dokploy-traefik", "server-1");
	expect(result).toEqual({ provider: "traefik", enabled: true });
});

test("rejects Caddy admin port publishing before rebuilding the web server", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	await expect(
		caller.updateWebServerPorts({
			additionalPorts: [
				{ targetPort: 2019, publishedPort: 2019, protocol: "tcp" },
			],
		}),
	).rejects.toThrow("reserved and cannot be published");

	expect(checkPortInUse).not.toHaveBeenCalled();
	expect(writeWebServerSetup).not.toHaveBeenCalled();
});

test("allows non-admin Caddy additional ports before rebuilding the web server", async () => {
	vi.mocked(resolveWebServerProvider).mockResolvedValue("caddy");

	await caller.updateWebServerPorts({
		additionalPorts: [
			{ targetPort: 8080, publishedPort: 18080, protocol: "tcp" },
			{ targetPort: 8082, publishedPort: 18082, protocol: "tcp" },
		],
	});

	expect(checkPortInUse).toHaveBeenCalledWith(18080, undefined);
	expect(checkPortInUse).toHaveBeenCalledWith(18082, undefined);
	expect(writeWebServerSetup).toHaveBeenCalledWith(
		"caddy",
		expect.objectContaining({
			additionalPorts: [
				{ targetPort: 8080, publishedPort: 18080, protocol: "tcp" },
				{ targetPort: 8082, publishedPort: 18082, protocol: "tcp" },
			],
			serverId: undefined,
		}),
	);
	expect(audit).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({ resourceName: "web-server-ports" }),
	);
});
