import { TRPCError } from "@trpc/server";
import { is, Param, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STUDIO_APP = "studio-app";
const STUDIO_HOST = "studio.example.com";
const STUDIO_VOLUME = "studio-data";
const OTHER_APP = "foreign-app";
const serviceScope = (serverId: string | null, organizationId = "org-1") => ({
	serverId,
	environment: { project: { organizationId } },
});
const studioVolumeMount = {
	mountId: "mount-studio",
	type: "volume",
	volumeName: STUDIO_VOLUME,
	applicationId: STUDIO_APP,
	application: serviceScope(null),
};
const ACCESS_MESSAGE = "You don't have access to this service";
const GUARD_MESSAGE =
	"Only owners and admins of the organization can change a LibreDB Studio. Members can open it with Open in LibreDB Studio.";
const HOST_IN_USE_MESSAGE =
	"Another service already uses this domain. Choose a domain that only this service uses.";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	checkPermission: vi.fn(),
	findScheduleById: vi.fn(),
	updateSchedule: vi.fn(),
	assertHostScheduleAccess: vi.fn(),
	scheduleJob: vi.fn(),
	removeScheduleJob: vi.fn(),
	createDomain: vi.fn(),
	findMountById: vi.fn(),
	updateMount: vi.fn(),
	findVolumeBackupById: vi.fn(),
	updateVolumeBackup: vi.fn(),
	removeVolumeBackupJob: vi.fn(),
	scheduleVolumeBackup: vi.fn(),
	createVolumeBackup: vi.fn(),
	restoreVolume: vi.fn(),
	runVolumeBackup: vi.fn(),
	findDestinationById: vi.fn(),
	mountsFindMany: vi.fn(),
	applicationsFindFirst: vi.fn(),
	composeFindFirst: vi.fn(),
	postgresFindFirst: vi.fn(),
	checkLibreDBStudioHost: vi.fn(),
	updateDomainById: vi.fn(),
	findDomainById: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			mounts: { findMany: mocks.mountsFindMany },
			applications: { findFirst: mocks.applicationsFindFirst },
			compose: { findFirst: mocks.composeFindFirst },
			postgres: { findFirst: mocks.postgresFindFirst },
			mysql: { findFirst: vi.fn() },
			mariadb: { findFirst: vi.fn() },
			mongo: { findFirst: vi.fn() },
			redis: { findFirst: vi.fn() },
			libsql: { findFirst: vi.fn() },
		},
	},
}));
vi.mock("@/server/db", () => ({ db: {} }));

const serverModule = vi.hoisted(() => ({
	IS_CLOUD: false,
	runCommand: vi.fn(),
	scheduleJob: mocks.scheduleJob,
	removeScheduleJob: mocks.removeScheduleJob,
	createDomain: mocks.createDomain,
	findApplicationById: vi.fn(),
	findDomainById: mocks.findDomainById,
	findDomainsByApplicationId: vi.fn(),
	findDomainsByComposeId: vi.fn(),
	findPreviewDeploymentById: vi.fn(),
	findServerById: vi.fn(),
	generateTraefikMeDomain: vi.fn(),
	getServerIpCandidates: vi.fn(),
	getWebServerSettings: vi.fn(),
	manageDomain: vi.fn(),
	removeDomain: vi.fn(),
	removeDomainById: vi.fn(),
	updateDomainById: mocks.updateDomainById,
	validateDomain: vi.fn(),
	createMount: vi.fn(),
	deleteMount: vi.fn(),
	findComposeById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMountById: mocks.findMountById,
	findMountsByApplicationId: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findRedisById: vi.fn(),
	getServiceContainer: vi.fn(),
	updateMount: mocks.updateMount,
	createVolumeBackup: mocks.createVolumeBackup,
	findVolumeBackupById: mocks.findVolumeBackupById,
	removeVolumeBackup: vi.fn(),
	removeVolumeBackupJob: mocks.removeVolumeBackupJob,
	restoreVolume: mocks.restoreVolume,
	runVolumeBackup: mocks.runVolumeBackup,
	scheduleVolumeBackup: mocks.scheduleVolumeBackup,
	updateVolumeBackup: mocks.updateVolumeBackup,
}));

