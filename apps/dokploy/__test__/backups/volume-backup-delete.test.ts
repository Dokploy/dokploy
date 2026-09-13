import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isCloud: false }));

const mocks = vi.hoisted(() => ({
	findVolumeBackupById: vi.fn(),
	removeVolumeBackup: vi.fn(),
	removeVolumeBackupJob: vi.fn(),
	removeJob: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return state.isCloud;
	},
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
	findVolumeBackupById: mocks.findVolumeBackupById,
	removeVolumeBackup: mocks.removeVolumeBackup,
	removeVolumeBackupJob: mocks.removeVolumeBackupJob,
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
	updateJob: vi.fn(),
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

const caller = () =>
	volumeBackupsRouter.createCaller({
		user: { id: "user-1", email: "owner@test.com", role: "owner" },
		session: { activeOrganizationId: "org-1" },
	} as never);

describe("volumeBackups.delete", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findVolumeBackupById.mockResolvedValue(volumeBackup);
	});

	it("cancels the local cron job of the deleted volume backup", async () => {
		state.isCloud = false;

		await caller().delete({ volumeBackupId: "vb-1" });

		expect(mocks.removeVolumeBackup).toHaveBeenCalledWith("vb-1");
		expect(mocks.removeVolumeBackupJob).toHaveBeenCalledWith("vb-1");
	});

	it("removes the repeatable job from the jobs queue in cloud", async () => {
		state.isCloud = true;

		await caller().delete({ volumeBackupId: "vb-1" });

		expect(mocks.removeVolumeBackup).toHaveBeenCalledWith("vb-1");
		expect(mocks.removeJob).toHaveBeenCalledWith({
			cronSchedule: "0 3 * * *",
			volumeBackupId: "vb-1",
			type: "volume-backup",
		});
	});
});
