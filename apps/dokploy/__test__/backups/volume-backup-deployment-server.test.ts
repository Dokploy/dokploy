import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findDeployments: vi.fn(),
	insertDeploymentValues: vi.fn(),
	findServerById: vi.fn(),
	findVolumeBackupById: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { deployments: { findMany: mocks.findDeployments } },
		insert: vi.fn(() => ({
			values: mocks.insertDeploymentValues,
		})),
	},
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ VOLUME_BACKUPS_PATH: "/remote/volume-backups" }),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/volume-backups", () => ({
	findVolumeBackupById: mocks.findVolumeBackupById,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { createDeploymentVolumeBackup } = await import(
	"@dokploy/server/services/deployment"
);

describe("createDeploymentVolumeBackup", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findDeployments.mockResolvedValue([]);
		mocks.insertDeploymentValues.mockImplementation((values) => ({
			returning: async () => [{ deploymentId: "deployment-1", ...values }],
		}));
		mocks.findServerById.mockResolvedValue({ serverId: "database-server" });
		mocks.findVolumeBackupById.mockResolvedValue({ appName: "database" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("persists the remote server ID with the deployment", async () => {
		await createDeploymentVolumeBackup({
			volumeBackupId: "volume-backup-1",
			title: "Volume Backup",
			description: "Volume Backup",
			serverId: "database-server",
		});

		expect(mocks.insertDeploymentValues).toHaveBeenCalledWith(
			expect.objectContaining({
				volumeBackupId: "volume-backup-1",
				serverId: "database-server",
			}),
		);
	});
});
