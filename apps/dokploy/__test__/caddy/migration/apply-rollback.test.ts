import { fs, vol } from "memfs";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

vi.mock("@dokploy/server/services/settings", () => ({
	getDockerResourceSnapshot: vi.fn(),
	readEnvironmentVariables: vi.fn(),
	readPorts: vi.fn(),
	stopDockerResource: vi.fn(),
	startDockerResourceFromSnapshot: vi.fn(),
	ensureTraefikRunningFromSnapshot: vi.fn(),
	waitForDockerResourceRunning: vi.fn(),
	writeCaddySetup: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getCaddyCompileSettings: vi.fn(),
	resolveWebServerProvider: vi.fn(),
	updateLocalWebServerProvider: vi.fn(),
	updateRemoteWebServerProvider: vi.fn(),
}));

vi.mock("@dokploy/server/utils/caddy/config", () => ({
	CADDY_METRICS_PORT: 2020,
	reloadCaddyAfterValidation: vi.fn(),
	validateCaddyConfigFileWithImage: vi.fn(),
	validateCaddyConfigWithContainer: vi.fn(),
}));

vi.mock("@dokploy/server/utils/caddy/migration/upstream-preflight", () => ({
	runCaddyMigrationUpstreamPreflight: vi.fn(),
}));

import { paths } from "@dokploy/server/constants";
import * as settingsService from "@dokploy/server/services/settings";
import * as providerService from "@dokploy/server/services/web-server-settings";
import * as caddyConfig from "@dokploy/server/utils/caddy/config";
import { applyCaddyMigration } from "@dokploy/server/utils/caddy/migration/apply";
import { getCaddyMigrationArtifactPaths } from "@dokploy/server/utils/caddy/migration/files";
import { rollbackCaddyMigration } from "@dokploy/server/utils/caddy/migration/rollback";
import type { CaddyMigrationReport } from "@dokploy/server/utils/caddy/migration/types";
import * as upstreamPreflight from "@dokploy/server/utils/caddy/migration/upstream-preflight";

const createReport = (migrationId: string): CaddyMigrationReport => {
	const artifactPaths = getCaddyMigrationArtifactPaths(migrationId);
	return {
		migrationId,
		serverId: null,
		createdAt: "2026-05-22T00:00:00.000Z",
		updatedAt: "2026-05-22T00:00:00.000Z",
		status: "prepared",
		sourceProvider: "traefik",
		targetProvider: "caddy",
		artifactPaths,
		inputs: {
			traefikStaticConfigPath: `${paths().MAIN_TRAEFIK_PATH}/traefik.yml`,
			traefikStaticConfigFound: true,
			dynamicFiles: [],
			dbApplicationDomains: 0,
			dbComposeDomains: 0,
			composeFilesScanned: [],
			composeFilesSkipped: [],
		},
		summary: {
			fragments: 1,
			routes: 1,
			warnings: 0,
			blockingWarnings: 0,
		},
		validation: { status: "passed", message: "ok" },
		compileSettings: {
			letsEncryptEmail: null,
			trustedProxies: null,
		},
		warnings: [],
		events: [],
	};
};

