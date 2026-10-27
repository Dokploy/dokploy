import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findSchedules: vi.fn(),
	scheduleJob: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	CLEANUP_CRON_JOB: "0 0 * * *",
	cleanupAll: vi.fn(),
	findBackupById: vi.fn(),
	findScheduleById: vi.fn(),
	findServerById: vi.fn(),
	findVolumeBackupById: vi.fn(),
	keepLatestNBackups: vi.fn(),
	runCommand: vi.fn(),
	runComposeBackup: vi.fn(),
	runLibsqlBackup: vi.fn(),
	runMariadbBackup: vi.fn(),
	runMongoBackup: vi.fn(),
	runMySqlBackup: vi.fn(),
	runPostgresBackup: vi.fn(),
	runVolumeBackup: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({
	and: vi.fn(),
	eq: vi.fn(),
	backups: {},
	schedules: {},
	server: {},
	volumeBackups: {},
	db: {
		query: {
			server: { findMany: vi.fn(async () => []) },
			backups: { findMany: vi.fn(async () => []) },
			schedules: { findMany: mocks.findSchedules },
			volumeBackups: { findMany: vi.fn(async () => []) },
		},
	},
}));
vi.mock("../../../schedules/src/queue.js", () => ({
	scheduleJob: mocks.scheduleJob,
}));
vi.mock("../../../schedules/src/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn() },
}));

const { initializeJobs } = await import("../../../schedules/src/utils.js");

const targets = [
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
] as const;

beforeEach(() => {
	vi.clearAllMocks();
});

describe.each(targets)("%s scheduled job startup", (target) => {
	it.each([null, "Australia/Sydney"])(
		"restores active-server jobs with timezone %s",
		async (timezone) => {
			mocks.findSchedules.mockResolvedValue([
				{
					scheduleId: "schedule-1",
					cronExpression: "0 9 * * *",
					timezone,
					[target]: { server: { serverStatus: "active" } },
				},
			]);

			await initializeJobs();

			expect(mocks.findSchedules).toHaveBeenCalledWith(
				expect.objectContaining({
					with: expect.objectContaining({
						[target]: expect.objectContaining({ with: { server: true } }),
					}),
				}),
			);
			expect(mocks.scheduleJob).toHaveBeenCalledExactlyOnceWith({
				type: "schedule",
				scheduleId: "schedule-1",
				cronSchedule: "0 9 * * *",
				timezone,
			});
		},
	);

	it.each(["inactive", null])(
		"does not restore jobs whose server is %s",
		async (serverStatus) => {
			mocks.findSchedules.mockResolvedValue([
				{
					scheduleId: "schedule-1",
					cronExpression: "0 9 * * *",
					timezone: null,
					[target]: { server: serverStatus ? { serverStatus } : null },
				},
			]);

			await initializeJobs();

			expect(mocks.scheduleJob).not.toHaveBeenCalled();
		},
	);
});
