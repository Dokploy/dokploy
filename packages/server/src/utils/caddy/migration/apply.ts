import * as path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	getDockerResourceSnapshot,
	readEnvironmentVariables,
	readPorts,
	stopDockerResource,
	waitForDockerResourceRunning,
	writeCaddySetup,
} from "@dokploy/server/services/settings";
import {
	getCaddyCompileSettings,
	resolveWebServerProvider,
	updateLocalWebServerProvider,
	updateRemoteWebServerProvider,
} from "@dokploy/server/services/web-server-settings";
import { filterTraefikCarryOverPortsForCaddyMigration } from "@dokploy/server/setup/caddy-setup";
import {
	reloadCaddyAfterValidation,
	validateCaddyConfigFileWithImage,
	validateCaddyConfigWithContainer,
} from "@dokploy/server/utils/caddy/config";
import {
	acquireCaddyMigrationOperationLock,
	appendCaddyMigrationEvent,
	copyMigrationFileInPlace,
	copyMigrationPath,
	loadCaddyMigrationReport,
	migrationPathExists,
	readMigrationTextFileIfExists,
	removeMigrationPath,
	writeCaddyMigrationReport,
	writeMigrationTextFile,
} from "./files";
import { rollbackCaddyMigration } from "./rollback";
import type {
	CaddyMigrationBackupSummary,
	CaddyMigrationFileBackup,
	CaddyMigrationReport,
	CaddyMigrationResourceSnapshot,
} from "./types";
import { runCaddyMigrationUpstreamPreflight } from "./upstream-preflight";

const updateProviderToCaddy = async (serverId?: string | null) => {
	if (serverId) {
		await updateRemoteWebServerProvider(serverId, "caddy");
		return;
	}
	await updateLocalWebServerProvider("caddy");
};

type CaddyMigrationCompileSettings = NonNullable<
	CaddyMigrationReport["compileSettings"]
>;

const normalizeCompileSettings = (
	settings: CaddyMigrationReport["compileSettings"],
): CaddyMigrationCompileSettings => ({
	letsEncryptEmail: settings?.letsEncryptEmail ?? null,
	trustedProxies: settings?.trustedProxies ?? null,
	accessLogs: settings?.accessLogs ?? null,
});

const compileSettingsChanged = (
	prepared: CaddyMigrationReport["compileSettings"],
	current: CaddyMigrationReport["compileSettings"],
) =>
	JSON.stringify(normalizeCompileSettings(prepared)) !==
	JSON.stringify(normalizeCompileSettings(current));

const createFileBackup = async (
	label: string,
	source: string,
	backupPath: string,
	serverId?: string | null,
): Promise<CaddyMigrationFileBackup> => {
	const existed = await migrationPathExists(source, serverId);
	if (existed) {
		await copyMigrationPath(source, backupPath, serverId);
	}
	return { label, source, backupPath, existed };
};

const redactResourceSnapshot = (
	snapshot: CaddyMigrationResourceSnapshot,
): CaddyMigrationResourceSnapshot => ({
	resourceName: snapshot.resourceName,
	resourceType: snapshot.resourceType,
	running: snapshot.running,
	replicas: snapshot.replicas,
	additionalPorts: snapshot.additionalPorts,
});

const createMigrationBackups = async (
	report: CaddyMigrationReport,
	serverId?: string,
): Promise<CaddyMigrationBackupSummary> => {
	const currentPaths = paths(!!serverId);
	const backupRoot = report.artifactPaths.backupsDir;
	const files: CaddyMigrationFileBackup[] = [];
	files.push(
		await createFileBackup(
			"traefik-static",
			path.posix.join(currentPaths.MAIN_TRAEFIK_PATH, "traefik.yml"),
			path.posix.join(backupRoot, "traefik", "traefik.yml"),
			serverId,
		),
	);
	files.push(
		await createFileBackup(
			"traefik-dynamic",
			currentPaths.DYNAMIC_TRAEFIK_PATH,
			path.posix.join(backupRoot, "traefik", "dynamic"),
			serverId,
		),
	);
	files.push(
		await createFileBackup(
			"caddy-config",
			currentPaths.CADDY_CONFIG_PATH,
			path.posix.join(backupRoot, "caddy", "caddy.json"),
			serverId,
		),
	);
	files.push(
		await createFileBackup(
			"caddy-fragments",
			currentPaths.CADDY_FRAGMENTS_PATH,
			path.posix.join(backupRoot, "caddy", "fragments"),
			serverId,
		),
	);

	const [traefikResource, caddyResource] = await Promise.all([
		getDockerResourceSnapshot("dokploy-traefik", serverId),
		getDockerResourceSnapshot("dokploy-caddy", serverId),
	]);
	const restoreSnapshotPath = path.posix.join(
		backupRoot,
		"resources.restore.json",
	);
	await writeMigrationTextFile(
		restoreSnapshotPath,
		`${JSON.stringify({ traefikResource, caddyResource }, null, 2)}\n`,
		serverId,
	);

	return {
		createdAt: new Date().toISOString(),
		traefikResource: redactResourceSnapshot(traefikResource),
		caddyResource: redactResourceSnapshot(caddyResource),
		restoreSnapshotPath,
		files,
	};
};