const seedMigration = (migrationId: string) => {
	const report = createReport(migrationId);
	const currentPaths = paths();
	vol.mkdirSync(report.artifactPaths.fragmentsDir, { recursive: true });
	vol.writeFileSync(
		`${report.artifactPaths.fragmentsDir}/app.json`,
		JSON.stringify({ version: 1, id: "app", source: "manual", routes: [] }),
	);
	vol.writeFileSync(report.artifactPaths.caddyJson, '{"apps":{"http":{}}}\n');
	vol.writeFileSync(
		report.artifactPaths.reportJson,
		`${JSON.stringify(report, null, 2)}\n`,
	);
	vol.mkdirSync(currentPaths.MAIN_TRAEFIK_PATH, { recursive: true });
	vol.writeFileSync(
		`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
		"entryPoints: {}\n",
	);
	vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
	vol.writeFileSync(
		`${currentPaths.DYNAMIC_TRAEFIK_PATH}/app.yml`,
		"http: {}\n",
	);
	vol.mkdirSync(currentPaths.CADDY_FRAGMENTS_PATH, { recursive: true });
	vol.writeFileSync(`${currentPaths.CADDY_FRAGMENTS_PATH}/old.json`, "{}\n");
	vol.writeFileSync(currentPaths.CADDY_CONFIG_PATH, '{"old":true}\n');
	return report;
};

describe("applyCaddyMigration", () => {
	beforeEach(() => {
		vol.reset();
		vi.clearAllMocks();
		vi.mocked(providerService.resolveWebServerProvider).mockResolvedValue(
			"traefik",
		);
		vi.mocked(providerService.getCaddyCompileSettings).mockResolvedValue({
			trustedProxies: null,
		});
		vi.mocked(settingsService.getDockerResourceSnapshot).mockImplementation(
			async (resourceName: string) => ({
				resourceName,
				resourceType:
					resourceName === "dokploy-traefik" ? "standalone" : "unknown",
				running: resourceName === "dokploy-traefik",
			}),
		);
		vi.mocked(settingsService.readEnvironmentVariables).mockResolvedValue("");
		vi.mocked(settingsService.readPorts).mockResolvedValue([]);
		vi.mocked(settingsService.waitForDockerResourceRunning).mockResolvedValue({
			resourceName: "dokploy-caddy",
			resourceType: "standalone",
			running: true,
		});
		vi.mocked(
			settingsService.ensureTraefikRunningFromSnapshot,
		).mockResolvedValue(undefined);
		vi.mocked(caddyConfig.reloadCaddyAfterValidation).mockResolvedValue(
			{} as any,
		);
		vi.mocked(caddyConfig.validateCaddyConfigFileWithImage).mockResolvedValue(
			{} as any,
		);
		vi.mocked(caddyConfig.validateCaddyConfigWithContainer).mockResolvedValue(
			{} as any,
		);
		vi.mocked(
			upstreamPreflight.runCaddyMigrationUpstreamPreflight,
		).mockResolvedValue({
			status: "passed",
			checkedAt: "2026-05-22T00:00:00.000Z",
			network: "dokploy-network",
			probeImage: "busybox:1.36",
			checks: [],
		});
	});

	test("rejects a concurrent migration operation while a lock exists", async () => {
		const report = seedMigration("caddy-apply-locked");
		vol.mkdirSync(`${report.artifactPaths.root}/.operation.lock`);

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("already has an apply or rollback operation in progress");
		expect(
			upstreamPreflight.runCaddyMigrationUpstreamPreflight,
		).not.toHaveBeenCalled();
	});

	test("writes approved artifacts, starts Caddy, validates, then updates provider", async () => {
		const report = seedMigration("caddy-apply-success");
		vi.mocked(settingsService.readPorts).mockImplementation(
			async (resourceName: string) =>
				resourceName === "dokploy-traefik"
					? [
							{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
							{ targetPort: 8082, publishedPort: 8082, protocol: "tcp" },
							{ targetPort: 2019, publishedPort: 2019, protocol: "tcp" },
							{ targetPort: 9000, publishedPort: 9000, protocol: "tcp" },
						]
					: [],
		);

		const applied = await applyCaddyMigration({
			migrationId: report.migrationId,
		});

		expect(applied.status).toBe("applied");
		expect(settingsService.stopDockerResource).toHaveBeenCalledWith(
			"dokploy-traefik",
			undefined,
		);
		expect(
			vi.mocked(upstreamPreflight.runCaddyMigrationUpstreamPreflight).mock
				.invocationCallOrder[0],
		).toBeLessThan(
			vi.mocked(settingsService.stopDockerResource).mock
				.invocationCallOrder[0] ?? 0,
		);
		expect(caddyConfig.validateCaddyConfigFileWithImage).toHaveBeenCalledWith(
			report.artifactPaths.caddyJson,
			undefined,
		);
		expect(
			vi.mocked(caddyConfig.validateCaddyConfigFileWithImage).mock
				.invocationCallOrder[0],
		).toBeLessThan(
			vi.mocked(settingsService.stopDockerResource).mock
				.invocationCallOrder[0] ?? 0,
		);
		expect(settingsService.writeCaddySetup).toHaveBeenCalledWith(
			expect.objectContaining({
				additionalPorts: [
					{ targetPort: 9000, publishedPort: 9000, protocol: "tcp" },
				],
			}),
		);
		expect(caddyConfig.validateCaddyConfigWithContainer).toHaveBeenCalled();
		expect(providerService.updateLocalWebServerProvider).toHaveBeenCalledWith(
			"caddy",
		);
		expect(
			vi.mocked(caddyConfig.validateCaddyConfigWithContainer).mock
				.invocationCallOrder[0],
		).toBeLessThan(
			vi.mocked(providerService.updateLocalWebServerProvider).mock
				.invocationCallOrder[0] ?? 0,
		);
		expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
			'{"apps":{"http":{}}}\n',
		);
		expect(vol.existsSync(`${paths().CADDY_FRAGMENTS_PATH}/app.json`)).toBe(
			true,
		);
	});

	test("applies and rolls back approved Caddy custom certificate artifacts", async () => {
		const report = seedMigration("caddy-custom-cert-apply-rollback");
		const certificatePath = `${paths().CERTIFICATES_PATH}/certificate-uploaded`;
		const loadFiles = [
			{
				certificate: `${certificatePath}/chain.crt`,
				key: `${certificatePath}/privkey.key`,
			},
		];
		vol.writeFileSync(
			report.artifactPaths.caddyJson,
			`${JSON.stringify(
				{
					apps: {
						http: {},
						tls: {
							certificates: {
								load_files: loadFiles,
							},
						},
					},
				},
				null,
				2,
			)}\n`,
		);
		vi.mocked(
			caddyConfig.validateCaddyConfigFileWithImage,
		).mockImplementationOnce(async (filePath: string) => {
			const validatedConfig = JSON.parse(
				vol.readFileSync(filePath, "utf8") as string,
			);
			expect(validatedConfig.apps.tls.certificates.load_files).toEqual(
				loadFiles,
			);
			return {} as any;
		});

		const applied = await applyCaddyMigration({
			migrationId: report.migrationId,
		});

		expect(applied.status).toBe("applied");
		expect(caddyConfig.validateCaddyConfigFileWithImage).toHaveBeenCalledWith(
			report.artifactPaths.caddyJson,
			undefined,
		);
		const activeConfig = JSON.parse(
			vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8") as string,
		);
		expect(activeConfig.apps.tls.certificates.load_files).toEqual(loadFiles);

		const rolledBack = await rollbackCaddyMigration({
			migrationId: report.migrationId,
		});

		expect(rolledBack.status).toBe("rolled_back");
		expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
			'{"old":true}\n',
		);
		expect(vol.existsSync(`${paths().CADDY_FRAGMENTS_PATH}/old.json`)).toBe(
			true,
		);
		expect(providerService.updateLocalWebServerProvider).toHaveBeenCalledWith(
			"traefik",
		);
	});

	test("rejects apply when Caddy compile settings changed after prepare", async () => {
		const report = seedMigration("caddy-apply-stale-settings");
		vi.mocked(providerService.getCaddyCompileSettings).mockResolvedValueOnce({
			trustedProxies: {
				source: "cloudflare",
			},
		});

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("Caddy compile settings changed after prepare");

		expect(
			upstreamPreflight.runCaddyMigrationUpstreamPreflight,
		).not.toHaveBeenCalled();
		expect(settingsService.stopDockerResource).not.toHaveBeenCalled();
		expect(settingsService.writeCaddySetup).not.toHaveBeenCalled();
		const failedReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(failedReport.status).toBe("failed");
		expect(failedReport.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "apply-failed",
					message: expect.stringContaining("Caddy compile settings changed"),
				}),
			]),
		);
	});

	test("rejects apply when Caddy request-log compile settings changed after prepare", async () => {
		const report = seedMigration("caddy-apply-stale-request-logs");
		vi.mocked(providerService.getCaddyCompileSettings).mockResolvedValueOnce({
			trustedProxies: null,
			accessLogs: { enabled: true },
		});

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("Caddy compile settings changed after prepare");

		expect(
			upstreamPreflight.runCaddyMigrationUpstreamPreflight,
		).not.toHaveBeenCalled();
		expect(settingsService.stopDockerResource).not.toHaveBeenCalled();
		expect(settingsService.writeCaddySetup).not.toHaveBeenCalled();
		const failedReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(failedReport.status).toBe("failed");
		expect(failedReport.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "apply-failed",
					message: expect.stringContaining("Caddy compile settings changed"),
				}),
			]),
		);
	});

	test("rewrites the mounted Caddy config file in place after setup", async () => {
		const report = seedMigration("caddy-apply-preserves-config-inode");
		let mountedConfigFd: number | undefined;
		vi.mocked(settingsService.writeCaddySetup).mockImplementationOnce(
			async () => {
				vol.writeFileSync(
					paths().CADDY_CONFIG_PATH,
					'{"generatedBySetup":true}\n',
				);
				mountedConfigFd = fs.openSync(paths().CADDY_CONFIG_PATH, "r");
			},
		);

		await applyCaddyMigration({
			migrationId: report.migrationId,
		});

		expect(mountedConfigFd).toBeDefined();
		const mountedContent = Buffer.alloc(1024);
		const bytesRead = fs.readSync(
			mountedConfigFd as number,
			mountedContent,
			0,
			mountedContent.length,
			0,
		);
		fs.closeSync(mountedConfigFd as number);
		expect(mountedContent.toString("utf8", 0, bytesRead)).toBe(
			'{"apps":{"http":{}}}\n',
		);
		expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
			'{"apps":{"http":{}}}\n',
		);
	});

	test("runtime upstream preflight failure stops apply before Traefik is stopped", async () => {
		const report = seedMigration("caddy-preflight-fails");
		vi.mocked(
			upstreamPreflight.runCaddyMigrationUpstreamPreflight,
		).mockResolvedValueOnce({
			status: "failed",
			checkedAt: "2026-05-22T00:00:00.000Z",
			network: "dokploy-network",
			probeImage: "busybox:1.36",
			checks: [
				{
					dial: "missing:3000",
					host: "missing",
					port: 3000,
					network: "dokploy-network",
					status: "failed",
					reason: "DNS resolution failed",
					routes: [],
				},
			],
		});

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("Runtime upstream preflight failed");

		expect(settingsService.stopDockerResource).not.toHaveBeenCalledWith(
			"dokploy-traefik",
			undefined,
		);
		expect(settingsService.writeCaddySetup).not.toHaveBeenCalled();
		expect(
			settingsService.ensureTraefikRunningFromSnapshot,
		).not.toHaveBeenCalled();
		const finalReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(finalReport.status).toBe("failed");
		expect(finalReport.runtimePreflight?.status).toBe("failed");
	});

	test("rolls back to Traefik and keeps provider Traefik when Caddy setup fails", async () => {
		const report = seedMigration("caddy-apply-fails");
		vi.mocked(settingsService.writeCaddySetup).mockRejectedValueOnce(
			new Error("caddy failed"),
		);

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("caddy failed");

		expect(
			providerService.updateLocalWebServerProvider,
		).not.toHaveBeenCalledWith("caddy");
		expect(providerService.updateLocalWebServerProvider).toHaveBeenCalledWith(
			"traefik",
		);
		expect(settingsService.stopDockerResource).toHaveBeenCalledWith(
			"dokploy-caddy",
			undefined,
		);
		expect(
			settingsService.ensureTraefikRunningFromSnapshot,
		).toHaveBeenCalledWith(
			expect.objectContaining({ resourceName: "dokploy-traefik" }),
			undefined,
		);
		const finalReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(finalReport.status).toBe("rolled_back");
	});

	test("uses restore-only unredacted resource snapshot during rollback", async () => {
		const report = seedMigration("caddy-restore-snapshot");
		vi.mocked(settingsService.getDockerResourceSnapshot).mockImplementation(
			async (resourceName: string) => ({
				resourceName,
				resourceType:
					resourceName === "dokploy-traefik" ? "standalone" : "unknown",
				running: resourceName === "dokploy-traefik",
				env: resourceName === "dokploy-traefik" ? "SECRET=value" : undefined,
				image:
					resourceName === "dokploy-traefik"
						? "private.registry.example/traefik:latest"
						: undefined,
				binds:
					resourceName === "dokploy-traefik"
						? ["/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json"]
						: undefined,
				labels:
					resourceName === "dokploy-traefik"
						? { "secret.label": "private" }
						: undefined,
			}),
		);
		vi.mocked(settingsService.writeCaddySetup).mockRejectedValueOnce(
			new Error("caddy failed"),
		);

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("caddy failed");

		const finalReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(finalReport.backup?.traefikResource?.env).toBeUndefined();
		expect(finalReport.backup?.traefikResource?.binds).toBeUndefined();
		expect(finalReport.backup?.traefikResource?.labels).toBeUndefined();
		expect(finalReport.backup?.traefikResource?.image).toBeUndefined();
		expect(finalReport.backup?.traefikResource).toMatchObject({
			resourceName: "dokploy-traefik",
			resourceType: "standalone",
			running: true,
		});
		expect(finalReport.backup?.restoreSnapshotPath).toBeTruthy();
		const restoreSnapshots = JSON.parse(
			vol.readFileSync(
				finalReport.backup?.restoreSnapshotPath ?? "",
				"utf8",
			) as string,
		) as { traefikResource: { env?: string; binds?: string[] } };
		expect(restoreSnapshots.traefikResource.env).toBe("SECRET=value");
		expect(restoreSnapshots.traefikResource.binds).toEqual([
			"/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json",
		]);
		expect(
			settingsService.ensureTraefikRunningFromSnapshot,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				env: "SECRET=value",
				binds: ["/etc/dokploy/traefik/acme.json:/letsencrypt/acme.json"],
			}),
			undefined,
		);
	});

	test("rollback failure leaves provider unchanged and writes failed report", async () => {
		const report = seedMigration("caddy-rollback-traefik-fails");
		vi.mocked(settingsService.writeCaddySetup).mockRejectedValueOnce(
			new Error("caddy failed"),
		);
		vi.mocked(
			settingsService.ensureTraefikRunningFromSnapshot,
		).mockRejectedValueOnce(new Error("traefik missing"));

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("caddy failed");

		expect(
			providerService.updateLocalWebServerProvider,
		).not.toHaveBeenCalledWith("traefik");
		const finalReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(finalReport.status).toBe("failed");
		expect(finalReport.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "rollback-failed",
					message: "traefik missing",
					blocking: true,
				}),
			]),
		);
	});

	test("restores backed-up Caddy files when post-start validation fails", async () => {
		const report = seedMigration("caddy-validation-fails");
		vi.mocked(
			caddyConfig.validateCaddyConfigWithContainer,
		).mockRejectedValueOnce(new Error("validation failed"));

		await expect(
			applyCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("validation failed");

		expect(
			providerService.updateLocalWebServerProvider,
		).not.toHaveBeenCalledWith("caddy");
		expect(providerService.updateLocalWebServerProvider).toHaveBeenCalledWith(
			"traefik",
		);
		expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
			'{"old":true}\n',
		);
		expect(vol.existsSync(`${paths().CADDY_FRAGMENTS_PATH}/old.json`)).toBe(
			true,
		);
		expect(vol.existsSync(`${paths().CADDY_FRAGMENTS_PATH}/app.json`)).toBe(
			false,
		);

		const finalReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(finalReport.status).toBe("rolled_back");
	});

	test("fails closed when an expected rollback backup path is missing", async () => {
		const report = seedMigration("caddy-missing-traefik-backup");
		const traefikConfigPath = `${paths().MAIN_TRAEFIK_PATH}/traefik.yml`;
		vol.writeFileSync(
			report.artifactPaths.reportJson,
			`${JSON.stringify(
				{
					...report,
					status: "applied",
					backup: {
						createdAt: "2026-05-22T00:00:00.000Z",
						traefikResource: {
							resourceName: "dokploy-traefik",
							resourceType: "standalone",
							running: true,
						},
						files: [
							{
								label: "traefik-static",
								source: traefikConfigPath,
								backupPath: `${report.artifactPaths.backupsDir}/missing-traefik.yml`,
								existed: true,
							},
						],
					},
				},
				null,
				2,
			)}\n`,
		);

		await expect(
			rollbackCaddyMigration({ migrationId: report.migrationId }),
		).rejects.toThrow("backup path is missing");

		expect(vol.readFileSync(traefikConfigPath, "utf8")).toBe(
			"entryPoints: {}\n",
		);
		expect(
			settingsService.ensureTraefikRunningFromSnapshot,
		).not.toHaveBeenCalled();
		expect(
			providerService.updateLocalWebServerProvider,
		).not.toHaveBeenCalledWith("traefik");

		const finalReport = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		) as CaddyMigrationReport;
		expect(finalReport.status).toBe("failed");
		expect(finalReport.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "rollback-failed",
					blocking: true,
				}),
			]),
		);
	});

	test("rolls back older reports that have backup metadata without file entries", async () => {
		const report = seedMigration("caddy-old-backup-report");
		vol.writeFileSync(
			report.artifactPaths.reportJson,
			`${JSON.stringify(
				{
					...report,
					status: "applied",
					backup: {
						createdAt: "2026-05-22T00:00:00.000Z",
						traefikResource: {
							resourceName: "dokploy-traefik",
							resourceType: "standalone",
							running: true,
						},
					},
				},
				null,
				2,
			)}\n`,
		);

		const rolledBack = await rollbackCaddyMigration({
			migrationId: report.migrationId,
		});

		expect(rolledBack.status).toBe("rolled_back");
		expect(
			settingsService.ensureTraefikRunningFromSnapshot,
		).toHaveBeenCalledWith(
			expect.objectContaining({ resourceName: "dokploy-traefik" }),
			undefined,
		);
		expect(providerService.updateLocalWebServerProvider).toHaveBeenCalledWith(
			"traefik",
		);
	});
});
