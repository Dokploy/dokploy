import { createHmac, timingSafeEqual } from "node:crypto";
import { CLEANUP_CRON_JOB } from "@dokploy/server/constants";
import { findBackupById } from "@dokploy/server/services/backup";
import { findScheduleById } from "@dokploy/server/services/schedule";
import { findServerById } from "@dokploy/server/services/server";
import { findVolumeBackupById } from "@dokploy/server/services/volume-backups";
import { isBackupScheduleTargetBound } from "@dokploy/server/utils/backups/invariant";

export type ScheduledQueueJob =
	| {
			cronSchedule: string;
			type: "backup";
			backupId: string;
	  }
	| {
			cronSchedule: string;
			type: "server";
			serverId: string;
	  }
	| {
			cronSchedule: string;
			type: "schedule";
			scheduleId: string;
			timezone?: string;
	  }
	| {
			cronSchedule: string;
			type: "volume-backup";
			volumeBackupId: string;
	  };

export type ScheduledJobScope = {
	version: 1;
	operation: ScheduledJobOperation;
	type: ScheduledQueueJob["type"];
	objectId: string;
	cronSchedule: string;
	timezone: string | null;
	serverId: string | null;
	organizationId: string | null;
	expiresAt: number;
};

export type SignedScheduledQueueJob = ScheduledQueueJob & {
	scope: ScheduledJobScope;
	signature: string;
};

export type ScheduledJobOperation = "create" | "update" | "remove";

type ScopeOptions = {
	now?: number;
	requireEnabled?: boolean;
	requireActiveServer?: boolean;
	ttlMs?: number;
};

type SigningOptions = ScopeOptions & {
	operation: ScheduledJobOperation;
};

const DEFAULT_SCOPE_TTL_MS = 5 * 60_000;
const LEGACY_API_KEY_DERIVATION_CONTEXT = "dokploy:schedules-signing-key:v1";

const deriveLegacySigningKey = (apiKey: string) =>
	createHmac("sha256", apiKey)
		.update(LEGACY_API_KEY_DERIVATION_CONTEXT)
		.digest("base64url");

const getSigningKey = () => {
	const key = process.env.SCHEDULES_SIGNING_KEY?.trim();
	if (!key || key.trim().length === 0) {
		const legacyApiKey = process.env.API_KEY?.trim();
		if (legacyApiKey) {
			return deriveLegacySigningKey(legacyApiKey);
		}
		throw new Error(
			"Schedule job signing key is not configured. Set SCHEDULES_SIGNING_KEY or API_KEY before managing scheduled jobs.",
		);
	}
	if (process.env.API_KEY?.trim() && key === process.env.API_KEY.trim()) {
		throw new Error("Schedule job signing key must differ from the API key");
	}
	return key;
};

const canonicalScope = (scope: ScheduledJobScope) =>
	JSON.stringify({
		version: scope.version,
		operation: scope.operation,
		type: scope.type,
		objectId: scope.objectId,
		cronSchedule: scope.cronSchedule,
		timezone: scope.timezone,
		serverId: scope.serverId,
		organizationId: scope.organizationId,
		expiresAt: scope.expiresAt,
	});

const signScope = (scope: ScheduledJobScope) =>
	createHmac("sha256", getSigningKey())
		.update(canonicalScope(scope))
		.digest("base64url");

const assertEqual = (field: string, expected: unknown, actual: unknown) => {
	if (expected !== actual) {
		throw new Error(`Schedule job ${field} does not match its scoped claim`);
	}
};

const assertActiveServer = async (serverId: string) => {
	const server = await findServerById(serverId);
	if (server.serverStatus === "inactive") {
		throw new Error("Schedule job server is inactive");
	}
	return server;
};

const getBackupServerId = (
	backup: Awaited<ReturnType<typeof findBackupById>>,
) =>
	backup.postgres?.serverId ||
	backup.mysql?.serverId ||
	backup.mongo?.serverId ||
	backup.mariadb?.serverId ||
	backup.libsql?.serverId ||
	backup.compose?.serverId ||
	null;

const getVolumeBackupService = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
) =>
	volumeBackup.application ||
	volumeBackup.postgres ||
	volumeBackup.mysql ||
	volumeBackup.mariadb ||
	volumeBackup.mongo ||
	volumeBackup.redis ||
	volumeBackup.libsql ||
	volumeBackup.compose ||
	null;

const getScheduleServerId = (
	schedule: Awaited<ReturnType<typeof findScheduleById>>,
) =>
	schedule.server?.serverId ||
	schedule.application?.serverId ||
	schedule.compose?.serverId ||
	null;

const getScheduleOrganizationId = (
	schedule: Awaited<ReturnType<typeof findScheduleById>>,
) =>
	schedule.organizationId ||
	schedule.server?.organization?.id ||
	schedule.application?.environment?.project?.organizationId ||
	schedule.compose?.environment?.project?.organizationId ||
	null;