vi.mock("@dokploy/server", () => serverModule);
vi.mock("@dokploy/server/index", () => serverModule);

vi.mock("@dokploy/server/services/permission", () => ({
	DOMAIN_HOST_IN_USE_MESSAGE: HOST_IN_USE_MESSAGE,
	LIBREDB_STUDIO_MEMBER_CHANGE_MESSAGE: GUARD_MESSAGE,
	checkLibreDBStudioHost: mocks.checkLibreDBStudioHost,
	checkPermission: mocks.checkPermission,
	checkServiceAccess: vi.fn(),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: vi.fn(),
}));

vi.mock("@dokploy/server/services/schedule", () => ({
	assertHostScheduleAccess: mocks.assertHostScheduleAccess,
	createSchedule: vi.fn(),
	deleteSchedule: vi.fn(),
	findScheduleById: mocks.findScheduleById,
	updateSchedule: mocks.updateSchedule,
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: mocks.findDestinationById,
}));

vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/api/utils/plan-limits", () => ({
	assertScheduledJobLimit: vi.fn(),
	assertVolumeBackupLimit: vi.fn(),
}));
vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
	updateJob: vi.fn(),
}));

const { scheduleRouter } = await import("@/server/api/routers/schedule");
const { domainRouter } = await import("@/server/api/routers/domain");
const { mountRouter } = await import("@/server/api/routers/mount");
const { volumeBackupsRouter } = await import(
	"@/server/api/routers/volume-backups"
);

const ctx = {
	session: { activeOrganizationId: "org-1", userId: "user-1" },
	user: { id: "user-1", email: "member@example.com", role: "member" },
} as Parameters<typeof scheduleRouter.createCaller>[0];

const guardRefusal = {
	code: "UNAUTHORIZED",
	message: GUARD_MESSAGE,
};
const hostRefusal = { code: "CONFLICT", message: HOST_IN_USE_MESSAGE };

beforeEach(() => {
	vi.resetAllMocks();
	mocks.checkServicePermissionAndAccess.mockImplementation(
		async (_ctx: unknown, serviceId: string, permissions: object) => {
			const changes = Object.values(permissions)
				.flat()
				.some((action) => action !== "read");
			if (serviceId === STUDIO_APP && changes) {
				throw new TRPCError({ code: "UNAUTHORIZED", message: GUARD_MESSAGE });
			}
			if (serviceId === OTHER_APP) {
				throw new TRPCError({ code: "UNAUTHORIZED", message: ACCESS_MESSAGE });
			}
		},
	);
	mocks.checkLibreDBStudioHost.mockImplementation(
		async (_ctx: unknown, host: string) => {
			if (host === STUDIO_HOST) {
				throw new TRPCError({ code: "CONFLICT", message: HOST_IN_USE_MESSAGE });
			}
		},
	);
	mocks.mountsFindMany.mockResolvedValue([]);
	mocks.applicationsFindFirst.mockResolvedValue(serviceScope(null));
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "dest-1",
		organizationId: "org-1",
	});
});

