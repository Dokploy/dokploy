import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the cloud (`IS_CLOUD`) `update` mutation in
 * `apps/dokploy/server/api/routers/backup.ts`.
 *
 * BullMQ repeatable jobs are keyed by `name + pattern (+ tz)`. When a backup
 * that was originally scheduled with cron `A` is updated to cron `B` AND
 * disabled in the same request, the disable branch must ask `apps/schedules`
 * to remove the repeatable job using the *stored* (pre-update) cron `A` — not
 * the post-update cron `B` — otherwise `removeRepeatable` misses and the old
 * schedule keeps firing forever.
 *
 * The router fetches the row twice around `updateBackupById`: `existing`
 * (pre-update) and `backup` (post-update). The disable branch must source the
 * removal cron from `existing.schedule`.
 */

const mocks = vi.hoisted(() => ({
	// @dokploy/server barrel — backup CRUD + helpers used by the router.
	findBackupById: vi.fn(),
	updateBackupById: vi.fn(),
	// Cloud fetch wrappers in @/server/utils/backup (the things we assert on).
	removeJob: vi.fn().mockResolvedValue(true),
	updateJob: vi.fn().mockResolvedValue(true),
	schedule: vi.fn().mockResolvedValue(true),
	// Permission + audit side effects.
	checkServicePermissionAndAccess: vi.fn().mockResolvedValue(undefined),
	audit: vi.fn().mockResolvedValue(undefined),
	assertDatabaseBackupLimit: vi.fn().mockResolvedValue(undefined),
}));

// Cloud fetch wrappers (capture the cron handed to apps/schedules).
vi.mock("@/server/utils/backup", () => ({
	removeJob: mocks.removeJob,
	updateJob: mocks.updateJob,
	schedule: mocks.schedule,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

vi.mock("@/server/api/utils/plan-limits", () => ({
	assertDatabaseBackupLimit: mocks.assertDatabaseBackupLimit,
	assertScheduledJobLimit: vi.fn().mockResolvedValue(undefined),
	assertVolumeBackupLimit: vi.fn().mockResolvedValue(undefined),
	assertOrganizationLimit: vi.fn().mockResolvedValue(undefined),
	assertMemberLimit: vi.fn().mockResolvedValue(undefined),
	assertEnvironmentLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn().mockResolvedValue(undefined),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/backups/compose", () => ({
	runComposeBackup: vi.fn(),
}));

vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getS3Credentials: vi.fn(),
	normalizeS3Path: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	execAsyncStream: vi.fn(),
}));

vi.mock("@dokploy/server/utils/restore", () => ({
	restoreComposeBackup: vi.fn(),
	restoreLibsqlBackup: vi.fn(),
	restoreMariadbBackup: vi.fn(),
	restoreMongoBackup: vi.fn(),
	restoreMySqlBackup: vi.fn(),
	restorePostgresBackup: vi.fn(),
	restoreWebServerBackup: vi.fn(),
}));

// trpc.ts imports validateRequest at module load.
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));

// The @dokploy/server barrel is imported by the router AND by trpc.ts (as
// @dokploy/server/index for `hasValidLicense`). Provide every named export the
// router references so module load is side-effect free. `IS_CLOUD` pins the
// cloud branch under test.
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	hasValidLicense: vi.fn().mockResolvedValue(true),
	// CRUD / lookups used by the router.
	findBackupById: mocks.findBackupById,
	updateBackupById: mocks.updateBackupById,
	createBackup: vi.fn(),
	findBackupsByDbId: vi.fn().mockResolvedValue([]),
	findComposeByBackupId: vi.fn(),
	findComposeById: vi.fn(),
	findLibsqlByBackupId: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbByBackupId: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoByBackupId: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlByBackupId: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresByBackupId: vi.fn(),
	findPostgresById: vi.fn(),
	findServerById: vi.fn(),
	keepLatestNBackups: vi.fn(),
	removeBackupById: vi.fn(),
	removeScheduleBackup: vi.fn(),
	runLibsqlBackup: vi.fn(),
	runMariadbBackup: vi.fn(),
	runMongoBackup: vi.fn(),
	runMySqlBackup: vi.fn(),
	runPostgresBackup: vi.fn(),
	runWebServerBackup: vi.fn(),
	scheduleBackup: vi.fn(),
}));

// @/server/db/schema re-exports @dokploy/server/db/schema. Provide permissive
// Zod input schemas so createCaller parses any input shape we pass.
vi.mock("@dokploy/server/db/schema", async () => {
	const { z } = await import("zod");
	const any = z.any();
	return {
		apiCreateBackup: any,
		apiFindOneBackup: any,
		apiRemoveBackup: any,
		apiRestoreBackup: any,
		apiUpdateBackup: any,
		createScheduleSchema: any,
		updateScheduleSchema: any,
		createVolumeBackupSchema: any,
		updateVolumeBackupSchema: any,
		VOLUME_NAME_MESSAGE: "invalid",
		VOLUME_NAME_REGEX: /.*/,
		backups: {},
		schedules: {},
		volumeBackups: {},
		deployments: {},
		environments: {},
		member: {},
		organization: {},
	};
});

