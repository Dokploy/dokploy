import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STUDIO_APP = "studio-app";
const STUDIO_HOST = "studio.example.com";
const STUDIO_VOLUME = "studio-data";
const OTHER_APP = "foreign-app";
const serviceScope = (serverId: string | null, organizationId = "org-1") => ({
	serverId,
	environment: { project: { organizationId } },
});
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
	it("refuses a member's change to a mount of a LibreDB Studio", async () => {
		mocks.findMountById.mockResolvedValue({
			mountId: "mount-1",
			applicationId: STUDIO_APP,
		});
		await expect(
			mountRouter
				.createCaller(ctx)
				.update({ mountId: "mount-1", mountPath: "/data" }),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.updateMount).not.toHaveBeenCalled();
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
	it("refuses a member's backup that names a LibreDB Studio as its service", async () => {
		await expect(
			volumeBackupsRouter.createCaller(ctx).create({
				name: "nightly",
				volumeName: STUDIO_VOLUME,
				prefix: "p",
				cronExpression: "0 0 * * *",
				destinationId: "dest-1",
				applicationId: STUDIO_APP,
			}),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
	});

	it("refuses a restore that names a LibreDB Studio as its service", async () => {
		await expect(
			volumeBackupsRouter.createCaller(ctx).restoreVolumeBackupWithLogs({
				backupFileName: "admin.tar",
				destinationId: "dest-1",
				volumeName: STUDIO_VOLUME,
				id: STUDIO_APP,
				serviceType: "application",
			}),
		).rejects.toMatchObject(guardRefusal);
		expect(mocks.restoreVolume).not.toHaveBeenCalled();
	});
});
