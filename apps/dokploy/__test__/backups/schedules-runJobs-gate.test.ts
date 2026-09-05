import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Defense-in-depth gate test for `apps/schedules/src/utils.ts` `runJobs`
 * `backup` branch (G6, G7).
 *
 * `runJobs` is imported directly from the schedules service source (via
 * relative path) so this exercises the real module. `bullmq` is mocked so the
 * module-load-time `new Queue("backupQueue", { connection: ... })` in `queue.ts`
 * does not open a Redis connection. The `@dokploy/server` barrel and the
 * schedules `logger` are mocked so we can assert dispatch behaviour.
 */

const mocks = vi.hoisted(() => ({
	findBackupById: vi.fn(),
	findServerById: vi.fn(),
	findScheduleById: vi.fn(),
	findVolumeBackupById: vi.fn(),
	runPostgresBackup: vi.fn().mockResolvedValue(undefined),
	runMySqlBackup: vi.fn().mockResolvedValue(undefined),
	runMongoBackup: vi.fn().mockResolvedValue(undefined),
	runMariadbBackup: vi.fn().mockResolvedValue(undefined),
	runLibsqlBackup: vi.fn().mockResolvedValue(undefined),
	runComposeBackup: vi.fn().mockResolvedValue(undefined),
	runVolumeBackup: vi.fn().mockResolvedValue(undefined),
	keepLatestNBackups: vi.fn().mockResolvedValue(undefined),
	runCommand: vi.fn().mockResolvedValue(undefined),
	cleanupAll: vi.fn().mockResolvedValue(undefined),
	loggerInfo: vi.fn(),
	loggerError: vi.fn(),
}));

// Mock the schedules queue module (imported by utils.ts as ./queue.js) so the
// real `queue.ts` — which instantiates `new Queue("backupQueue", { connection })`
// and would connect to Redis — is never loaded. Mocking by the path utils.ts
// resolves (`./queue.js` -> apps/schedules/src/queue.ts) ensures the stub is
// used; a bare `vi.mock("bullmq")` would NOT match because pnpm's nested
// node_modules resolves the schedules package's `bullmq` to a different
// physical path than this test file's.
vi.mock("../../../schedules/src/queue", () => ({
	jobQueue: {
		add: vi.fn(),
		removeRepeatable: vi.fn(),
		getRepeatableJobs: vi.fn().mockResolvedValue([]),
		obliterate: vi.fn(),
	},
	scheduleJob: vi.fn().mockResolvedValue(undefined),
	removeJob: vi.fn().mockResolvedValue(true),
	getJobRepeatable: vi.fn().mockResolvedValue(null),
	cleanQueue: vi.fn().mockResolvedValue(undefined),
}));

// Mock the schedules logger (imported by utils.ts as ./logger.js).
vi.mock("../../../schedules/src/logger", () => ({
	logger: { info: mocks.loggerInfo, error: mocks.loggerError, warn: vi.fn() },
}));

vi.mock("@dokploy/server", () => ({
	findBackupById: mocks.findBackupById,
	findScheduleById: mocks.findScheduleById,
	findServerById: mocks.findServerById,
	findVolumeBackupById: mocks.findVolumeBackupById,
	keepLatestNBackups: mocks.keepLatestNBackups,
	runCommand: mocks.runCommand,
	runComposeBackup: mocks.runComposeBackup,
	runLibsqlBackup: mocks.runLibsqlBackup,
	runMariadbBackup: mocks.runMariadbBackup,
	runMongoBackup: mocks.runMongoBackup,
	runMySqlBackup: mocks.runMySqlBackup,
	runPostgresBackup: mocks.runPostgresBackup,
	runVolumeBackup: mocks.runVolumeBackup,
	cleanupAll: mocks.cleanupAll,
	CLEANUP_CRON_JOB: "0 0 * * *",
}));

// Relative import to the real schedules source (resolved by vite).
import { runJobs } from "../../../schedules/src/utils";

const activeServer = { serverStatus: "active" } as const;