const readResourceEnvAndPorts = async (
	resourceName: string,
	serverId?: string,
) => {
	try {
		const [env, additionalPorts] = await Promise.all([
			readEnvironmentVariables(resourceName, serverId),
			readPorts(resourceName, serverId),
		]);
		return { env, additionalPorts };
	} catch {
		return { env: "", additionalPorts: [] };
	}
};

const validateAppliedCaddy = async (serverId?: string) => {
	await waitForDockerResourceRunning("dokploy-caddy", serverId, {
		retries: 30,
		intervalMs: 1000,
	});
	await validateCaddyConfigWithContainer(serverId);
};

const getLetsEncryptEmailFromConfig = async (
	caddyJsonPath: string,
	serverId?: string,
) => {
	const content = await readMigrationTextFileIfExists(caddyJsonPath, serverId);
	if (!content) return null;
	try {
		const config = JSON.parse(content) as {
			apps?: {
				tls?: {
					automation?: {
						policies?: Array<{
							issuers?: Array<{ email?: string }>;
						}>;
					};
				};
			};
		};
		return (
			config.apps?.tls?.automation?.policies?.[0]?.issuers?.[0]?.email ?? null
		);
	} catch {
		return null;
	}
};

const markFailed = async (
	report: CaddyMigrationReport,
	message: string,
	serverId?: string,
) => {
	const warning = {
		code: "apply-failed" as const,
		message,
		blocking: true,
	};
	return writeCaddyMigrationReport(
		appendCaddyMigrationEvent(
			{
				...report,
				status: "failed",
				warnings: [...report.warnings, warning],
				summary: {
					...report.summary,
					warnings: report.summary.warnings + 1,
					blockingWarnings: report.summary.blockingWarnings + 1,
				},
			},
			"apply_failed",
			message,
		),
		serverId,
	);
};

export const applyCaddyMigration = async (input: {
	migrationId: string;
	serverId?: string;
}) => {
	const releaseLock = await acquireCaddyMigrationOperationLock(
		input.migrationId,
		input.serverId,
	);
	try {
		return await applyCaddyMigrationUnlocked(input);
	} finally {
		await releaseLock();
	}
};

