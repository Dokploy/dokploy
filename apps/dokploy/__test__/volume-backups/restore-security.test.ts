import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	createVolumeBackup: vi.fn(),
	execAsyncRemote: vi.fn(),
	execAsyncStream: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findDestinationById: vi.fn(),
	findEnvironmentById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findProjectById: vi.fn(),
	findRedisById: vi.fn(),
	findMemberByUserId: vi.fn(),
	findServerById: vi.fn(),
	findVolumeBackupById: vi.fn(),
	findVolumeBackups: vi.fn(),
	mountFindMany: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getS3Credentials: vi.fn(),
	paths: vi.fn(),
	removeJob: vi.fn(),
	removeVolumeBackup: vi.fn(),
	removeVolumeBackupJob: vi.fn(),
	restoreVolume: vi.fn(),
	runVolumeBackup: vi.fn(),
	schedule: vi.fn(),
	scheduleVolumeBackup: vi.fn(),
	updateJob: vi.fn(),
	updateVolumeBackup: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	createVolumeBackup: mocks.createVolumeBackup,
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	findDestinationById: mocks.findDestinationById,
	findEnvironmentById: mocks.findEnvironmentById,
	findLibsqlById: mocks.findLibsqlById,
	findMariadbById: mocks.findMariadbById,
	findMongoById: mocks.findMongoById,
	findMySqlById: mocks.findMySqlById,
	findPostgresById: mocks.findPostgresById,
	findProjectById: mocks.findProjectById,
	findRedisById: mocks.findRedisById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	findVolumeBackupById: mocks.findVolumeBackupById,
	getS3Credentials: mocks.getS3Credentials,
	paths: mocks.paths,
	removeVolumeBackup: mocks.removeVolumeBackup,
	removeVolumeBackupJob: mocks.removeVolumeBackupJob,
	restoreVolume: mocks.restoreVolume,
	runVolumeBackup: mocks.runVolumeBackup,
	scheduleVolumeBackup: mocks.scheduleVolumeBackup,
	updateVolumeBackup: mocks.updateVolumeBackup,
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	createVolumeBackup: mocks.createVolumeBackup,
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	findDestinationById: mocks.findDestinationById,
	findEnvironmentById: mocks.findEnvironmentById,
	findLibsqlById: mocks.findLibsqlById,
	findMariadbById: mocks.findMariadbById,
	findMongoById: mocks.findMongoById,
	findMySqlById: mocks.findMySqlById,
	findPostgresById: mocks.findPostgresById,
	findProjectById: mocks.findProjectById,
	findRedisById: mocks.findRedisById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	findVolumeBackupById: mocks.findVolumeBackupById,
	getS3Credentials: mocks.getS3Credentials,
	hasValidLicense: vi.fn().mockResolvedValue(true),
	paths: mocks.paths,
	removeVolumeBackup: mocks.removeVolumeBackup,
	removeVolumeBackupJob: mocks.removeVolumeBackupJob,
	restoreVolume: mocks.restoreVolume,
	runVolumeBackup: mocks.runVolumeBackup,
	scheduleVolumeBackup: mocks.scheduleVolumeBackup,
	updateVolumeBackup: mocks.updateVolumeBackup,
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: mocks.paths,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			volumeBackups: {
				findMany: mocks.findVolumeBackups,
			},
			mounts: {
				findMany: mocks.mountFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mocks.findComposeById,
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: mocks.findDestinationById,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: mocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/utils/backups/utils", async () => {
	const { quote } = await import("shell-quote");

	return {
		assertRcloneS3DestinationAllowed: async <T>(destination: T) => destination,
		buildRcloneS3Command: (
			command: string,
			destination: { bucket: string },
			args: string[],
		) =>
			quote([
				"rclone",
				command,
				...mocks.getS3Credentials(destination),
				...args,
			]),
		getRcloneS3Destination: (destination: { bucket: string }, path?: string) =>
			`:s3:${destination.bucket}${path ? `/${path}` : ""}`,
		getS3Credentials: mocks.getS3Credentials,
		normalizeS3Path: (prefix: string) =>
			prefix.trim().replace(/^\/+|\/+$/g, "")
				? `${prefix.trim().replace(/^\/+|\/+$/g, "")}/`
				: "",
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
	execAsyncStream: mocks.execAsyncStream,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: mocks.removeJob,
	schedule: mocks.schedule,
	updateJob: mocks.updateJob,
}));

