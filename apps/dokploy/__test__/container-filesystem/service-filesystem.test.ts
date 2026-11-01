import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	finders: {
		application: vi.fn(),
		postgres: vi.fn(),
		mysql: vi.fn(),
		mariadb: vi.fn(),
		mongo: vi.fn(),
		redis: vi.fn(),
		libsql: vi.fn(),
		compose: vi.fn(),
	},
	checkPermission: vi.fn(),
	listContainers: vi.fn(),
	getContainer: vi.fn(),
	listComposeContainers: vi.fn(),
	getComposeContainer: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	ContainerFilesystemError: class extends Error {},
	findApplicationById: mocks.finders.application,
	findPostgresById: mocks.finders.postgres,
	findMySqlById: mocks.finders.mysql,
	findMariadbById: mocks.finders.mariadb,
	findMongoById: mocks.finders.mongo,
	findRedisById: mocks.finders.redis,
	findLibsqlById: mocks.finders.libsql,
	findComposeById: mocks.finders.compose,
	getApplicationFilesystemContainers: mocks.listContainers,
	getApplicationFilesystemContainer: mocks.getContainer,
	getComposeFilesystemContainers: mocks.listComposeContainers,
	getComposeFilesystemContainer: mocks.getComposeContainer,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkPermission,
}));

const {
	FILESYSTEM_SERVICE_TYPES,
	getAuthorizedServiceFilesystem,
	getAuthorizedServiceFilesystemContainer,
	listServiceFilesystemContainers,
} = await import("@/server/api/utils/service-filesystem");

const context = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};
const service = {
	appName: "database-1",
	serverId: "server-1",
	environment: { project: { organizationId: "org-1" } },
};
const serviceTypes = [
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
	"compose",
] as const;

beforeEach(() => {
	vi.resetAllMocks();
	for (const finder of Object.values(mocks.finders)) {
		finder.mockResolvedValue(service);
	}
	mocks.listContainers.mockResolvedValue([]);
	mocks.listComposeContainers.mockResolvedValue({ containers: [] });
	mocks.getContainer.mockResolvedValue({ container: "container-handle" });
	mocks.getComposeContainer.mockResolvedValue({ container: "compose-handle" });
});

describe("service filesystem access", () => {
	it("accepts every supported service type including libsql", () => {
		expect(FILESYSTEM_SERVICE_TYPES).toEqual(
			expect.arrayContaining([...serviceTypes]),
		);
	});

	it.each(serviceTypes)(
		"checks permission before finding a %s service",
		async (type) => {
			const denied = new TRPCError({ code: "FORBIDDEN" });
			mocks.checkPermission.mockRejectedValue(denied);

			await expect(
				getAuthorizedServiceFilesystem(context, type, "service-1"),
			).rejects.toBe(denied);
			expect(mocks.finders[type]).not.toHaveBeenCalled();
			expect(mocks.listContainers).not.toHaveBeenCalled();
		},
	);

	it.each(serviceTypes)(
		"rejects a %s service outside the active organization",
		async (type) => {
			mocks.finders[type].mockResolvedValue({
				...service,
				environment: { project: { organizationId: "other-org" } },
			});

			await expect(
				listServiceFilesystemContainers(context, type, "service-1"),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(mocks.listContainers).not.toHaveBeenCalled();
			expect(mocks.listComposeContainers).not.toHaveBeenCalled();
		},
	);

	it.each(serviceTypes)(
		"forwards authorized %s services to their container listing",
		async (type) => {
			await listServiceFilesystemContainers(context, type, "service-1");

			expect(mocks.finders[type]).toHaveBeenCalledWith("service-1");
			expect(mocks.checkPermission).toHaveBeenCalledWith(context, "service-1", {
				containerFilesystem: ["read"],
			});
			if (type === "compose") {
				expect(mocks.listComposeContainers).toHaveBeenCalledWith(
					service.appName,
					"docker-compose",
					service.serverId,
				);
			} else {
				expect(mocks.listContainers).toHaveBeenCalledWith(
					service.appName,
					service.serverId,
				);
			}
		},
	);

	it.each(serviceTypes)(
		"requires read and write permissions for %s uploads",
		async (type) => {
			await getAuthorizedServiceFilesystemContainer(
				context,
				type,
				"service-1",
				"container-1",
				["read", "write"],
			);

			expect(mocks.checkPermission).toHaveBeenCalledWith(context, "service-1", {
				containerFilesystem: ["read", "write"],
			});
			if (type === "compose") {
				expect(mocks.getComposeContainer).toHaveBeenCalledWith(
					service.appName,
					"docker-compose",
					"container-1",
					service.serverId,
				);
			} else {
				expect(mocks.getContainer).toHaveBeenCalledWith(
					service.appName,
					"container-1",
					service.serverId,
				);
			}
		},
	);
});
