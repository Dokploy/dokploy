import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createVolumeBackup: vi.fn(),
	findVolumeBackupById: vi.fn(),
	updateVolumeBackup: vi.fn(),
	findDestinationRow: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { destinations: { findFirst: mocks.findDestinationRow } } },
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	createVolumeBackup: mocks.createVolumeBackup,
	findVolumeBackupById: mocks.findVolumeBackupById,
	updateVolumeBackup: mocks.updateVolumeBackup,
	scheduleVolumeBackup: vi.fn(),
	removeVolumeBackupJob: vi.fn(),
	removeVolumeBackup: vi.fn(),
	restoreVolume: vi.fn(),
	runVolumeBackup: vi.fn(),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: vi.fn(),
	execAsyncStream: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/plan-limits", () => ({
	assertVolumeBackupLimit: vi.fn(),
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
	updateJob: vi.fn(),
}));

const { volumeBackupsRouter } = await import(
	"@/server/api/routers/volume-backups"
);

const caller = volumeBackupsRouter.createCaller({
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof volumeBackupsRouter.createCaller>[0]);

const ownDestination = { destinationId: "dest-a", organizationId: "org-a" };
const foreignDestination = { destinationId: "dest-b", organizationId: "org-b" };

const createInput = {
	name: "data",
	volumeName: "app_data",
	prefix: "/",
	cronExpression: "0 0 * * *",
	serviceType: "application" as const,
	applicationId: "app-1",
	enabled: false,
};

describe("volume backup endpoints scope destinations to the active organization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createVolumeBackup.mockResolvedValue({
			volumeBackupId: "vb-1",
			enabled: false,
		});
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "app-1",
			destinationId: "dest-a",
		});
		mocks.updateVolumeBackup.mockResolvedValue({
			volumeBackupId: "vb-1",
			enabled: false,
		});
	});

	it("rejects creating a volume backup on a destination from another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(
			caller.create({ ...createInput, destinationId: "dest-b" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("creates a volume backup on a destination of the active organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(ownDestination);

		await caller.create({ ...createInput, destinationId: "dest-a" });

		expect(mocks.createVolumeBackup).toHaveBeenCalledTimes(1);
	});

	it("rejects moving a volume backup to a destination from another organization", async () => {
		mocks.findDestinationRow.mockResolvedValue(foreignDestination);

		await expect(
			caller.update({
				...createInput,
				volumeBackupId: "vb-1",
				destinationId: "dest-b",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
	});
});