const { restoreVolume: buildRestoreVolumeCommand } = await import(
	"@dokploy/server/utils/volume-backups/restore"
);
const { volumeBackupsRouter } = await import(
	"../../server/api/routers/volume-backups"
);

const createCaller = () =>
	volumeBackupsRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "admin",
		},
	} as never);

const runVolumeRestoreSubscription = async (
	input: Parameters<
		ReturnType<typeof createCaller>["restoreVolumeBackupWithLogs"]
	>[0],
) => {
	const stream = await createCaller().restoreVolumeBackupWithLogs(input);
	await new Promise<void>((resolve, reject) => {
		stream.subscribe({
			complete: resolve,
			error: reject,
			next: () => undefined,
		});
	});
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

const safeUpdateVolumeBackupInput = {
	...safeCreateVolumeBackupInput,
	volumeBackupId: "volume-backup-1",
};

const project = (organizationId = "org-1") => ({
	projectId: "project-1",
	organizationId,
});

const applicationService = (
	applicationId: string,
	organizationId = "org-1",
	serverId: string | null = null,
) => ({
	applicationId,
	environmentId: "env-1",
	serverId,
	environment: {
		environmentId: "env-1",
		project: project(organizationId),
	},
});

const composeService = (
	composeId: string,
	organizationId = "org-1",
	serverId: string | null = null,
) => ({
	composeId,
	environmentId: "env-1",
	serverId,
	environment: {
		environmentId: "env-1",
		project: project(organizationId),
	},
});

describe("volume backup destination ownership boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findMemberByUserId.mockResolvedValue({
			role: "admin",
			accessedEnvironments: [],
			accessedProjects: [],
			accessedServices: [],
		});
		mocks.findApplicationById.mockImplementation((applicationId: string) =>
			Promise.resolve(applicationService(applicationId)),
		);
		mocks.createVolumeBackup.mockResolvedValue({
			...safeCreateVolumeBackupInput,
			volumeBackupId: "volume-backup-1",
		});
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-2",
		});
		mocks.mountFindMany.mockResolvedValue([
			{ volumeName: safeCreateVolumeBackupInput.volumeName },
		]);
		mocks.findVolumeBackupById.mockResolvedValue({
			...safeUpdateVolumeBackupInput,
		});
		mocks.updateVolumeBackup.mockResolvedValue({
			...safeUpdateVolumeBackupInput,
		});
	});

	it("rejects cross-organization destinations on volume-backup create before persistence", async () => {
		await expect(
			createCaller().create(safeCreateVolumeBackupInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.scheduleVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.schedule).not.toHaveBeenCalled();
	});

	it("rejects cross-organization destinations on volume-backup update before persistence", async () => {
		await expect(
			createCaller().update(safeUpdateVolumeBackupInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.scheduleVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.updateJob).not.toHaveBeenCalled();
	});

	it("allows same-organization destinations on volume-backup create", async () => {
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});

		await expect(
			createCaller().create(safeCreateVolumeBackupInput),
		).resolves.toMatchObject({ volumeBackupId: "volume-backup-1" });

		expect(mocks.createVolumeBackup).toHaveBeenCalledWith(
			safeCreateVolumeBackupInput,
		);
	});

	it("allows same-organization destinations on volume-backup update", async () => {
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});

		await expect(
			createCaller().update(safeUpdateVolumeBackupInput),
		).resolves.toMatchObject({ volumeBackupId: "volume-backup-1" });

		expect(mocks.updateVolumeBackup).toHaveBeenCalledWith(
			"volume-backup-1",
			safeUpdateVolumeBackupInput,
		);
	});

	it("rejects volume-backup creates for Docker volumes not declared by the selected service", async () => {
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});
		mocks.mountFindMany.mockResolvedValue([{ volumeName: "data_volume" }]);

		await expect(
			createCaller().create({
				...safeCreateVolumeBackupInput,
				volumeName: "foreign_volume",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.scheduleVolumeBackup).not.toHaveBeenCalled();
	});

	it("rejects volume-backup updates for Docker volumes not declared by the selected service", async () => {
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});
		mocks.mountFindMany.mockResolvedValue([{ volumeName: "data_volume" }]);

		await expect(
			createCaller().update({
				...safeUpdateVolumeBackupInput,
				volumeName: "foreign_volume",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.updateJob).not.toHaveBeenCalled();
		expect(mocks.scheduleVolumeBackup).not.toHaveBeenCalled();
	});

	it("rejects volume-backup updates that reassign to a service outside the active organization", async () => {
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});
		mocks.findApplicationById.mockImplementation((applicationId: string) =>
			Promise.resolve(
				applicationId === "app-2"
					? applicationService("app-2", "org-2")
					: applicationService(applicationId),
			),
		);

		await expect(
			createCaller().update({
				...safeUpdateVolumeBackupInput,
				applicationId: "app-2",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.updateJob).not.toHaveBeenCalled();
		expect(mocks.scheduleVolumeBackup).not.toHaveBeenCalled();
	});

	it("rejects volume-backup updates that include a foreign secondary service binding", async () => {
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});
		mocks.findComposeById.mockResolvedValue(
			composeService("compose-2", "org-2"),
		);

		await expect(
			createCaller().update({
				...safeUpdateVolumeBackupInput,
				composeId: "compose-2",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.findComposeById).toHaveBeenCalledWith("compose-2");
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
		expect(mocks.updateJob).not.toHaveBeenCalled();
		expect(mocks.scheduleVolumeBackup).not.toHaveBeenCalled();
	});

	it("rejects cross-organization volume-backup reads for owner and admin roles", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			...safeUpdateVolumeBackupInput,
			applicationId: "app-2",
		});
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-2", "org-2"),
		);

		await expect(
			createCaller().one({ volumeBackupId: "volume-backup-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects cross-organization volume-backup lists for owner and admin roles", async () => {
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-2", "org-2"),
		);

		await expect(
			createCaller().list({
				id: "app-2",
				volumeBackupType: "application",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.findVolumeBackups).not.toHaveBeenCalled();
	});

	it("rejects cross-organization volume-backup deletes before persistence", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			...safeUpdateVolumeBackupInput,
			applicationId: "app-2",
		});
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-2", "org-2"),
		);

		await expect(
			createCaller().delete({ volumeBackupId: "volume-backup-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.removeVolumeBackup).not.toHaveBeenCalled();
	});

	it("rejects cross-organization manual volume-backup runs before execution", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			...safeUpdateVolumeBackupInput,
			applicationId: "app-2",
		});
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-2", "org-2"),
		);

		await expect(
			createCaller().runManually({ volumeBackupId: "volume-backup-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.runVolumeBackup).not.toHaveBeenCalled();
	});

	it("fails closed for volume backups with no owning service binding", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "volume-backup-1",
		});

		await expect(
			createCaller().one({ volumeBackupId: "volume-backup-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("volume backup restore command safety", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findApplicationById.mockResolvedValue({ appName: "app-one" });
		mocks.findComposeById.mockResolvedValue({
			appName: "compose-one",
			composeType: "docker-compose",
		});
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});
		mocks.getS3Credentials.mockReturnValue([
			"--s3-provider",
			"AWS",
			"--s3-access-key-id",
			"key",
		]);
		mocks.paths.mockReturnValue({
			VOLUME_BACKUPS_PATH: "/srv/dokploy/volume-backups",
		});
	});

	it("rejects unsafe Docker volume names before command generation", async () => {
		await expect(
			buildRestoreVolumeCommand(
				"app-1",
				"destination-1",
				"data;id",
				"app-one/prefix/data-2026-06-22.tar",
				"",
				"application",
			),
		).rejects.toThrow("Invalid Docker volume name");
	});

	it("rejects unsafe backup object paths before command generation", async () => {
		await expect(
			buildRestoreVolumeCommand(
				"app-1",
				"destination-1",
				"data",
				"../secret.tar",
				"",
				"application",
			),
		).rejects.toThrow("Invalid file path");
	});

	it("supports safe prefixed S3 backup paths without nesting local tar paths", async () => {
		const command = await buildRestoreVolumeCommand(
			"app-1",
			"destination-1",
			"data_volume",
			"app-one/prefix/data_volume-2026-06-22.tar",
			"",
			"application",
		);
		const unescapedCommand = command.replace(/\\/g, "");

		expect(unescapedCommand).toContain(
			":s3:dokploy-backups/app-one/prefix/data_volume-2026-06-22.tar",
		);
		expect(unescapedCommand.indexOf("tar -tf")).toBeGreaterThan(-1);
		expect(unescapedCommand.indexOf("tar -tf")).toBeLessThan(
			unescapedCommand.indexOf("tar xvf"),
		);
		expect(unescapedCommand).toContain("Unsafe archive member");
		expect(unescapedCommand).toContain("Unsupported archive member");
		expect(unescapedCommand).toContain("/backup/data_volume-2026-06-22.tar");
		expect(unescapedCommand).not.toContain("/backup/app-one/prefix");
		expect(unescapedCommand).not.toContain("../");
		expect(unescapedCommand).not.toContain(";id");
	});
});