const buildScope = async (
	job: ScheduledQueueJob,
	options: SigningOptions,
): Promise<ScheduledJobScope> => {
	const now = options.now ?? Date.now();
	const expiresAt = now + (options.ttlMs ?? DEFAULT_SCOPE_TTL_MS);
	const requireEnabled = options.requireEnabled ?? true;
	const requireActiveServer = options.requireActiveServer ?? true;

	if (job.type === "backup") {
		const backup = await findBackupById(job.backupId);
		if (requireEnabled && !backup.enabled) {
			throw new Error("Backup schedule job is disabled");
		}
		if (!isBackupScheduleTargetBound(backup)) {
			throw new Error("Backup schedule job target is not bound");
		}
		assertEqual("cron schedule", backup.schedule, job.cronSchedule);
		const serverId = getBackupServerId(backup);
		if (!serverId) {
			throw new Error("Backup schedule job has no server scope");
		}
		const server = requireActiveServer
			? await assertActiveServer(serverId)
			: await findServerById(serverId);
		return {
			version: 1,
			operation: options.operation,
			type: job.type,
			objectId: job.backupId,
			cronSchedule: job.cronSchedule,
			timezone: null,
			serverId,
			organizationId: server.organizationId,
			expiresAt,
		};
	}

	if (job.type === "server") {
		assertEqual("cron schedule", CLEANUP_CRON_JOB, job.cronSchedule);
		const server = requireActiveServer
			? await assertActiveServer(job.serverId)
			: await findServerById(job.serverId);
		return {
			version: 1,
			operation: options.operation,
			type: job.type,
			objectId: job.serverId,
			cronSchedule: job.cronSchedule,
			timezone: null,
			serverId: job.serverId,
			organizationId: server.organizationId,
			expiresAt,
		};
	}

	if (job.type === "schedule") {
		const schedule = await findScheduleById(job.scheduleId);
		if (requireEnabled && !schedule.enabled) {
			throw new Error("Schedule job is disabled");
		}
		assertEqual("cron schedule", schedule.cronExpression, job.cronSchedule);
		const serverId = getScheduleServerId(schedule);
		if (serverId && requireActiveServer) {
			await assertActiveServer(serverId);
		}
		return {
			version: 1,
			operation: options.operation,
			type: job.type,
			objectId: job.scheduleId,
			cronSchedule: job.cronSchedule,
			timezone: job.timezone ?? null,
			serverId,
			organizationId: getScheduleOrganizationId(schedule),
			expiresAt,
		};
	}

	const volumeBackup = await findVolumeBackupById(job.volumeBackupId);
	if (requireEnabled && !volumeBackup.enabled) {
		throw new Error("Volume backup schedule job is disabled");
	}
	assertEqual("cron schedule", volumeBackup.cronExpression, job.cronSchedule);
	const service = getVolumeBackupService(volumeBackup);
	const serverId = service?.serverId ?? null;
	if (!serverId) {
		throw new Error("Volume backup schedule job has no server scope");
	}
	if (requireActiveServer) {
		await assertActiveServer(serverId);
	}
	return {
		version: 1,
		operation: options.operation,
		type: job.type,
		objectId: job.volumeBackupId,
		cronSchedule: job.cronSchedule,
		timezone: null,
		serverId,
		organizationId: service?.environment?.project?.organizationId ?? null,
		expiresAt,
	};
};

const assertScopeMatchesJob = (
	job: ScheduledQueueJob,
	scope: ScheduledJobScope,
	options: SigningOptions,
) => {
	assertEqual("operation", scope.operation, options.operation);
	assertEqual("type", scope.type, job.type);
	assertEqual("cron schedule", scope.cronSchedule, job.cronSchedule);
	assertEqual(
		"timezone",
		scope.timezone,
		job.type === "schedule" ? (job.timezone ?? null) : null,
	);
	if (job.type === "backup") {
		assertEqual("object id", scope.objectId, job.backupId);
	} else if (job.type === "server") {
		assertEqual("object id", scope.objectId, job.serverId);
	} else if (job.type === "schedule") {
		assertEqual("object id", scope.objectId, job.scheduleId);
	} else {
		assertEqual("object id", scope.objectId, job.volumeBackupId);
	}
};

const verifySignature = (job: SignedScheduledQueueJob) => {
	const expected = signScope(job.scope);
	const expectedBuffer = Buffer.from(expected);
	const actualBuffer = Buffer.from(job.signature);
	if (
		expectedBuffer.length !== actualBuffer.length ||
		!timingSafeEqual(expectedBuffer, actualBuffer)
	) {
		throw new Error("Schedule job scoped claim signature is invalid");
	}
};

export const signScheduledQueueJob = async (
	job: ScheduledQueueJob,
	options: SigningOptions,
): Promise<SignedScheduledQueueJob> => {
	const scope = await buildScope(job, options);
	return {
		...job,
		scope,
		signature: signScope(scope),
	};
};

export const assertSignedScheduledQueueJob = async (
	job: SignedScheduledQueueJob,
	options: SigningOptions & { requireFreshScope?: boolean },
): Promise<ScheduledQueueJob> => {
	assertScopeMatchesJob(job, job.scope, options);
	verifySignature(job);
	if (job.scope.expiresAt <= (options.now ?? Date.now())) {
		throw new Error("Schedule job scoped claim has expired");
	}

	if (options.requireFreshScope ?? true) {
		const freshScope = await buildScope(job, {
			...options,
			ttlMs: job.scope.expiresAt - (options.now ?? Date.now()),
		});
		assertEqual("server scope", freshScope.serverId, job.scope.serverId);
		assertEqual(
			"organization scope",
			freshScope.organizationId,
			job.scope.organizationId,
		);
	}

	const { scope: _scope, signature: _signature, ...queueJob } = job;
	return queueJob;
};
