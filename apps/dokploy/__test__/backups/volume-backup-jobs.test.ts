import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isCloud: false }));

const calls = vi.hoisted(() => ({ order: [] as string[] }));

const track = (name: string) =>
	vi.fn(async () => {
		calls.order.push(name);
	});

const mocks = vi.hoisted(() => ({
	findVolumeBackupById: vi.fn(),
	removeVolumeBackup: vi.fn(),
	updateVolumeBackup: vi.fn(),
	removeVolumeBackupJob: vi.fn(),
	scheduleVolumeBackup: vi.fn(),
	removeJob: vi.fn(),
	updateJob: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return state.isCloud;
	},
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
	findVolumeBackupById: mocks.findVolumeBackupById,
	removeVolumeBackup: mocks.removeVolumeBackup,
	updateVolumeBackup: mocks.updateVolumeBackup,
	removeVolumeBackupJob: mocks.removeVolumeBackupJob,
	scheduleVolumeBackup: mocks.scheduleVolumeBackup,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: vi.fn(),
	execAsyncStream: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
}));

vi.mock("@/server/api/utils/plan-limits", () => ({
	assertVolumeBackupLimit: vi.fn(),
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: mocks.removeJob,
	schedule: vi.fn(),
	updateJob: mocks.updateJob,
}));

const { volumeBackupsRouter } = await import(
	"@/server/api/routers/volume-backups"
);

const volumeBackup = {
	volumeBackupId: "vb-1",
	cronExpression: "0 3 * * *",
	enabled: true,
	applicationId: "app-1",
};

const updateInput = {
	volumeBackupId: "vb-1",
	name: "backup",
	volumeName: "data",
	prefix: "app/",
	cronExpression: "0 3 * * *",
	destinationId: "dest-1",
};

const caller = () =>
	volumeBackupsRouter.createCaller({
		user: { id: "user-1", email: "owner@test.com", role: "owner" },
		session: { activeOrganizationId: "org-1" },
	} as never);

beforeEach(() => {
	vi.clearAllMocks();
	calls.order = [];
	mocks.findVolumeBackupById.mockResolvedValue(volumeBackup);
	mocks.updateVolumeBackup.mockResolvedValue(volumeBackup);
	mocks.removeVolumeBackup.mockImplementation(track("removeVolumeBackup"));
	mocks.removeVolumeBackupJob.mockImplementation(
		track("removeVolumeBackupJob"),
	);
	mocks.scheduleVolumeBackup.mockImplementation(track("scheduleVolumeBackup"));
	mocks.removeJob.mockImplementation(track("removeJob"));
	mocks.updateJob.mockImplementation(track("updateJob"));
});

describe("volumeBackups.delete", () => {
	it("cancels the local cron job before deleting the row", async () => {
		state.isCloud = false;

		await caller().delete({ volumeBackupId: "vb-1" });

		expect(mocks.removeVolumeBackupJob).toHaveBeenCalledWith("vb-1");
		expect(mocks.removeVolumeBackup).toHaveBeenCalledWith("vb-1");
		expect(calls.order).toEqual([
			"removeVolumeBackupJob",
			"removeVolumeBackup",
		]);
	});

	it("removes the repeatable job before deleting the row in cloud", async () => {
		state.isCloud = true;

		await caller().delete({ volumeBackupId: "vb-1" });

		expect(mocks.removeJob).toHaveBeenCalledWith({
			cronSchedule: "0 3 * * *",
			volumeBackupId: "vb-1",
			type: "volume-backup",
		});
		expect(calls.order).toEqual(["removeJob", "removeVolumeBackup"]);
	});

	it("keeps the row when the cloud cancellation fails, so the delete can be retried", async () => {
		state.isCloud = true;
		mocks.removeJob.mockRejectedValue(new Error("JOBS_URL unreachable"));

		await expect(caller().delete({ volumeBackupId: "vb-1" })).rejects.toThrow(
			"JOBS_URL unreachable",
		);
		expect(mocks.removeVolumeBackup).not.toHaveBeenCalled();
	});

	it("awaits the local cancellation and surfaces its failure", async () => {
		state.isCloud = false;
		mocks.removeVolumeBackupJob.mockRejectedValue(new Error("cancel failed"));

		await expect(caller().delete({ volumeBackupId: "vb-1" })).rejects.toThrow(
			"cancel failed",
		);
		expect(mocks.removeVolumeBackup).not.toHaveBeenCalled();
	});

	it("does not call the jobs service for a backup that was never enabled", async () => {
		state.isCloud = true;
		mocks.findVolumeBackupById.mockResolvedValue({
			...volumeBackup,
			enabled: false,
		});

		await caller().delete({ volumeBackupId: "vb-1" });

		expect(mocks.removeJob).not.toHaveBeenCalled();
		expect(mocks.removeVolumeBackup).toHaveBeenCalledWith("vb-1");
	});
});

describe("volumeBackups.update", () => {
	it("reschedules the local job after cancelling the previous one", async () => {
		state.isCloud = false;

		await caller().update(updateInput as never);

		expect(calls.order).toEqual([
			"removeVolumeBackupJob",
			"scheduleVolumeBackup",
		]);
	});

	it("cancels the local job without rescheduling when disabled", async () => {
		state.isCloud = false;
		mocks.updateVolumeBackup.mockResolvedValue({
			...volumeBackup,
			enabled: false,
		});

		await caller().update(updateInput as never);

		expect(calls.order).toEqual(["removeVolumeBackupJob"]);
	});

	it("removes the repeatable job when disabled in cloud", async () => {
		state.isCloud = true;
		mocks.updateVolumeBackup.mockResolvedValue({
			...volumeBackup,
			enabled: false,
		});

		await caller().update(updateInput as never);

		expect(mocks.updateJob).not.toHaveBeenCalled();
		expect(mocks.removeJob).toHaveBeenCalledWith({
			cronSchedule: "0 3 * * *",
			volumeBackupId: "vb-1",
			type: "volume-backup",
		});
	});
});