describe("runJobs — backup enabled gate (G6)", () => {
	beforeEach(() => {
		mocks.findBackupById.mockReset();
		mocks.findServerById.mockReset();
		mocks.findScheduleById.mockReset();
		mocks.findVolumeBackupById.mockReset();
		for (const fn of [
			mocks.runPostgresBackup,
			mocks.runMySqlBackup,
			mocks.runMongoBackup,
			mocks.runMariadbBackup,
			mocks.runLibsqlBackup,
			mocks.runComposeBackup,
			mocks.runVolumeBackup,
			mocks.keepLatestNBackups,
			mocks.runCommand,
			mocks.cleanupAll,
			mocks.loggerInfo,
			mocks.loggerError,
		]) {
			fn.mockClear();
		}
		mocks.findServerById.mockResolvedValue(activeServer);
	});

	it("skips a disabled (enabled=false) postgres backup without dispatching", async () => {
		mocks.findBackupById.mockResolvedValue({
			enabled: false,
			databaseType: "postgres",
			backupType: "database",
			postgres: { serverId: "s1" },
		});

		await runJobs({
			type: "backup",
			backupId: "b1",
			cronSchedule: "*/2 * * * *",
		});

		expect(mocks.runPostgresBackup).not.toHaveBeenCalled();
		expect(mocks.keepLatestNBackups).not.toHaveBeenCalled();
		expect(mocks.loggerInfo).toHaveBeenCalledWith(
			"Backup b1 is disabled; skipping",
		);
	});

	it("skips a backup whose enabled is null (treats as falsy)", async () => {
		mocks.findBackupById.mockResolvedValue({
			enabled: null,
			databaseType: "mysql",
			backupType: "database",
			mysql: { serverId: "s1" },
		});

		await runJobs({
			type: "backup",
			backupId: "b2",
			cronSchedule: "*/2 * * * *",
		});

		expect(mocks.runMySqlBackup).not.toHaveBeenCalled();
		expect(mocks.keepLatestNBackups).not.toHaveBeenCalled();
	});

	it("skips a disabled compose backup without dispatching", async () => {
		mocks.findBackupById.mockResolvedValue({
			enabled: false,
			backupType: "compose",
			compose: { serverId: "s1" },
		});

		await runJobs({
			type: "backup",
			backupId: "b3",
			cronSchedule: "0 0 * * *",
		});

		expect(mocks.runComposeBackup).not.toHaveBeenCalled();
		expect(mocks.keepLatestNBackups).not.toHaveBeenCalled();
	});

	it("does not gate schedule jobs (already gated on schedule.enabled, unchanged behaviour)", async () => {
		// schedule disabled → runCommand NOT called; schedule enabled → runCommand called.
		mocks.findScheduleById.mockResolvedValue({ enabled: false });
		await runJobs({
			type: "schedule",
			scheduleId: "s1",
			cronSchedule: "*/2 * * * *",
		});
		expect(mocks.runCommand).not.toHaveBeenCalled();

		mocks.findScheduleById.mockResolvedValue({ enabled: true });
		await runJobs({
			type: "schedule",
			scheduleId: "s2",
			cronSchedule: "*/2 * * * *",
		});
		expect(mocks.runCommand).toHaveBeenCalledTimes(1);
	});

	it("does not gate volume-backup jobs (already gated on volumeBackup.enabled)", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({ enabled: false });
		await runJobs({
			type: "volume-backup",
			volumeBackupId: "v1",
			cronSchedule: "*/2 * * * *",
		});
		expect(mocks.runVolumeBackup).not.toHaveBeenCalled();
	});
});

describe("runJobs — backup enabled dispatch still runs (G7)", () => {
	beforeEach(() => {
		mocks.findBackupById.mockReset();
		mocks.findServerById.mockReset();
		for (const fn of [
			mocks.runPostgresBackup,
			mocks.runMySqlBackup,
			mocks.runMongoBackup,
			mocks.runMariadbBackup,
			mocks.runLibsqlBackup,
			mocks.runComposeBackup,
			mocks.keepLatestNBackups,
			mocks.loggerInfo,
		]) {
			fn.mockClear();
		}
		mocks.findServerById.mockResolvedValue(activeServer);
	});

	const cases: Array<
		[string, Record<string, unknown>, ReturnType<typeof vi.fn>]
	> = [
		[
			"postgres",
			{ databaseType: "postgres", backupType: "database" },
			mocks.runPostgresBackup,
		],
		[
			"mysql",
			{ databaseType: "mysql", backupType: "database" },
			mocks.runMySqlBackup,
		],
		[
			"mongo",
			{ databaseType: "mongo", backupType: "database" },
			mocks.runMongoBackup,
		],
		[
			"mariadb",
			{ databaseType: "mariadb", backupType: "database" },
			mocks.runMariadbBackup,
		],
		[
			"libsql",
			{ databaseType: "libsql", backupType: "database" },
			mocks.runLibsqlBackup,
		],
		[
			"compose",
			{ backupType: "compose" } as Record<string, unknown>,
			mocks.runComposeBackup,
		],
	];

	for (const [label, over, runFn] of cases) {
		it(`enabled=true ${label} backup dispatches to run*Backup + keepLatestNBackups`, async () => {
			mocks.findBackupById.mockResolvedValue({
				enabled: true,
				postgres: { serverId: "s1" },
				mysql: { serverId: "s1" },
				mongo: { serverId: "s1" },
				mariadb: { serverId: "s1" },
				libsql: { serverId: "s1" },
				compose: { serverId: "s1" },
				...over,
			} as any);

			await runJobs({
				type: "backup",
				backupId: "b1",
				cronSchedule: "*/2 * * * *",
			});

			expect(runFn).toHaveBeenCalledTimes(1);
			expect(mocks.keepLatestNBackups).toHaveBeenCalledTimes(1);
		});
	}
});
