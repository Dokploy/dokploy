import {
	backups,
	domains,
	mounts,
	ports,
	redirects,
	schedules,
	security,
	volumeBackups,
} from "@dokploy/server/db/schema";
import { VOLUME_NAME_REGEX } from "@dokploy/server/db/schema/utils";
import {
	finalDomainHost,
	regenerateAppName,
	rewriteVolumeName,
} from "../appname";
import { isUnsafeBundlePath } from "../deserialize";
import type { TransferTx } from "../queries";
import { restoreSecretFields } from "../secret-fields";
import type { ConflictResolution, DomainStrategy } from "../types";
import { conflictKey } from "../types";

const MAX_BACKUP_APPNAME_RETRIES = 5;

const ensureUniqueBackupAppName = async (
	tx: TransferTx,
	oldAppName: string,
): Promise<string> => {
	let candidate = regenerateAppName("backup", oldAppName);
	for (let i = 0; i < MAX_BACKUP_APPNAME_RETRIES; i++) {
		const existing = await tx.query.backups.findFirst({
			where: (fields, { eq }) => eq(fields.appName, candidate),
		});
		if (!existing) {
			return candidate;
		}
		candidate = regenerateAppName("backup", oldAppName);
	}
	throw new Error(
		`Could not generate a unique appName for a backup after ${MAX_BACKUP_APPNAME_RETRIES} attempts`,
	);
};

type ParentRef = {
	applicationId?: string;
	composeId?: string;
	postgresId?: string;
	mysqlId?: string;
	mariadbId?: string;
	mongoId?: string;
	redisId?: string;
	libsqlId?: string;
};

export const insertDomains = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	parent: ParentRef,
	appNameMap: Record<string, string>,
	domainStrategy: DomainStrategy,
	conflictResolutions: Record<string, ConflictResolution>,
	destinationIp: string | null = null,
): Promise<void> => {
	for (const row of rows) {
		const strategized = finalDomainHost(
			row.host as string,
			appNameMap,
			destinationIp,
			domainStrategy,
			(row.enabled as boolean | undefined) ?? true,
		);
		const resolution =
			conflictResolutions[
				conflictKey({ kind: "domain", value: strategized.host })
			];
		const host =
			resolution?.action === "rename" && resolution.value
				? resolution.value.trim()
				: strategized.host;
		const enabled = resolution?.action === "skip" ? false : strategized.enabled;
		await tx.insert(domains).values({
			...row,
			domainId: undefined,
			host,
			enabled,
			...parent,
			previewDeploymentId: null,
		} as unknown as typeof domains.$inferInsert);
	}
};

export const insertMounts = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	parent: ParentRef,
	appNameMap: Record<string, string>,
	secretsPlain: Map<string, string>,
): Promise<void> => {
	for (const row of rows) {
		for (const field of ["filePath", "hostPath"]) {
			const value = row[field];
			if (typeof value === "string" && value && isUnsafeBundlePath(value)) {
				throw new Error(`Unsafe mount ${field} in bundle: "${value}"`);
			}
		}
		const restored = restoreSecretFields("mount", row, secretsPlain);
		const volumeName =
			typeof row.volumeName === "string"
				? rewriteVolumeName(row.volumeName, appNameMap).value
				: row.volumeName;
		if (
			row.type === "volume" &&
			typeof volumeName === "string" &&
			volumeName &&
			!VOLUME_NAME_REGEX.test(volumeName)
		) {
			throw new Error(`Invalid volume name in bundle: "${volumeName}"`);
		}
		await tx.insert(mounts).values({
			...restored,
			mountId: undefined,
			volumeName,
			...parent,
		} as unknown as typeof mounts.$inferInsert);
	}
};

export const insertPorts = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	applicationId: string,
	portsStrategy: "keep" | "disable" = "keep",
	conflictResolutions: Record<string, ConflictResolution> = {},
): Promise<void> => {
	if (portsStrategy === "disable") return;
	for (const row of rows) {
		const resolution =
			conflictResolutions[
				conflictKey({ kind: "port", value: String(row.publishedPort) })
			];
		if (resolution?.action === "skip") continue;
		const publishedPort =
			resolution?.action === "rename" && resolution.value
				? Number.parseInt(resolution.value, 10)
				: row.publishedPort;
		if (
			typeof publishedPort !== "number" ||
			publishedPort < 1 ||
			publishedPort > 65535
		) {
			throw new Error(`Invalid published port: ${String(publishedPort)}`);
		}
		await tx.insert(ports).values({
			...row,
			portId: undefined,
			publishedPort,
			applicationId,
		} as unknown as typeof ports.$inferInsert);
	}
};

export const insertRedirects = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	applicationId: string,
): Promise<void> => {
	for (const row of rows) {
		await tx.insert(redirects).values({
			...row,
			redirectId: undefined,
			applicationId,
		} as unknown as typeof redirects.$inferInsert);
	}
};

export const insertSecurity = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	applicationId: string,
	secretsPlain: Map<string, string>,
): Promise<void> => {
	for (const row of rows) {
		const restored = restoreSecretFields("security", row, secretsPlain);
		await tx.insert(security).values({
			...restored,
			securityId: undefined,
			applicationId,
		} as unknown as typeof security.$inferInsert);
	}
};

export const insertBackups = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	parent: ParentRef,
	destinationIdMap: Record<string, string>,
	secretsPlain: Map<string, string>,
): Promise<{ skipped: number }> => {
	let skipped = 0;
	for (const row of rows) {
		const oldDestinationId = row.destinationId as string;
		const destinationId = destinationIdMap[oldDestinationId];
		if (!destinationId) {
			skipped++;
			continue;
		}
		const restored = restoreSecretFields("backup", row, secretsPlain);
		const appName = await ensureUniqueBackupAppName(
			tx,
			restored.appName as string,
		);
		await tx.insert(backups).values({
			...restored,
			backupId: undefined,
			appName,
			destinationId,
			...parent,
		} as unknown as typeof backups.$inferInsert);
	}
	return { skipped };
};

export const insertVolumeBackups = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	parent: ParentRef,
	destinationIdMap: Record<string, string>,
	appNameMap: Record<string, string>,
): Promise<{ skipped: number }> => {
	let skipped = 0;
	for (const row of rows) {
		const oldDestinationId = row.destinationId as string;
		const destinationId = destinationIdMap[oldDestinationId];
		if (!destinationId) {
			skipped++;
			continue;
		}
		const volumeName =
			typeof row.volumeName === "string"
				? rewriteVolumeName(row.volumeName, appNameMap).value
				: row.volumeName;
		if (typeof volumeName !== "string" || !VOLUME_NAME_REGEX.test(volumeName)) {
			throw new Error(`Invalid volume name in bundle: "${String(volumeName)}"`);
		}
		await tx.insert(volumeBackups).values({
			...row,
			volumeBackupId: undefined,
			destinationId,
			volumeName,
			...parent,
		} as unknown as typeof volumeBackups.$inferInsert);
	}
	return { skipped };
};

export const insertSchedules = async (
	tx: TransferTx,
	rows: Record<string, unknown>[],
	parent: ParentRef,
	organizationId: string,
	serverId: string | null,
): Promise<void> => {
	for (const row of rows) {
		await tx.insert(schedules).values({
			...row,
			scheduleId: undefined,
			organizationId,
			serverId,
			...parent,
		} as unknown as typeof schedules.$inferInsert);
	}
};
