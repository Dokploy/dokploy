import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
	duplicateEnvironment: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findEnvironmentById: vi.fn(),
	findEnvironmentsByProjectId: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findProjectById: vi.fn(),
	findRedisById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
}));

const permissionMocks = vi.hoisted(() => ({
	checkEnvironmentAccess: vi.fn(),
	checkEnvironmentCreationPermission: vi.fn(),
	checkEnvironmentDeletionPermission: vi.fn(),
	checkPermission: vi.fn(),
	findMemberByUserId: vi.fn(),
	hasPermission: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
	audit: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
	select: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	createEnvironment: vi.fn(),
	deleteEnvironment: vi.fn(),
	duplicateEnvironment: serverMocks.duplicateEnvironment,
	findApplicationById: serverMocks.findApplicationById,
	findComposeById: serverMocks.findComposeById,
	findEnvironmentById: serverMocks.findEnvironmentById,
	findEnvironmentsByProjectId: serverMocks.findEnvironmentsByProjectId,
	findLibsqlById: serverMocks.findLibsqlById,
	findMariadbById: serverMocks.findMariadbById,
	findMongoById: serverMocks.findMongoById,
	findMySqlById: serverMocks.findMySqlById,
	findPostgresById: serverMocks.findPostgresById,
	findProjectById: serverMocks.findProjectById,
	findRedisById: serverMocks.findRedisById,
	getAccessibleServerIds: serverMocks.getAccessibleServerIds,
	updateEnvironmentById: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: dbMocks,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewEnvironment: vi.fn(),
	checkEnvironmentAccess: permissionMocks.checkEnvironmentAccess,
	checkEnvironmentCreationPermission:
		permissionMocks.checkEnvironmentCreationPermission,
	checkEnvironmentDeletionPermission:
		permissionMocks.checkEnvironmentDeletionPermission,
	checkPermission: permissionMocks.checkPermission,
	findMemberByUserId: permissionMocks.findMemberByUserId,
	hasPermission: permissionMocks.hasPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: auditMocks.audit,
}));

const { environmentRouter } = await import(
	"../../server/api/routers/environment"
);

const createContext = (role: "owner" | "admin" | "member" = "owner") =>
	({
		db: {},
		req: {},
		res: {},
		session: {
			id: "session-1",
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			ownerId: "user-1",
			role,
		},
	}) as never;

const project = (projectId = "project-1", organizationId = "org-1") => ({
	projectId,
	organizationId,
	name: projectId,
	env: "PROJECT_SECRET=secret",
});

const application = () => ({
	applicationId: "app-1",
	name: "app",
	appName: "app-one",
	env: "APP_SECRET=secret",
	previewEnv: "PREVIEW_SECRET=secret",
	buildSecrets: "BUILD_SECRET=secret",
	previewBuildSecrets: "PREVIEW_BUILD_SECRET=secret",
	refreshToken: "app-refresh-token",
	password: "docker-password",
	customGitUrl: "https://git-token@example.com/org/private.git",
});

const compose = () => ({
	composeId: "compose-1",
	name: "compose",
	appName: "compose-one",
	env: "COMPOSE_SECRET=secret",
	composeFile:
		"services:\n  db:\n    environment:\n      POSTGRES_PASSWORD: compose-secret",
	refreshToken: "compose-refresh-token",
	customGitUrl: "https://compose-token@example.com/org/private.git",
});

const databaseService = (idField: string, id: string) => ({
	[idField]: id,
	name: id,
	env: "DB_SECRET=secret",
	databasePassword: "database-password",
	databaseRootPassword: "database-root-password",
});

const environment = () => ({
	environmentId: "env-1",
	name: "production",
	description: null,
	isDefault: false,
	projectId: "project-1",
	env: "ENV_SECRET=secret",
	applications: [application()],
	compose: [compose()],
	libsql: [databaseService("libsqlId", "libsql-1")],
	mariadb: [databaseService("mariadbId", "mariadb-1")],
	mongo: [databaseService("mongoId", "mongo-1")],
	mysql: [databaseService("mysqlId", "mysql-1")],
	postgres: [databaseService("postgresId", "postgres-1")],
	redis: [databaseService("redisId", "redis-1")],
	project: project(),
});

const createSelectBuilder = (result: unknown[]) => {
	const offset = vi.fn().mockResolvedValue(result);
	const limit = vi.fn(() => ({ offset }));
	const orderBy = vi.fn(() => ({ limit }));
	const where = vi.fn(() => ({ orderBy }));
	const innerJoin = vi.fn(() => ({ innerJoin, where }));
	const from = vi.fn(() => ({ innerJoin }));

	return { from };
};

const createCountBuilder = (result: unknown[]) => {
	const where = vi.fn().mockResolvedValue(result);
	const innerJoin = vi.fn(() => ({ innerJoin, where }));
	const from = vi.fn(() => ({ innerJoin }));

	return { from };
};

const mockSearchRows = (items: unknown[], count = items.length) => {
	dbMocks.select.mockImplementation((selection: Record<string, unknown>) =>
		"count" in selection
			? createCountBuilder([{ count }])
			: createSelectBuilder(items),
	);
};