describe("volume backup restore access boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findMemberByUserId.mockResolvedValue({
			role: "admin",
			accessedEnvironments: [],
			accessedProjects: [],
			accessedServices: [],
		});
		mocks.findApplicationById.mockResolvedValue(applicationService("app-1"));
		mocks.findDestinationById.mockResolvedValue({
			bucket: "dokploy-backups",
			organizationId: "org-1",
		});
		mocks.findServerById.mockResolvedValue({
			organizationId: "org-1",
			serverId: "server-1",
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.findVolumeBackups.mockResolvedValue([
			{
				application: { appName: "app-one" },
				applicationId: "app-1",
				destinationId: "destination-1",
				prefix: "prefix",
				serviceType: "application",
				volumeName: "data_volume",
			},
		]);
		mocks.restoreVolume.mockResolvedValue("echo restore");
		mocks.execAsyncStream.mockResolvedValue(undefined);
		mocks.execAsyncRemote.mockResolvedValue(undefined);
	});

	it("denies inaccessible services before restore command side effects", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new TRPCError({
				code: "UNAUTHORIZED",
				message: "Service access denied",
			}),
		);

		await expect(
			createCaller().restoreVolumeBackupWithLogs({
				backupFileName: "app-one/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.restoreVolume).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsyncStream).not.toHaveBeenCalled();
	});

	it("denies inaccessible restore execution servers before command generation", async () => {
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-1", "org-1", "server-1"),
		);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().restoreVolumeBackupWithLogs({
				backupFileName: "app-one/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.restoreVolume).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsyncStream).not.toHaveBeenCalled();
	});

	it("rejects caller-selected servers that differ from service placement", async () => {
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-1", "org-1", "server-1"),
		);
		mocks.getAccessibleServerIds.mockResolvedValue(
			new Set(["server-1", "server-2"]),
		);

		await expect(
			createCaller().restoreVolumeBackupWithLogs({
				backupFileName: "app-one/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
				serverId: "server-2",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.restoreVolume).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsyncStream).not.toHaveBeenCalled();
	});

	it("rejects caller-selected servers for local service placement", async () => {
		await expect(
			createCaller().restoreVolumeBackupWithLogs({
				backupFileName: "app-one/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.restoreVolume).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsyncStream).not.toHaveBeenCalled();
	});

	it("restores on the service placement server when caller omits serverId", async () => {
		mocks.findApplicationById.mockResolvedValue(
			applicationService("app-1", "org-1", "server-1"),
		);

		await expect(
			runVolumeRestoreSubscription({
				backupFileName: "app-one/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
			}),
		).resolves.toBe(undefined);

		expect(mocks.restoreVolume).toHaveBeenCalledWith(
			"app-1",
			"destination-1",
			"data_volume",
			"app-one/prefix/data_volume-2026-06-22.tar",
			"server-1",
			"application",
		);
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"echo restore",
			expect.any(Function),
		);
		expect(mocks.execAsyncStream).not.toHaveBeenCalled();
	});

	it("denies restore objects outside the matching volume-backup schedule", async () => {
		await expect(
			createCaller().restoreVolumeBackupWithLogs({
				backupFileName: "other-app/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.restoreVolume).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.execAsyncStream).not.toHaveBeenCalled();
	});

	it("allows restore objects bound to the matching volume-backup schedule", async () => {
		await expect(
			runVolumeRestoreSubscription({
				backupFileName: "app-one/prefix/data_volume-2026-06-22.tar",
				destinationId: "destination-1",
				volumeName: "data_volume",
				id: "app-1",
				serviceType: "application",
			}),
		).resolves.toBe(undefined);

		expect(mocks.restoreVolume).toHaveBeenCalledWith(
			"app-1",
			"destination-1",
			"data_volume",
			"app-one/prefix/data_volume-2026-06-22.tar",
			"",
			"application",
		);
	});
});