describe("schedule.update", () => {
	const ownSchedule = {
		scheduleId: "schedule-1",
		scheduleType: "application",
		applicationId: "own-app",
		composeId: null,
		serverId: null,
	};
	const update = (fields: Record<string, unknown>) =>
		scheduleRouter.createCaller(ctx).update({
			scheduleId: "schedule-1",
			name: "env dump",
			cronExpression: "* * * * *",
			command: "env",
			scheduleType: "application",
			...fields,
		});

	beforeEach(() => {
		mocks.findScheduleById.mockResolvedValue(ownSchedule);
		mocks.updateSchedule.mockResolvedValue({ ...ownSchedule, enabled: false });
	});

	it("refuses to move a member's schedule onto a LibreDB Studio", async () => {
		await expect(update({ applicationId: STUDIO_APP })).rejects.toMatchObject(
			guardRefusal,
		);
		expect(mocks.updateSchedule).not.toHaveBeenCalled();
	});

	it("refuses to move a server schedule onto a LibreDB Studio", async () => {
		mocks.findScheduleById.mockResolvedValue({
			...ownSchedule,
			scheduleType: "server",
			applicationId: null,
			serverId: "server-1",
		});
		await expect(update({ applicationId: STUDIO_APP })).rejects.toMatchObject(
			guardRefusal,
		);
		expect(mocks.updateSchedule).not.toHaveBeenCalled();
	});

	it("authorizes the new service when a schedule moves", async () => {
		await update({ applicationId: "other-app" });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"other-app",
			{ schedule: ["create"] },
		);
		expect(mocks.updateSchedule).toHaveBeenCalled();
	});

	it("still updates a schedule that stays on its service", async () => {
		await update({ applicationId: "own-app" });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledTimes(1);
		expect(mocks.updateSchedule).toHaveBeenCalled();
	});
});

describe("domain.create", () => {
	const create = (fields: Record<string, unknown>) =>
		domainRouter.createCaller(ctx).create({
			host: "attacker.example.com",
			https: true,
			...fields,
		});

	it("refuses a domain on a LibreDB Studio when domainType is omitted", async () => {
		await expect(create({ applicationId: STUDIO_APP })).rejects.toMatchObject({
			message: GUARD_MESSAGE,
		});
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});

	it("refuses a domain on a LibreDB Studio sent with domainType compose", async () => {
		await expect(
			create({
				domainType: "compose",
				composeId: "own-compose",
				applicationId: STUDIO_APP,
			}),
		).rejects.toMatchObject({ message: GUARD_MESSAGE });
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});

	it("keeps the code and message of the Studio guard refusal", async () => {
		await expect(create({ applicationId: STUDIO_APP })).rejects.toMatchObject(
			guardRefusal,
		);
	});

	it("keeps the code and message of the host refusal", async () => {
		await expect(
			create({ host: STUDIO_HOST, applicationId: "own-app" }),
		).rejects.toMatchObject(hostRefusal);
	});

	it("still reports an upstream access error as BAD_REQUEST", async () => {
		await expect(create({ applicationId: OTHER_APP })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: ACCESS_MESSAGE,
		});
	});

	it("still creates a domain on a service the member may change", async () => {
		mocks.createDomain.mockResolvedValue({ domainId: "d-1", host: "a" });
		await create({ domainType: "application", applicationId: "own-app" });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"own-app",
			{ domain: ["create"] },
		);
		expect(mocks.createDomain).toHaveBeenCalled();
	});
});

describe("mount.update", () => {
	beforeEach(() => {
		mocks.findMountById.mockResolvedValue({
			mountId: "mount-1",
			applicationId: "own-app",
		});
	});

	it("refuses to move a member's mount onto a LibreDB Studio", async () => {
		await expect(
			mountRouter
				.createCaller(ctx)
				.update({ mountId: "mount-1", applicationId: STUDIO_APP }),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.updateMount).not.toHaveBeenCalled();
	});

	it("still updates a mount that stays on its service", async () => {
		await mountRouter
			.createCaller(ctx)
			.update({ mountId: "mount-1", mountPath: "/data" });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledTimes(1);
		expect(mocks.updateMount).toHaveBeenCalled();
	});
});

