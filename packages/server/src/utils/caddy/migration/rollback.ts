import * as path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	ensureTraefikRunningFromSnapshot,
	stopDockerResource,
} from "@dokploy/server/services/settings";
import {
	updateLocalWebServerProvider,
	updateRemoteWebServerProvider,
} from "@dokploy/server/services/web-server-settings";
import {
	acquireCaddyMigrationOperationLock,
	appendCaddyMigrationEvent,
	copyMigrationPath,
	getCaddyMigrationArtifactPaths,
	loadCaddyMigrationReport,
	migrationPathExists,
	readMigrationTextFileIfExists,
	removeMigrationPath,
	writeCaddyMigrationReport,
} from "./files";
import type {
	CaddyMigrationReport,
	CaddyMigrationResourceSnapshot,
} from "./types";

const updateProviderToTraefik = async (serverId?: string | null) => {
	if (serverId) {
		await updateRemoteWebServerProvider(serverId, "traefik");
		return;
	}
	await updateLocalWebServerProvider("traefik");
};

const restorePathFromBackup = async (
	backupSource: string,
	liveDestination: string,
	existed?: boolean,
	serverId?: string | null,
) => {
	if (existed === true) {
		if (!(await migrationPathExists(backupSource, serverId))) {
			throw new Error(
				`Cannot restore ${liveDestination}: backup path is missing at ${backupSource}`,
			);
		}
		await copyMigrationPath(backupSource, liveDestination, serverId);
		return;
	}
	if (existed === false) {
		await removeMigrationPath(liveDestination, serverId);
	}
};

const loadRestoreSnapshots = async (
	report: CaddyMigrationReport,
	serverId?: string | null,
): Promise<{
	traefikResource?: CaddyMigrationResourceSnapshot;
	caddyResource?: CaddyMigrationResourceSnapshot;
}> => {
	const restoreSnapshotPath = report.backup?.restoreSnapshotPath;
	if (!restoreSnapshotPath) {
		return {
			traefikResource: report.backup?.traefikResource,
			caddyResource: report.backup?.caddyResource,
		};
	}
	const content = await readMigrationTextFileIfExists(
		restoreSnapshotPath,
		serverId,
	);
	if (!content) {
		return {
			traefikResource: report.backup?.traefikResource,
			caddyResource: report.backup?.caddyResource,
		};
	}
	return JSON.parse(content) as {
		traefikResource?: CaddyMigrationResourceSnapshot;
		caddyResource?: CaddyMigrationResourceSnapshot;
	};
};

export const rollbackCaddyMigration = async (input: {
	migrationId: string;
	serverId?: string;
	skipOperationLock?: boolean;
}) => {
	const releaseLock = input.skipOperationLock
		? null
		: await acquireCaddyMigrationOperationLock(
				input.migrationId,
				input.serverId,
			);
	try {
		return await rollbackCaddyMigrationUnlocked(input);
	} finally {
		await releaseLock?.();
	}
};

const rollbackCaddyMigrationUnlocked = async (input: {
	migrationId: string;
	serverId?: string;
}) => {
	const serverId = input.serverId;
	let report = await loadCaddyMigrationReport(input.migrationId, serverId);
	if (!report.backup) {
		throw new Error(
			`Cannot roll back Caddy migration ${input.migrationId}: no backup metadata is available`,
		);
	}
	report = await writeCaddyMigrationReport(
		appendCaddyMigrationEvent(
			{ ...report, status: "rolling_back" },
			"rolling_back",
			"Rolling back Caddy migration to Traefik",
		),
		serverId,
	);

	try {
		await stopDockerResource("dokploy-caddy", serverId);

		const caddyPaths = paths(!!serverId);
		const backup = report.backup;
		if (!backup) {
			throw new Error(
				`Cannot roll back Caddy migration ${input.migrationId}: no backup metadata is available`,
			);
		}
		const backupRoot = path.posix.join(
			report.artifactPaths.backupsDir,
			"caddy",
		);
		const backupFiles = backup.files ?? [];
		const backedUpCaddyConfig = backupFiles.find(
			(item) => item.label === "caddy-config",
		);
		const backedUpCaddyFragments = backupFiles.find(
			(item) => item.label === "caddy-fragments",
		);
		const backedUpTraefikStatic = backupFiles.find(
			(item) => item.label === "traefik-static",
		);
		const backedUpTraefikDynamic = backupFiles.find(
			(item) => item.label === "traefik-dynamic",
		);

		await restorePathFromBackup(
			backedUpCaddyConfig?.backupPath ??
				path.posix.join(backupRoot, "caddy.json"),
			caddyPaths.CADDY_CONFIG_PATH,
			backedUpCaddyConfig?.existed,
			serverId,
		);
		await restorePathFromBackup(
			backedUpCaddyFragments?.backupPath ??
				path.posix.join(backupRoot, "fragments"),
			caddyPaths.CADDY_FRAGMENTS_PATH,
			backedUpCaddyFragments?.existed,
			serverId,
		);
		await restorePathFromBackup(
			backedUpTraefikStatic?.backupPath ??
				path.posix.join(
					report.artifactPaths.backupsDir,
					"traefik",
					"traefik.yml",
				),
			path.posix.join(caddyPaths.MAIN_TRAEFIK_PATH, "traefik.yml"),
			backedUpTraefikStatic?.existed,
			serverId,
		);
		await restorePathFromBackup(
			backedUpTraefikDynamic?.backupPath ??
				path.posix.join(report.artifactPaths.backupsDir, "traefik", "dynamic"),
			caddyPaths.DYNAMIC_TRAEFIK_PATH,
			backedUpTraefikDynamic?.existed,
			serverId,
		);

		const restoreSnapshots = await loadRestoreSnapshots(report, serverId);
		await ensureTraefikRunningFromSnapshot(
			restoreSnapshots.traefikResource ?? backup.traefikResource,
			serverId,
		);
		await updateProviderToTraefik(serverId);

		report = await writeCaddyMigrationReport(
			appendCaddyMigrationEvent(
				{ ...report, status: "rolled_back" },
				"rolled_back",
				"Rollback completed; Traefik is the active provider",
			),
			serverId,
		);
		return report;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Caddy migration rollback failed";
		const failedReport: CaddyMigrationReport = {
			...report,
			status: "failed",
			warnings: [
				...report.warnings,
				{
					code: "rollback-failed",
					message,
					blocking: true,
				},
			],
			summary: {
				...report.summary,
				warnings: report.summary.warnings + 1,
				blockingWarnings: report.summary.blockingWarnings + 1,
			},
		};
		await writeCaddyMigrationReport(
			appendCaddyMigrationEvent(failedReport, "rollback_failed", message),
			serverId,
		);
		throw error;
	}
};

export const getCaddyMigrationReport = async (input: {
	migrationId: string;
	serverId?: string;
}) => loadCaddyMigrationReport(input.migrationId, input.serverId);

export const getCaddyMigrationPaths = (input: {
	migrationId: string;
	serverId?: string;
}) => getCaddyMigrationArtifactPaths(input.migrationId, input.serverId);