describe("environment secret boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		permissionMocks.checkEnvironmentAccess.mockResolvedValue(undefined);
		permissionMocks.checkEnvironmentCreationPermission.mockResolvedValue(
			undefined,
		);
		permissionMocks.checkPermission.mockResolvedValue(undefined);
		permissionMocks.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedEnvironments: ["env-1"],
			accessedProjects: ["project-1"],
			accessedServices: [
				"app-1",
				"compose-1",
				"libsql-1",
				"mariadb-1",
				"mongo-1",
				"mysql-1",
				"postgres-1",
				"redis-1",
			],
		});
		permissionMocks.hasPermission.mockResolvedValue(false);
		serverMocks.findEnvironmentById.mockResolvedValue(environment());
		serverMocks.findEnvironmentsByProjectId.mockResolvedValue([environment()]);
		serverMocks.duplicateEnvironment.mockResolvedValue({
			environmentId: "env-copy",
			name: "copy",
			projectId: "project-1",
			env: "ENV_SECRET=secret",
		});
		mockSearchRows([
			{
				environmentId: "env-1",
				name: "production",
				description: null,
				createdAt: "2026-06-25T00:00:00.000Z",
				env: "ENV_SECRET=secret",
				projectId: "project-1",
				isDefault: false,
			},
		]);
	});

	it("redacts environment env from one when the member lacks environmentEnvVars read", async () => {
		const result = await environmentRouter
			.createCaller(createContext("member"))
			.one({ environmentId: "env-1" });

		expect(permissionMocks.hasPermission).toHaveBeenCalledWith(
			expect.anything(),
			{ environmentEnvVars: ["read"] },
		);
		expect(result.env).toBe(REDACTED_SECRET_VALUE);
		expect(result.project.env).toBe(REDACTED_SECRET_VALUE);
	});

	it("keeps environment env from one when environmentEnvVars read is granted", async () => {
		permissionMocks.hasPermission.mockResolvedValueOnce(true);

		const result = await environmentRouter
			.createCaller(createContext("member"))
			.one({ environmentId: "env-1" });

		expect(result.env).toBe("ENV_SECRET=secret");
	});

	it("redacts environment env from search results without environmentEnvVars read", async () => {
		const result = await environmentRouter
			.createCaller(createContext("member"))
			.search({ projectId: "project-1" });

		expect(result.items[0]?.env).toBe(REDACTED_SECRET_VALUE);
	});

	it("redacts service secrets from byProjectId environment selector responses", async () => {
		const [result] = await environmentRouter
			.createCaller(createContext("owner"))
			.byProjectId({ projectId: "project-1" });

		expect(result.applications[0]).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			previewEnv: REDACTED_SECRET_VALUE,
			buildSecrets: REDACTED_SECRET_VALUE,
			previewBuildSecrets: REDACTED_SECRET_VALUE,
			refreshToken: REDACTED_SECRET_VALUE,
			password: REDACTED_SECRET_VALUE,
			customGitUrl: `https://${REDACTED_SECRET_VALUE}@example.com/org/private.git`,
		});
		expect(result.compose[0]).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			composeFile: REDACTED_SECRET_VALUE,
			refreshToken: REDACTED_SECRET_VALUE,
			customGitUrl: `https://${REDACTED_SECRET_VALUE}@example.com/org/private.git`,
		});
		expect(result.postgres[0]).toMatchObject({
			env: REDACTED_SECRET_VALUE,
			databasePassword: REDACTED_SECRET_VALUE,
			databaseRootPassword: REDACTED_SECRET_VALUE,
		});
		expect(result.project.env).toBe(REDACTED_SECRET_VALUE);
	});

	it("denies duplicate before persistence when environment create permission is missing", async () => {
		permissionMocks.checkEnvironmentCreationPermission.mockRejectedValueOnce(
			new TRPCError({
				code: "UNAUTHORIZED",
				message: "Permission denied",
			}),
		);

		await expect(
			environmentRouter.createCaller(createContext("member")).duplicate({
				environmentId: "env-1",
				name: "copy",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(serverMocks.duplicateEnvironment).not.toHaveBeenCalled();
	});

	it("denies duplicate before persistence without environmentEnvVars read and write", async () => {
		permissionMocks.checkPermission.mockRejectedValueOnce(
			new TRPCError({
				code: "UNAUTHORIZED",
				message: "Permission denied",
			}),
		);

		await expect(
			environmentRouter.createCaller(createContext("member")).duplicate({
				environmentId: "env-1",
				name: "copy",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
			expect.anything(),
			{ environmentEnvVars: ["read", "write"] },
		);
		expect(serverMocks.duplicateEnvironment).not.toHaveBeenCalled();
	});

	it("keeps duplicate available when create and environmentEnvVars read and write are granted", async () => {
		await expect(
			environmentRouter.createCaller(createContext("member")).duplicate({
				environmentId: "env-1",
				name: "copy",
			}),
		).resolves.toMatchObject({
			environmentId: "env-copy",
			env: "ENV_SECRET=secret",
		});

		expect(
			permissionMocks.checkEnvironmentCreationPermission,
		).toHaveBeenCalledWith(expect.anything(), "project-1");
		expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
			expect.anything(),
			{ environmentEnvVars: ["read", "write"] },
		);
		expect(serverMocks.duplicateEnvironment).toHaveBeenCalledWith({
			environmentId: "env-1",
			name: "copy",
		});
	});
});