describe("volumeBackups.update", () => {
	const update = (fields: Record<string, unknown>) =>
		volumeBackupsRouter.createCaller(ctx).update({
			volumeBackupId: "vb-1",
			name: "nightly",
			volumeName: "data",
			prefix: "p",
			appName: "own-app-name",
			cronExpression: "0 0 * * *",
			destinationId: "dest-1",
			...fields,
		});

	beforeEach(() => {
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "own-app",
		});
		mocks.updateVolumeBackup.mockResolvedValue({
			volumeBackupId: "vb-1",
			enabled: false,
		});
	});

	it("refuses to move a member's volume backup onto a LibreDB Studio", async () => {
		await expect(update({ applicationId: STUDIO_APP })).rejects.toMatchObject(
			guardRefusal,
		);
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
	});

	it("still updates a volume backup that stays on its service", async () => {
		await update({ applicationId: "own-app" });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledTimes(1);
		expect(mocks.updateVolumeBackup).toHaveBeenCalled();
	});
});

describe("domain host of a LibreDB Studio", () => {
	it("refuses a domain on another service that takes a Studio's host", async () => {
		await expect(
			domainRouter.createCaller(ctx).create({
				host: STUDIO_HOST,
				path: "/launch",
				https: true,
				domainType: "application",
				applicationId: "own-app",
			}),
		).rejects.toMatchObject(hostRefusal);
		expect(mocks.checkLibreDBStudioHost).toHaveBeenCalledWith(
			ctx,
			STUDIO_HOST,
			expect.objectContaining({ applicationId: "own-app" }),
		);
		expect(mocks.createDomain).not.toHaveBeenCalled();
	});

	it("refuses to change a member's domain to a Studio's host", async () => {
		mocks.findDomainById.mockResolvedValue({
			domainId: "d-1",
			applicationId: "own-app",
		});
		await expect(
			domainRouter
				.createCaller(ctx)
				.update({ domainId: "d-1", host: STUDIO_HOST, path: "/" }),
		).rejects.toMatchObject(hostRefusal);
		expect(mocks.updateDomainById).not.toHaveBeenCalled();
	});

	it("still updates a member's domain on another host", async () => {
		mocks.findDomainById.mockResolvedValue({
			domainId: "d-1",
			applicationId: "own-app",
		});
		await domainRouter
			.createCaller(ctx)
			.update({ domainId: "d-1", host: "own.example.com" });
		expect(mocks.checkLibreDBStudioHost).toHaveBeenCalledWith(
			ctx,
			"own.example.com",
			expect.objectContaining({ applicationId: "own-app" }),
		);
		expect(mocks.updateDomainById).toHaveBeenCalled();
	});
});

describe("volume of a LibreDB Studio", () => {
	const restore = (fields: Record<string, unknown>) =>
		volumeBackupsRouter.createCaller(ctx).restoreVolumeBackupWithLogs({
			backupFileName: "admin.tar",
			destinationId: "dest-1",
			volumeName: "own-data",
			id: "own-app",
			serviceType: "application",
			...fields,
		});

	it("refuses a restore that names a LibreDB Studio as its service", async () => {
		await expect(
			restore({ id: STUDIO_APP, volumeName: STUDIO_VOLUME }),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			STUDIO_APP,
			{ volumeBackup: ["restore"] },
		);
	});

	it("refuses a restore into a volume a LibreDB Studio mounts", async () => {
		mocks.mountsFindMany.mockResolvedValue([studioVolumeMount]);
		await expect(restore({ volumeName: STUDIO_VOLUME })).rejects.toMatchObject(
			guardRefusal,
		);
		expect(mocks.restoreVolume).not.toHaveBeenCalled();
	});

	it("still restores into a volume of the member's own service", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			{
				...studioVolumeMount,
				volumeName: "own-data",
				applicationId: "own-app",
			},
		]);
		await expect(restore({})).resolves.toBeDefined();
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledTimes(1);
	});

	it("refuses a backup of a member's service that names a Studio's volume", async () => {
		mocks.mountsFindMany.mockResolvedValue([studioVolumeMount]);
		await expect(
			volumeBackupsRouter.createCaller(ctx).create({
				name: "copy",
				volumeName: STUDIO_VOLUME,
				prefix: "p",
				appName: "own-app-name",
				cronExpression: "0 0 * * *",
				destinationId: "dest-1",
				serviceType: "application",
				applicationId: "own-app",
			}),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses to point a member's volume backup at a Studio's volume", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "own-app",
		});
		mocks.mountsFindMany.mockResolvedValue([studioVolumeMount]);
		await expect(
			volumeBackupsRouter.createCaller(ctx).update({
				volumeBackupId: "vb-1",
				name: "nightly",
				volumeName: STUDIO_VOLUME,
				prefix: "p",
				appName: "own-app-name",
				cronExpression: "0 0 * * *",
				destinationId: "dest-1",
			}),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
	});
});

