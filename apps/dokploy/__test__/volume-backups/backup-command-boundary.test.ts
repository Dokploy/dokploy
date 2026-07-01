import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findComposeById: vi.fn(),
	findDestinationById: vi.fn(),
	paths: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mocks.findComposeById,
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: mocks.findDestinationById,
}));

const { createVolumeBackupSchema, updateVolumeBackupSchema } = await import(
	"@dokploy/server/db/schema"
);
const { shouldRunBackupRetention } = await import(
	"@dokploy/server/utils/backups/utils"
);
const { backupVolume, resolveVolumeBackupServerId } = await import(
	"@dokploy/server/utils/volume-backups/backup"
);

const destination = {
	accessKey: "access-key",
	additionalFlags: [],
	bucket: "dokploy-backups",
	endpoint: "https://s3.example.com",
	provider: "AWS",
	region: "us-east-1",
	secretAccessKey: "secret-key",
};

const safeCreateVolumeBackupInput = {
	applicationId: "app-1",
	cronExpression: "0 0 * * *",
	destinationId: "destination-1",
	enabled: false,
	keepLatestCount: 3,
	name: "daily volume",
	prefix: "daily",
	serviceName: "app",
	serviceType: "application" as const,
	turnOff: false,
	volumeName: "data_volume",
};

const volumeBackup = {
	...safeCreateVolumeBackupInput,
	appName: "volume-backup-one",
	application: {
		appName: "app-one",
		serverId: null,
	},
	compose: null,
	volumeBackupId: "volume-backup-1",
};

describe("volume backup command and schema boundaries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findDestinationById.mockResolvedValue(destination);
		mocks.paths.mockReturnValue({
			VOLUME_BACKUP_LOCK_PATH: "/srv/dokploy/volume-backup.lock",
			VOLUME_BACKUPS_PATH: "/srv/dokploy/volume-backups",
		});
	});

	it("rejects unsafe volume and service names before persistence", () => {
		expect(
			createVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				volumeName: "data;id",
			}).success,
		).toBe(false);

		expect(
			createVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				serviceName: "app$(id)",
			}).success,
		).toBe(false);

		expect(
			updateVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				appName: "../volume",
				volumeBackupId: "volume-backup-1",
			}).success,
		).toBe(false);
	});

	it("rejects unsafe retention counts before persistence", () => {
		expect(
			createVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				keepLatestCount: -1,
			}).success,
		).toBe(false);

		expect(
			createVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				keepLatestCount: 1.5,
			}).success,
		).toBe(false);

		expect(
			updateVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				keepLatestCount: -1,
				volumeBackupId: "volume-backup-1",
			}).success,
		).toBe(false);

		expect(
			createVolumeBackupSchema.safeParse({
				...safeCreateVolumeBackupInput,
				keepLatestCount: 0,
			}).success,
		).toBe(true);
		expect(shouldRunBackupRetention(-1)).toBe(false);
		expect(shouldRunBackupRetention(1)).toBe(true);
	});

	it("rejects unsafe stored volume and service names before backup command generation", async () => {
		await expect(
			backupVolume({
				...volumeBackup,
				volumeName: "data;id",
			} as never),
		).rejects.toThrow("Invalid Docker volume name");

		await expect(
			backupVolume({
				...volumeBackup,
				application: {
					appName: "app;id",
					serverId: null,
				},
				turnOff: true,
			} as never),
		).rejects.toThrow("Invalid service name");
	});

	it("quotes Docker volume mounts and cleanup paths in backup commands", async () => {
		const command = await backupVolume(volumeBackup as never);
		expect(command).toBeDefined();
		const unescapedCommand = (command ?? "").replace(/\\/g, "");

		expect(unescapedCommand).toContain("docker run --rm");
		expect(unescapedCommand).toContain("-v data_volume:/volume_data");
		expect(unescapedCommand).toContain(
			"-v /srv/dokploy/volume-backups/volume-backup-one:/backup",
		);
		expect(unescapedCommand).toContain("bash -c 'cd /volume_data && tar cvf");
		expect(unescapedCommand).toContain("rm -f --");
		expect(unescapedCommand).not.toContain("data;id");
	});

	it("builds compose container lookup filters as shell arguments", async () => {
		mocks.findComposeById.mockResolvedValue({
			appName: "compose-one",
			composeId: "compose-1",
			composeType: "docker-compose",
		});

		const command = await backupVolume({
			...volumeBackup,
			application: null,
			compose: {
				appName: "compose-one",
				composeId: "compose-1",
				serverId: null,
			},
			composeId: "compose-1",
			serviceName: "api",
			serviceType: "compose",
			turnOff: true,
		} as never);
		expect(command).toBeDefined();
		const unescapedCommand = (command ?? "").replace(/\\/g, "");

		expect(unescapedCommand).toContain(
			"label=com.docker.compose.project=compose-one",
		);
		expect(unescapedCommand).toContain("label=com.docker.compose.service=api");
		expect(unescapedCommand).not.toContain(
			'label=com.docker.compose.service="api"',
		);
	});

	it("uses database server bindings when selecting remote volume backup paths", async () => {
		const databaseVolumeBackup = {
			...volumeBackup,
			application: null,
			postgres: {
				appName: "postgres-one",
				serverId: "server-1",
			},
			serviceType: "postgres",
		};

		expect(resolveVolumeBackupServerId(databaseVolumeBackup as never)).toBe(
			"server-1",
		);
		await backupVolume(databaseVolumeBackup as never);

		expect(mocks.paths).toHaveBeenCalledWith(true);
	});
});