// Distinct subpath modules imported by the sibling routers / plan-limits; mock
// them so the barrel re-export above is the single source of schema exports.
vi.mock("@dokploy/server/db/schema/schedule", async () => {
	const { z } = await import("zod");
	return {
		createScheduleSchema: z.any(),
		updateScheduleSchema: z.any(),
		schedules: {},
	};
});

vi.mock("@dokploy/server/db/schema/deployment", () => ({ deployments: {} }));

import { backupRouter } from "@/server/api/routers/backup";

const buildBackup = (over: Partial<Record<string, unknown>> = {}) => ({
	backupId: "backup-1",
	schedule: "*/2 * * * *",
	enabled: true,
	postgresId: "pg-1",
	databaseType: "postgres",
	backupType: "database",
	destinationId: "dest-1",
	prefix: "pg",
	database: "db",
	serviceName: "pg",
	keepLatestCount: 5,
	metadata: {},
	...over,
});

const ctx = () =>
	({
		session: { activeOrganizationId: "org-1" },
		user: {
			id: "u1",
			email: "u@example.com",
			role: "owner",
			ownerId: "u1",
			enableEnterpriseFeatures: false,
			isValidEnterpriseLicense: false,
		},
		db: {},
	}) as any;

describe("backupRouter.update — cloud disable branch", () => {
	const OLD_CRON = "*/2 * * * *";
	const NEW_CRON = "0 0 * * *";

	beforeEach(() => {
		mocks.findBackupById.mockReset();
		mocks.updateBackupById.mockReset();
		mocks.removeJob.mockClear();
		mocks.updateJob.mockClear();
		mocks.schedule.mockClear();
		mocks.checkServicePermissionAndAccess.mockClear();
		mocks.audit.mockClear();
	});

	it("removes the repeatable job using the PRE-update cron when cron changes and enabled is flipped off", async () => {
		// 1st read: pre-update row (scheduled with OLD_CRON, enabled).
		// 2nd read: post-update row (NEW_CRON, disabled).
		mocks.findBackupById
			.mockResolvedValueOnce(buildBackup({ schedule: OLD_CRON, enabled: true }))
			.mockResolvedValueOnce(
				buildBackup({ schedule: NEW_CRON, enabled: false }),
			);

		const caller = backupRouter.createCaller(ctx());
		await caller.update({
			backupId: "backup-1",
			schedule: NEW_CRON,
			enabled: false,
		} as any);

		// The disable branch must remove using the stored (old) cron, not the
		// post-update cron — otherwise the BullMQ repeatable member keyed by
		// OLD_CRON is left in Redis and keeps firing.
		expect(mocks.removeJob).toHaveBeenCalledTimes(1);
		expect(mocks.removeJob).toHaveBeenCalledWith({
			cronSchedule: OLD_CRON,
			backupId: "backup-1",
			type: "backup",
		});
		expect(mocks.updateJob).not.toHaveBeenCalled();
	});

	it("still removes correctly when only disabling (cron unchanged)", async () => {
		mocks.findBackupById
			.mockResolvedValueOnce(buildBackup({ schedule: OLD_CRON, enabled: true }))
			.mockResolvedValueOnce(
				buildBackup({ schedule: OLD_CRON, enabled: false }),
			);

		const caller = backupRouter.createCaller(ctx());
		await caller.update({
			backupId: "backup-1",
			schedule: OLD_CRON,
			enabled: false,
		} as any);

		expect(mocks.removeJob).toHaveBeenCalledTimes(1);
		expect(mocks.removeJob).toHaveBeenCalledWith({
			cronSchedule: OLD_CRON,
			backupId: "backup-1",
			type: "backup",
		});
		expect(mocks.updateJob).not.toHaveBeenCalled();
	});

	it("does not regress the enabled path: updateJob receives the post-update cron", async () => {
		mocks.findBackupById
			.mockResolvedValueOnce(buildBackup({ schedule: OLD_CRON, enabled: true }))
			.mockResolvedValueOnce(
				buildBackup({ schedule: NEW_CRON, enabled: true }),
			);

		const caller = backupRouter.createCaller(ctx());
		await caller.update({
			backupId: "backup-1",
			schedule: NEW_CRON,
			enabled: true,
		} as any);

		// The enabled branch delegates to /update-backup (which does its own
		// getJobRepeatable lookup), so it receives the NEW cron to reschedule.
		expect(mocks.updateJob).toHaveBeenCalledTimes(1);
		expect(mocks.updateJob).toHaveBeenCalledWith({
			cronSchedule: NEW_CRON,
			backupId: "backup-1",
			type: "backup",
		});
		expect(mocks.removeJob).not.toHaveBeenCalled();
	});
});