describe("volume shared by name", () => {
	const create = (fields: Record<string, unknown> = {}) =>
		volumeBackupsRouter.createCaller(ctx).create({
			name: "nightly",
			volumeName: "data",
			prefix: "p",
			appName: "own-app-name",
			cronExpression: "0 0 * * *",
			destinationId: "dest-1",
			serviceType: "application",
			applicationId: "own-app",
			...fields,
		});
	const dataMount = (
		serviceId: string,
		scope: ReturnType<typeof serviceScope>,
	) => ({
		mountId: `mount-${serviceId}`,
		type: "volume",
		volumeName: "data",
		applicationId: serviceId,
		application: scope,
	});

	const volumeRefusal = {
		code: "UNAUTHORIZED",
		message: "You don't have access to this volume",
	};

	beforeEach(() => {
		mocks.createVolumeBackup.mockResolvedValue({
			volumeBackupId: "vb-2",
			enabled: false,
		});
	});

	it("refuses a backup when a service of another organization on the same server mounts the volume", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			dataMount("org-2-app", serviceScope(null, "org-2")),
		]);
		await expect(create()).rejects.toMatchObject(volumeRefusal);
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalledWith(
			ctx,
			"org-2-app",
			expect.anything(),
		);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses a restore when a service of another organization on the server it runs on mounts the volume", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			dataMount("org-2-app", serviceScope("srv-2", "org-2")),
		]);
		await expect(
			volumeBackupsRouter.createCaller(ctx).restoreVolumeBackupWithLogs({
				backupFileName: "admin.tar",
				destinationId: "dest-1",
				volumeName: "data",
				id: "own-app",
				serviceType: "application",
				serverId: "srv-2",
			}),
		).rejects.toMatchObject(volumeRefusal);
		expect(mocks.restoreVolume).not.toHaveBeenCalled();
	});

	it("allows a member's backup when only services on another server mount the volume", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			dataMount(OTHER_APP, serviceScope("srv-2")),
			dataMount(STUDIO_APP, serviceScope("srv-2")),
			dataMount("org-2-app", serviceScope("srv-2", "org-2")),
		]);
		await expect(create()).resolves.toBeDefined();
		expect(mocks.createVolumeBackup).toHaveBeenCalled();
	});

	it("refuses a member's backup when a LibreDB Studio on the same server mounts the volume", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			dataMount(STUDIO_APP, serviceScope(null)),
		]);
		await expect(create()).rejects.toMatchObject(guardRefusal);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses a member's backup when a service the member cannot change on the same server mounts the volume", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			dataMount(OTHER_APP, serviceScope(null)),
		]);
		await expect(create()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: ACCESS_MESSAGE,
		});
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("checks a database's backup against the Dokploy server, where it runs", async () => {
		mocks.applicationsFindFirst.mockResolvedValue(undefined);
		mocks.postgresFindFirst.mockResolvedValue(serviceScope("srv-2"));
		mocks.mountsFindMany.mockResolvedValue([
			dataMount(STUDIO_APP, serviceScope(null)),
		]);
		await expect(
			create({
				serviceType: "postgres",
				applicationId: undefined,
				postgresId: "own-postgres",
			}),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("checks a restore against the server it runs on", async () => {
		mocks.mountsFindMany.mockResolvedValue([
			dataMount(STUDIO_APP, serviceScope("srv-2")),
		]);
		await expect(
			volumeBackupsRouter.createCaller(ctx).restoreVolumeBackupWithLogs({
				backupFileName: "admin.tar",
				destinationId: "dest-1",
				volumeName: "data",
				id: "own-app",
				serviceType: "application",
				serverId: "srv-2",
			}),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.restoreVolume).not.toHaveBeenCalled();
	});
});

describe("server a volume backup runs on", () => {
	const queriedId = ({ where }: { where: SQL }) =>
		where.queryChunks.find((chunk) => is(chunk, Param))?.value;
	const placeServices = (servers: {
		applications?: Record<string, string | null>;
		compose?: Record<string, string | null>;
		postgres?: Record<string, string | null>;
	}) => {
		const finder =
			(placed: Record<string, string | null> = {}) =>
			async (query: { where: SQL }) => {
				const id = String(queriedId(query));
				return id in placed ? serviceScope(placed[id] ?? null) : undefined;
			};
		mocks.applicationsFindFirst.mockImplementation(
			finder(servers.applications),
		);
		mocks.composeFindFirst.mockImplementation(finder(servers.compose));
		mocks.postgresFindFirst.mockImplementation(finder(servers.postgres));
	};
	const mountOnServer2 = (volumeName: string) => ({
		mountId: "mount-foreign",
		type: "volume",
		volumeName,
		applicationId: OTHER_APP,
		application: serviceScope("srv-2"),
	});
	const accessRefusal = { code: "UNAUTHORIZED", message: ACCESS_MESSAGE };
	const backupFields = {
		name: "nightly",
		prefix: "p",
		appName: "own-app-name",
		cronExpression: "0 0 * * *",
		destinationId: "dest-1",
	};
	const create = (fields: Record<string, unknown>) =>
		volumeBackupsRouter.createCaller(ctx).create({
			...backupFields,
			volumeName: "data",
			...fields,
		});
	const update = (fields: Record<string, unknown>) =>
		volumeBackupsRouter.createCaller(ctx).update({
			...backupFields,
			volumeBackupId: "vb-1",
			volumeName: "data",
			...fields,
		});

	beforeEach(() => {
		mocks.createVolumeBackup.mockResolvedValue({
			volumeBackupId: "vb-2",
			enabled: false,
		});
		mocks.updateVolumeBackup.mockResolvedValue({
			volumeBackupId: "vb-1",
			enabled: false,
		});
	});

	it("refuses an update that adds a database to a backup of an application on another server", async () => {
		placeServices({
			applications: { "own-app": "srv-2" },
			postgres: { "own-postgres": null },
		});
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "own-app",
			volumeName: "data",
		});
		mocks.mountsFindMany.mockResolvedValue([mountOnServer2("secret-vol")]);
		await expect(
			update({ postgresId: "own-postgres", volumeName: "secret-vol" }),
		).rejects.toMatchObject(accessRefusal);
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
	});

	it("checks a created backup of a database and a compose against the compose's server", async () => {
		placeServices({
			compose: { "own-compose": "srv-2" },
			postgres: { "own-postgres": null },
		});
		mocks.mountsFindMany.mockResolvedValue([mountOnServer2("data")]);
		await expect(
			create({
				serviceType: "postgres",
				postgresId: "own-postgres",
				composeId: "own-compose",
			}),
		).rejects.toMatchObject(accessRefusal);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("checks the volume when an update changes only the services of a backup", async () => {
		placeServices({
			compose: { "own-compose": "srv-2" },
			postgres: { "own-postgres": null },
		});
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			composeId: "own-compose",
			volumeName: "data",
		});
		mocks.mountsFindMany.mockResolvedValue([mountOnServer2("data")]);
		await expect(update({ postgresId: "own-postgres" })).rejects.toMatchObject(
			accessRefusal,
		);
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
	});

	it("checks the compose's server when the application runs on the Dokploy server", async () => {
		placeServices({
			applications: { "own-app": null },
			compose: { "own-compose": "srv-2" },
		});
		mocks.mountsFindMany.mockResolvedValue([mountOnServer2("data")]);
		await expect(
			create({
				serviceType: "application",
				applicationId: "own-app",
				composeId: "own-compose",
			}),
		).rejects.toMatchObject(accessRefusal);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses a created backup that names a second service the member cannot change", async () => {
		placeServices({
			applications: { "own-app": null },
			compose: { [OTHER_APP]: null },
		});
		await expect(
			create({
				serviceType: "application",
				applicationId: "own-app",
				composeId: OTHER_APP,
			}),
		).rejects.toMatchObject(accessRefusal);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			OTHER_APP,
			{ volumeBackup: ["create"] },
		);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses an update of a backup that already names a second service the member cannot change", async () => {
		placeServices({
			applications: { "own-app": null },
			compose: { [OTHER_APP]: null },
		});
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "own-app",
			composeId: OTHER_APP,
			volumeName: "data",
		});
		await expect(
			update({ serviceType: "compose", turnOff: true }),
		).rejects.toMatchObject(accessRefusal);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			OTHER_APP,
			{ volumeBackup: ["update"] },
		);
		expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses to run a backup that names a second service the member cannot change", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "own-app",
			composeId: OTHER_APP,
			volumeName: "data",
		});
		await expect(
			volumeBackupsRouter
				.createCaller(ctx)
				.runManually({ volumeBackupId: "vb-1" }),
		).rejects.toMatchObject(accessRefusal);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			OTHER_APP,
			{ volumeBackup: ["create"] },
		);
		expect(mocks.runVolumeBackup).not.toHaveBeenCalled();
	});

	it("still runs a backup of one service the member may change", async () => {
		mocks.findVolumeBackupById.mockResolvedValue({
			volumeBackupId: "vb-1",
			applicationId: "own-app",
			volumeName: "data",
		});
		mocks.runVolumeBackup.mockResolvedValue(true);
		await expect(
			volumeBackupsRouter
				.createCaller(ctx)
				.runManually({ volumeBackupId: "vb-1" }),
		).resolves.toBe(true);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledTimes(1);
		expect(mocks.runVolumeBackup).toHaveBeenCalledWith("vb-1");
	});

	it("stores the services an update checked when another update moves the backup meanwhile", async () => {
		placeServices({
			applications: { "own-app": null },
			compose: { "own-compose": "srv-2" },
		});
		const row: Record<string, unknown> = {
			volumeBackupId: "vb-1",
			applicationId: "own-app",
			volumeName: "data",
		};
		mocks.findVolumeBackupById.mockImplementation(async () => ({ ...row }));
		// updateVolumeBackup sets only the columns it is given, like the service.
		mocks.updateVolumeBackup.mockImplementation(
			async (_id: string, fields: Record<string, unknown>) => {
				for (const [field, value] of Object.entries(fields)) {
					if (value !== undefined) row[field] = value;
				}
				return { ...row, enabled: false };
			},
		);
		let reachSecretCheck = () => {};
		const secretCheckReached = new Promise<void>((resolve) => {
			reachSecretCheck = resolve;
		});
		let releaseSecretCheck = () => {};
		const secretCheckReleased = new Promise<void>((resolve) => {
			releaseSecretCheck = resolve;
		});
		mocks.mountsFindMany.mockImplementation(async () => {
			if (mocks.mountsFindMany.mock.calls.length === 1) {
				reachSecretCheck();
				await secretCheckReleased;
				return [mountOnServer2("secret-vol")];
			}
			return [];
		});

		const secretUpdate = update({ volumeName: "secret-vol" });
		await secretCheckReached;
		await update({ volumeName: "harmless", composeId: "own-compose" });
		releaseSecretCheck();
		await secretUpdate;

		expect(row).toMatchObject({ volumeName: "secret-vol", composeId: null });
	});
});
