import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	db: {
		query: {
			applications: { findFirst: vi.fn(), findMany: vi.fn() },
			compose: { findFirst: vi.fn(), findMany: vi.fn() },
			libsql: { findFirst: vi.fn(), findMany: vi.fn() },
			mariadb: { findFirst: vi.fn(), findMany: vi.fn() },
			mongo: { findFirst: vi.fn(), findMany: vi.fn() },
			mysql: { findFirst: vi.fn(), findMany: vi.fn() },
			postgres: { findFirst: vi.fn(), findMany: vi.fn() },
			previewDeployments: { findFirst: vi.fn(), findMany: vi.fn() },
			redis: { findFirst: vi.fn(), findMany: vi.fn() },
		},
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: mocks.db,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("drizzle-orm")>();
	return {
		...actual,
		eq: vi.fn((_left, right) => ({ right })),
	};
});

const {
	filterContainerResourceStatsByAccess,
	findAccessibleContainerResourceStat,
} = await import("../../server/api/utils/monitoring-access");

const ctx = {
	session: {
		activeOrganizationId: "org-1",
	},
	user: {
		id: "actor-1",
		role: "member",
	},
};

const environment = (organizationId: string) => ({
	project: {
		organizationId,
	},
});

const deniedAccessError = () => {
	const error = new Error("denied") as Error & { code: string };
	error.code = "UNAUTHORIZED";
	return error;
};

const resetServiceLookups = () => {
	for (const table of Object.values(mocks.db.query)) {
		table.findFirst.mockResolvedValue(null);
		table.findMany.mockResolvedValue([]);
	}
};

const lookupAppName = (query: { where?: { right?: string } }) =>
	query.where?.right;

describe("container resource stats access filtering", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetServiceLookups();
		mocks.checkServicePermissionAndAccess.mockImplementation(
			async (_ctx, serviceId: string) => {
				if (serviceId === "redis-denied") {
					throw deniedAccessError();
				}
			},
		);
	});

	it("keeps only local container stats tied to services with monitoring access", async () => {
		mocks.db.query.applications.findFirst.mockImplementation(async (query) => {
			switch (lookupAppName(query)) {
				case "allowed-service":
					return {
						applicationId: "application-allowed",
						appName: "allowed-service",
						serverId: null,
						environment: environment("org-1"),
					};
				case "remote-service":
					return {
						applicationId: "application-remote",
						appName: "remote-service",
						serverId: "server-1",
						environment: environment("org-1"),
					};
				case "foreign-service":
					return {
						applicationId: "application-foreign",
						appName: "foreign-service",
						serverId: null,
						environment: environment("org-2"),
					};
				default:
					return null;
			}
		});
		mocks.db.query.compose.findFirst.mockImplementation(async (query) =>
			lookupAppName(query) === "compose-project"
				? {
						composeId: "compose-allowed",
						appName: "compose-project",
						serverId: null,
						environment: environment("org-1"),
					}
				: null,
		);
		mocks.db.query.previewDeployments.findFirst.mockImplementation(
			async (query) =>
				lookupAppName(query) === "preview-service"
					? {
							appName: "preview-service",
							application: {
								applicationId: "application-allowed",
								serverId: null,
								environment: environment("org-1"),
							},
						}
					: null,
		);
		mocks.db.query.redis.findFirst.mockImplementation(async (query) =>
			lookupAppName(query) === "denied-redis"
				? {
						redisId: "redis-denied",
						appName: "denied-redis",
						serverId: null,
						environment: environment("org-1"),
					}
				: null,
		);

		const stats: Array<{
			ID: string;
			Labels: Record<string, string> | string;
			Name: string;
		}> = [
			{
				ID: "allowed-swarm",
				Labels: {
					"com.docker.swarm.service.name": "allowed-service",
				},
				Name: "allowed-service.1.task",
			},
			{
				ID: "allowed-compose",
				Labels: {
					"com.docker.compose.project": "compose-project",
				},
				Name: "compose-project-web-1",
			},
			{
				ID: "allowed-preview-string-labels",
				Labels:
					"com.docker.swarm.service.name=preview-service,maintainer=dokploy",
				Name: "preview-service.1.task",
			},
			{
				ID: "allowed-exact-name",
				Labels: {},
				Name: "allowed-service",
			},
			{
				ID: "remote",
				Labels: {
					"com.docker.swarm.service.name": "remote-service",
				},
				Name: "remote-service.1.task",
			},
			{
				ID: "foreign",
				Labels: {
					"com.docker.swarm.service.name": "foreign-service",
				},
				Name: "foreign-service.1.task",
			},
			{
				ID: "denied",
				Labels: {
					"com.docker.swarm.service.name": "denied-redis",
				},
				Name: "denied-redis.1.task",
			},
			{
				ID: "unlinked",
				Labels: {},
				Name: "unlinked-container",
			},
		];

		await expect(
			filterContainerResourceStatsByAccess(ctx, stats),
		).resolves.toEqual([stats[0], stats[1], stats[2], stats[3]]);

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"application-allowed",
			{ monitoring: ["read"] },
		);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"compose-allowed",
			{ monitoring: ["read"] },
		);
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalledWith(
			ctx,
			"application-remote",
			expect.anything(),
		);
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalledWith(
			ctx,
			"application-foreign",
			expect.anything(),
		);
	});

	it("finds only requested container stats tied to services with monitoring access", async () => {
		mocks.db.query.applications.findFirst.mockImplementation(async (query) => {
			switch (lookupAppName(query)) {
				case "allowed-service":
					return {
						applicationId: "application-allowed",
						appName: "allowed-service",
						serverId: null,
						environment: environment("org-1"),
					};
				case "foreign-service":
					return {
						applicationId: "application-foreign",
						appName: "foreign-service",
						serverId: null,
						environment: environment("org-2"),
					};
				default:
					return null;
			}
		});

		const stats: Array<{
			Container: string;
			ID: string;
			Labels: Record<string, string>;
			Name: string;
		}> = [
			{
				Container: "allowed",
				ID: "allowed",
				Labels: {
					"com.docker.swarm.service.name": "allowed-service",
				},
				Name: "allowed-service.1.task",
			},
			{
				Container: "foreign",
				ID: "foreign",
				Labels: {
					"com.docker.swarm.service.name": "foreign-service",
				},
				Name: "foreign-service.1.task",
			},
			{
				Container: "unlinked",
				ID: "unlinked",
				Labels: {},
				Name: "unlinked-container",
			},
		];

		await expect(
			findAccessibleContainerResourceStat(ctx, stats, "allowed-service.1.task"),
		).resolves.toBe(stats[0]);
		await expect(
			findAccessibleContainerResourceStat(ctx, stats, "foreign"),
		).resolves.toBeNull();
		await expect(
			findAccessibleContainerResourceStat(ctx, stats, "unlinked"),
		).resolves.toBeNull();

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			ctx,
			"application-allowed",
			{ monitoring: ["read"] },
		);
		expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalledWith(
			ctx,
			"application-foreign",
			expect.anything(),
		);
	});
});