const applyCaddyMigrationUnlocked = async (input: {
	migrationId: string;
	serverId?: string;
}) => {
	const serverId = input.serverId;
	let report = await loadCaddyMigrationReport(input.migrationId, serverId);
	if (report.summary.blockingWarnings > 0) {
		throw new Error(
			`Cannot apply Caddy migration ${input.migrationId}: report has ${report.summary.blockingWarnings} blocking warning(s)`,
		);
	}
	if (report.validation.status !== "passed") {
		throw new Error(
			`Cannot apply Caddy migration ${input.migrationId}: draft validation did not pass`,
		);
	}
	if (report.status !== "prepared") {
		throw new Error(
			`Cannot apply Caddy migration ${input.migrationId}: report status is ${report.status}`,
		);
	}
	if (
		!(await migrationPathExists(report.artifactPaths.caddyJson, serverId)) ||
		!(await migrationPathExists(report.artifactPaths.fragmentsDir, serverId))
	) {
		throw new Error(
			`Cannot apply Caddy migration ${input.migrationId}: approved Caddy artifacts are missing`,
		);
	}
	const provider = await resolveWebServerProvider(serverId);
	if (provider !== "traefik") {
		throw new Error(
			`Cannot apply Caddy migration ${input.migrationId}: active provider is ${provider}`,
		);
	}
	const currentCompileSettings = await getCaddyCompileSettings(serverId);
	if (
		report.compileSettings &&
		compileSettingsChanged(report.compileSettings, currentCompileSettings)
	) {
		const message = `Cannot apply Caddy migration ${input.migrationId}: Caddy compile settings changed after prepare. Prepare a fresh migration dry run before applying.`;
		await markFailed(report, message, serverId);
		throw new Error(message);
	}

	report = await writeCaddyMigrationReport(
		appendCaddyMigrationEvent(
			{ ...report, status: "applying" },
			"applying",
			"Applying Caddy migration cutover",
		),
		serverId,
	);

	const runtimePreflight = await runCaddyMigrationUpstreamPreflight(report, {
		serverId,
	});
	report = await writeCaddyMigrationReport(
		appendCaddyMigrationEvent(
			{ ...report, runtimePreflight },
			"runtime_preflight",
			`Runtime upstream preflight ${runtimePreflight.status}`,
		),
		serverId,
	);
	if (runtimePreflight.status !== "passed") {
		const failedChecks = runtimePreflight.checks.filter(
			(check) => check.status === "failed",
		);
		const message =
			runtimePreflight.status === "failed"
				? `Runtime upstream preflight failed for ${failedChecks.length} upstream check(s)`
				: `Runtime upstream preflight did not pass: ${runtimePreflight.status}`;
		await markFailed(report, message, serverId);
		throw new Error(message);
	}

	try {
		await validateCaddyConfigFileWithImage(
			report.artifactPaths.caddyJson,
			serverId,
		);
	} catch (error) {
		const message = `Pre-stop Caddy runtime validation failed: ${
			error instanceof Error ? error.message : "unknown error"
		}`;
		await markFailed(report, message, serverId);
		throw error;
	}
	report = await writeCaddyMigrationReport(
		appendCaddyMigrationEvent(
			{ ...report },
			"pre_stop_caddy_validate",
			"Prepared Caddy config validated with the runtime Caddy image before stopping Traefik",
		),
		serverId,
	);

	try {
		const backup = await createMigrationBackups(report, serverId);
		report = await writeCaddyMigrationReport(
			appendCaddyMigrationEvent(
				{ ...report, backup },
				"backup_created",
				"Backed up Traefik and Caddy configuration before cutover",
			),
			serverId,
		);

		const currentPaths = paths(!!serverId);
		await removeMigrationPath(currentPaths.CADDY_FRAGMENTS_PATH, serverId);
		await copyMigrationPath(
			report.artifactPaths.fragmentsDir,
			currentPaths.CADDY_FRAGMENTS_PATH,
			serverId,
		);
		await copyMigrationPath(
			report.artifactPaths.caddyJson,
			currentPaths.CADDY_CONFIG_PATH,
			serverId,
		);

		const caddyRuntime = await readResourceEnvAndPorts(
			"dokploy-caddy",
			serverId,
		);
		const traefikRuntime = await readResourceEnvAndPorts(
			"dokploy-traefik",
			serverId,
		);
		const runtime = (await migrationPathExists(
			currentPaths.CADDY_CONFIG_PATH,
			serverId,
		))
			? {
					env: caddyRuntime.env || undefined,
					additionalPorts: caddyRuntime.additionalPorts.length
						? caddyRuntime.additionalPorts
						: traefikRuntime.additionalPorts,
				}
			: {
					env: undefined,
					additionalPorts: traefikRuntime.additionalPorts,
				};
		const caddyAdditionalPorts = filterTraefikCarryOverPortsForCaddyMigration(
			runtime.additionalPorts,
		);
		const droppedPorts = runtime.additionalPorts.filter(
			(port) => !caddyAdditionalPorts.includes(port),
		);
		if (droppedPorts.length) {
			report = await writeCaddyMigrationReport(
				appendCaddyMigrationEvent(
					{ ...report },
					"caddy_ports_filtered",
					`Dropped Traefik-only additional port(s) for Caddy: ${droppedPorts
						.map(
							(port) =>
								`${port.publishedPort}->${port.targetPort}/${port.protocol ?? "tcp"}`,
						)
						.join(", ")}`,
				),
				serverId,
			);
		}

		await stopDockerResource("dokploy-traefik", serverId);
		await writeCaddySetup({
			env: runtime.env ? runtime.env.split("\n").filter(Boolean) : undefined,
			additionalPorts: caddyAdditionalPorts,
			serverId,
			letsEncryptEmail: await getLetsEncryptEmailFromConfig(
				report.artifactPaths.caddyJson,
				serverId,
			),
			trustedProxies: currentCompileSettings.trustedProxies,
		});
		await copyMigrationFileInPlace(
			report.artifactPaths.caddyJson,
			currentPaths.CADDY_CONFIG_PATH,
			serverId,
		);
		await reloadCaddyAfterValidation(serverId);
		await validateAppliedCaddy(serverId);
		await updateProviderToCaddy(serverId);

		report = await writeCaddyMigrationReport(
			appendCaddyMigrationEvent(
				{ ...report, status: "applied" },
				"applied",
				"Caddy migration applied successfully",
			),
			serverId,
		);
		return report;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Caddy migration apply failed";
		report = await markFailed(report, message, serverId);
		try {
			await rollbackCaddyMigration({
				migrationId: input.migrationId,
				serverId,
				skipOperationLock: true,
			});
		} catch (rollbackError) {
			const rollbackMessage =
				rollbackError instanceof Error
					? rollbackError.message
					: "rollback failed";
			throw new Error(`${message}; rollback also failed: ${rollbackMessage}`);
		}
		throw error;
	}
};
