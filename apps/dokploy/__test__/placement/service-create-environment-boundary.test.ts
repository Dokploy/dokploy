import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
	addDomainToCompose: vi.fn(),
	checkPortInUse: vi.fn(),
	clearOldDeployments: vi.fn(),
	cloneCompose: vi.fn(),
	createApplication: vi.fn(),
	createCommand: vi.fn(),
	createCompose: vi.fn(),
	createComposeByTemplate: vi.fn(),
	createDomain: vi.fn(),
	createMariadb: vi.fn(),
	createMongo: vi.fn(),
	createMount: vi.fn(),
	createMysql: vi.fn(),
	createPostgres: vi.fn(),
	createRedis: vi.fn(),
	deleteAllMiddlewares: vi.fn(),
	deleteMount: vi.fn(),
	deployMariadb: vi.fn(),
	deployMongo: vi.fn(),
	deployMySql: vi.fn(),
	deployPostgres: vi.fn(),
	deployRedis: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findApplicationById: vi.fn(),
	findBackupsByDbId: vi.fn(),
	findComposeById: vi.fn(),
	findDomainsByComposeId: vi.fn(),
	findEnvironmentById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findProjectById: vi.fn(),
	findRedisById: vi.fn(),
	findServerById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getApplicationStats: vi.fn(),
	getComposeContainer: vi.fn(),
	getContainerLogs: vi.fn(),
	getMountPath: vi.fn(),
	getServiceContainerCommand: vi.fn(),
	getWebServerSettings: vi.fn(),
	loadServices: vi.fn(),
	mechanizeDockerContainer: vi.fn(),
	randomizeComposeFile: vi.fn(),
	randomizeIsolatedDeploymentComposeFile: vi.fn(),
	readConfig: vi.fn(),
	readRemoteConfig: vi.fn(),
	rebuildDatabase: vi.fn(),
	removeApplicationService: vi.fn(),
	removeCompose: vi.fn(),
	removeComposeDirectory: vi.fn(),
	removeDeployments: vi.fn(),
	removeDeploymentsByComposeId: vi.fn(),
	removeDirectoryCode: vi.fn(),
	removeDomainById: vi.fn(),
	removeMariadbById: vi.fn(),
	removeMonitoringDirectory: vi.fn(),
	removeMongoById: vi.fn(),
	removeMySqlById: vi.fn(),
	removePostgresById: vi.fn(),
	removeRedisById: vi.fn(),
	removeService: vi.fn(),
	removeTraefikConfig: vi.fn(),
	startCompose: vi.fn(),
	startService: vi.fn(),
	startServiceRemote: vi.fn(),
	stopCompose: vi.fn(),
	stopService: vi.fn(),
	stopServiceRemote: vi.fn(),
	updateApplication: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateMariadbById: vi.fn(),
	updateMongoById: vi.fn(),
	updateMySqlById: vi.fn(),
	updatePostgresById: vi.fn(),
	updateRedisById: vi.fn(),
	writeConfig: vi.fn(),
	writeConfigRemote: vi.fn(),
}));

const permissionMocks = vi.hoisted(() => ({
	addNewService: vi.fn(),
	checkPermission: vi.fn(),
	checkServiceAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findMemberByUserId: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
	audit: vi.fn(),
}));

const backupMocks = vi.hoisted(() => ({
	cancelJobs: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
	cleanQueuesByApplication: vi.fn(),
	cleanQueuesByCompose: vi.fn(),
	killDockerBuild: vi.fn(),
	myQueue: {
		add: vi.fn(),
		getJob: vi.fn(),
		remove: vi.fn(),
	},
}));

const templateMocks = vi.hoisted(() => ({
	fetchTemplateFiles: vi.fn(),
	fetchTemplatesList: vi.fn(),
	processTemplate: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	addDomainToCompose: serverMocks.addDomainToCompose,
	checkPortInUse: serverMocks.checkPortInUse,
	clearOldDeployments: serverMocks.clearOldDeployments,
	cloneCompose: serverMocks.cloneCompose,
	createApplication: serverMocks.createApplication,
	createCommand: serverMocks.createCommand,
	createCompose: serverMocks.createCompose,
	createComposeByTemplate: serverMocks.createComposeByTemplate,
	createDomain: serverMocks.createDomain,
	createMariadb: serverMocks.createMariadb,
	createMongo: serverMocks.createMongo,
	createMount: serverMocks.createMount,
	createMysql: serverMocks.createMysql,
	createPostgres: serverMocks.createPostgres,
	createRedis: serverMocks.createRedis,
	deleteAllMiddlewares: serverMocks.deleteAllMiddlewares,
	deleteMount: serverMocks.deleteMount,
	deployMariadb: serverMocks.deployMariadb,
	deployMongo: serverMocks.deployMongo,
	deployMySql: serverMocks.deployMySql,
	deployPostgres: serverMocks.deployPostgres,
	deployRedis: serverMocks.deployRedis,
	execAsync: serverMocks.execAsync,
	execAsyncRemote: serverMocks.execAsyncRemote,
	findApplicationById: serverMocks.findApplicationById,
	findBackupsByDbId: serverMocks.findBackupsByDbId,
	findComposeById: serverMocks.findComposeById,
	findDomainsByComposeId: serverMocks.findDomainsByComposeId,
	findEnvironmentById: serverMocks.findEnvironmentById,
	findLibsqlById: serverMocks.findLibsqlById,
	findMariadbById: serverMocks.findMariadbById,
	findMongoById: serverMocks.findMongoById,
	findMySqlById: serverMocks.findMySqlById,
	findPostgresById: serverMocks.findPostgresById,
	findProjectById: serverMocks.findProjectById,
	findRedisById: serverMocks.findRedisById,
	findServerById: serverMocks.findServerById,
	getAccessibleServerIds: serverMocks.getAccessibleServerIds,
	getApplicationStats: serverMocks.getApplicationStats,
	getComposeContainer: serverMocks.getComposeContainer,
	getContainerLogs: serverMocks.getContainerLogs,
	getMountPath: serverMocks.getMountPath,
	getServiceContainerCommand: serverMocks.getServiceContainerCommand,
	getWebServerSettings: serverMocks.getWebServerSettings,
	loadServices: serverMocks.loadServices,
	mechanizeDockerContainer: serverMocks.mechanizeDockerContainer,
	randomizeComposeFile: serverMocks.randomizeComposeFile,
	randomizeIsolatedDeploymentComposeFile:
		serverMocks.randomizeIsolatedDeploymentComposeFile,
	readConfig: serverMocks.readConfig,
	readRemoteConfig: serverMocks.readRemoteConfig,
	rebuildDatabase: serverMocks.rebuildDatabase,
	removeCompose: serverMocks.removeCompose,
	removeComposeDirectory: serverMocks.removeComposeDirectory,
	removeDeployments: serverMocks.removeDeployments,
	removeDeploymentsByComposeId: serverMocks.removeDeploymentsByComposeId,
	removeDirectoryCode: serverMocks.removeDirectoryCode,
	removeDomainById: serverMocks.removeDomainById,
	removeMariadbById: serverMocks.removeMariadbById,
	removeMonitoringDirectory: serverMocks.removeMonitoringDirectory,
	removeMongoById: serverMocks.removeMongoById,
	removeMySqlById: serverMocks.removeMySqlById,
	removePostgresById: serverMocks.removePostgresById,
	removeRedisById: serverMocks.removeRedisById,
	removeService: serverMocks.removeService,
	removeTraefikConfig: serverMocks.removeTraefikConfig,
	startCompose: serverMocks.startCompose,
	startService: serverMocks.startService,
	startServiceRemote: serverMocks.startServiceRemote,
	stopCompose: serverMocks.stopCompose,
	stopService: serverMocks.stopService,
	stopServiceRemote: serverMocks.stopServiceRemote,
	updateApplication: serverMocks.updateApplication,
	updateApplicationStatus: serverMocks.updateApplicationStatus,
	updateCompose: serverMocks.updateCompose,
	updateDeploymentStatus: serverMocks.updateDeploymentStatus,
	updateMariadbById: serverMocks.updateMariadbById,
	updateMongoById: serverMocks.updateMongoById,
	updateMySqlById: serverMocks.updateMySqlById,
	updatePostgresById: serverMocks.updatePostgresById,
	updateRedisById: serverMocks.updateRedisById,
	writeConfig: serverMocks.writeConfig,
	writeConfigRemote: serverMocks.writeConfigRemote,
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	...serverMocks,
	removeService: serverMocks.removeService,
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {},
		select: vi.fn(),
		update: vi.fn(),
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewService: permissionMocks.addNewService,
	checkPermission: permissionMocks.checkPermission,
	checkServiceAccess: permissionMocks.checkServiceAccess,
	checkServicePermissionAndAccess:
		permissionMocks.checkServicePermissionAndAccess,
	findMemberByUserId: permissionMocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/git-provider", () => ({
	canEditDeployGitSource: vi.fn(() => true),
	redactGitProviderSecrets: vi.fn((value) => value),
}));

vi.mock("@dokploy/server/services/compose", () => ({
	createComposeByTemplate: serverMocks.createComposeByTemplate,
}));

vi.mock("@dokploy/server/templates/github", () => ({
	fetchTemplateFiles: templateMocks.fetchTemplateFiles,
	fetchTemplatesList: templateMocks.fetchTemplatesList,
}));

vi.mock("@dokploy/server/templates/processors", () => ({
	processTemplate: templateMocks.processTemplate,
}));

vi.mock("@dokploy/server/utils/providers/git", () => ({
	assertCustomGitUrlAllowed: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: auditMocks.audit,
}));

vi.mock("@/server/queues/queueSetup", () => queueMocks);

vi.mock("@/server/utils/backup", () => ({
	cancelJobs: backupMocks.cancelJobs,
}));

vi.mock("@/server/utils/deploy", () => ({
	cancelDeployment: vi.fn(),
	deploy: vi.fn(),
}));

const { applicationRouter } = await import(
	"../../server/api/routers/application"
);
const { composeRouter } = await import("../../server/api/routers/compose");
const { mariadbRouter } = await import("../../server/api/routers/mariadb");
const { mongoRouter } = await import("../../server/api/routers/mongo");
const { mysqlRouter } = await import("../../server/api/routers/mysql");
const { postgresRouter } = await import("../../server/api/routers/postgres");
const { redisRouter } = await import("../../server/api/routers/redis");

const createContext = (role: "owner" | "admin" | "member" = "member") =>
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
	env: "",
	environments: [],
	projectTags: [],
});

const environment = (
	environmentId = "env-target",
	projectId = "project-1",
	organizationId = "org-1",
) => ({
	environmentId,
	name: environmentId,
	description: null,
	isDefault: false,
	projectId,
	env: "",
	applications: [],
	compose: [],
	libsql: [],
	mariadb: [],
	mongo: [],
	mysql: [],
	postgres: [],
	redis: [],
	project: project(projectId, organizationId),
});

const baseService = (id: string) => ({
	appName: id,
	description: null,
	environmentId: "env-target",
	serverId: null,
});

const applicationInput = {
	name: "app",
	appName: "app",
	description: null,
	environmentId: "env-target",
	serverId: null,
};

const composeInput = {
	name: "compose",
	appName: "compose",
	description: null,
	environmentId: "env-target",
	composeType: "docker-compose" as const,
	serverId: null,
	composeFile: "services: {}",
};

const templateImportInput = {
	composeId: "compose-1",
	base64: Buffer.from(
		JSON.stringify({
			compose: "services:\n  app:\n    image: nginx",
			config: [
				"[metadata]",
				'id = "template"',
				'name = "Template"',
				'description = "Template"',
				"tags = []",
				'version = "1.0.0"',
				'logo = ""',
				"[metadata.links]",
				'github = "https://example.com"',
				"[variables]",
				"[config]",
				"isolated = true",
				"domains = []",
				"mounts = []",
				"env = {}",
			].join("\n"),
		}),
	).toString("base64"),
};

const databaseInput = {
	name: "database",
	appName: "database",
	description: null,
	environmentId: "env-target",
	dockerImage: "image:latest",
	databaseName: "app",
	databaseUser: "app",
	databasePassword: "password",
	serverId: null,
};

const databaseRootInput = {
	...databaseInput,
	databaseRootPassword: "root-password",
};

const createCases = () => [
	{
		label: "application.create",
		call: () =>
			applicationRouter.createCaller(createContext()).create(applicationInput),
		persistMock: serverMocks.createApplication,
	},
	{
		label: "compose.create",
		call: () =>
			composeRouter.createCaller(createContext()).create(composeInput),
		persistMock: serverMocks.createCompose,
	},
	{
		label: "mariadb.create",
		call: () =>
			mariadbRouter.createCaller(createContext()).create(databaseRootInput),
		persistMock: serverMocks.createMariadb,
	},
	{
		label: "mongo.create",
		call: () =>
			mongoRouter
				.createCaller(createContext())
				.create({ ...databaseInput, replicaSets: false }),
		persistMock: serverMocks.createMongo,
	},
	{
		label: "mysql.create",
		call: () =>
			mysqlRouter.createCaller(createContext()).create(databaseRootInput),
		persistMock: serverMocks.createMysql,
	},
	{
		label: "postgres.create",
		call: () =>
			postgresRouter.createCaller(createContext()).create(databaseInput),
		persistMock: serverMocks.createPostgres,
	},
	{
		label: "redis.create",
		call: () =>
			redisRouter.createCaller(createContext()).create({
				name: "redis",
				appName: "redis",
				description: null,
				environmentId: "env-target",
				dockerImage: "redis:latest",
				databasePassword: "password",
				serverId: null,
			}),
		persistMock: serverMocks.createRedis,
	},
];

describe("service create target environment access boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		permissionMocks.addNewService.mockResolvedValue(undefined);
		permissionMocks.checkPermission.mockResolvedValue(undefined);
		permissionMocks.checkServiceAccess.mockResolvedValue(undefined);
		permissionMocks.checkServicePermissionAndAccess.mockResolvedValue(
			undefined,
		);
		permissionMocks.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedProjects: ["project-1"],
			accessedEnvironments: [],
			accessedServices: [],
		});

		serverMocks.findEnvironmentById.mockResolvedValue(environment());
		serverMocks.findProjectById.mockResolvedValue(project());
		serverMocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		serverMocks.getMountPath.mockReturnValue("/var/lib/postgresql/data");
		serverMocks.getWebServerSettings.mockResolvedValue({
			remoteServersOnly: false,
		});
		serverMocks.createMount.mockResolvedValue({});
		serverMocks.findComposeById.mockResolvedValue({
			...baseService("compose-1"),
			composeId: "compose-1",
			name: "compose",
			domains: [],
			mounts: [],
			environment: environment(),
		});
		serverMocks.updateCompose.mockResolvedValue({
			...baseService("compose-1"),
			composeId: "compose-1",
		});
		templateMocks.processTemplate.mockReturnValue({
			domains: [],
			envs: [],
			mounts: [],
		});

		serverMocks.createApplication.mockResolvedValue({
			...baseService("app-created"),
			applicationId: "app-created",
		});
		serverMocks.createCompose.mockResolvedValue({
			...baseService("compose-created"),
			composeId: "compose-created",
		});
		serverMocks.createMariadb.mockResolvedValue({
			...baseService("mariadb-created"),
			mariadbId: "mariadb-created",
		});
		serverMocks.createMongo.mockResolvedValue({
			...baseService("mongo-created"),
			mongoId: "mongo-created",
		});
		serverMocks.createMysql.mockResolvedValue({
			...baseService("mysql-created"),
			mysqlId: "mysql-created",
		});
		serverMocks.createPostgres.mockResolvedValue({
			...baseService("postgres-created"),
			postgresId: "postgres-created",
		});
		serverMocks.createRedis.mockResolvedValue({
			...baseService("redis-created"),
			redisId: "redis-created",
		});
	});

	it.each(createCases())(
		"denies $label before persistence when the caller lacks target environment access",
		async ({ call, persistMock }) => {
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

			expect(persistMock).not.toHaveBeenCalled();
			expect(permissionMocks.addNewService).not.toHaveBeenCalled();
		},
	);

	it.each(createCases())(
		"keeps $label available when the caller has target environment access",
		async ({ call, persistMock }) => {
			permissionMocks.findMemberByUserId.mockResolvedValue({
				role: "member",
				accessedProjects: ["project-1"],
				accessedEnvironments: ["env-target"],
				accessedServices: [],
			});

			await expect(call()).resolves.toEqual(expect.any(Object));

			expect(persistMock).toHaveBeenCalled();
			expect(permissionMocks.addNewService).toHaveBeenCalled();
		},
	);

	it("denies compose template import side effects without domain or volume create permission", async () => {
		permissionMocks.checkServicePermissionAndAccess.mockImplementation(
			async (_ctx, _serviceId, permissions) => {
				if ("domain" in permissions || "volume" in permissions) {
					throw new Error("Permission denied");
				}
			},
		);
		templateMocks.processTemplate.mockReturnValue({
			domains: [
				{
					host: "app.example.com",
					port: 3000,
					serviceName: "app",
				},
			],
			envs: [],
			mounts: [
				{
					filePath: "/etc/app/config.yaml",
					content: "debug: false",
				},
			],
		});

		await expect(
			composeRouter.createCaller(createContext()).import(templateImportInput),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			service: ["create"],
		});
		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			volume: ["create"],
		});
		expect(serverMocks.updateCompose).not.toHaveBeenCalled();
		expect(serverMocks.createDomain).not.toHaveBeenCalled();
		expect(serverMocks.createMount).not.toHaveBeenCalled();
	});

	it("checks side-effect permissions before importing compose template domains and mounts", async () => {
		templateMocks.processTemplate.mockReturnValue({
			domains: [
				{
					host: "app.example.com",
					port: 3000,
					serviceName: "app",
				},
			],
			envs: ["APP_ENV=production"],
			mounts: [
				{
					filePath: "/etc/app/config.yaml",
					content: "debug: false",
				},
			],
		});

		await expect(
			composeRouter.createCaller(createContext()).import(templateImportInput),
		).resolves.toMatchObject({ success: true });

		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			service: ["create"],
		});
		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			volume: ["create"],
		});
		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			domain: ["create"],
		});
		expect(serverMocks.updateCompose).toHaveBeenCalledWith("compose-1", {
			composeFile: "services:\n  app:\n    image: nginx",
			sourceType: "raw",
			env: "APP_ENV=production",
			isolatedDeployment: true,
		});
		expect(serverMocks.createMount).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "debug: false",
				filePath: "/etc/app/config.yaml",
				serviceId: "compose-1",
				serviceType: "compose",
				type: "file",
			}),
		);
		expect(serverMocks.createDomain).toHaveBeenCalledWith(
			expect.objectContaining({
				composeId: "compose-1",
				domainType: "compose",
				host: "app.example.com",
			}),
		);
	});

	it("denies compose template import deletion side effects without delete permissions", async () => {
		serverMocks.findComposeById.mockResolvedValue({
			...baseService("compose-1"),
			composeId: "compose-1",
			name: "compose",
			domains: [
				{
					domainId: "domain-1",
				},
			],
			mounts: [
				{
					mountId: "mount-1",
				},
			],
			environment: environment(),
		});
		permissionMocks.checkServicePermissionAndAccess.mockImplementation(
			async (_ctx, _serviceId, permissions) => {
				if ("volume" in permissions || "domain" in permissions) {
					throw new Error("Permission denied");
				}
			},
		);

		await expect(
			composeRouter.createCaller(createContext()).import(templateImportInput),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			volume: ["delete"],
		});
		expect(serverMocks.deleteMount).not.toHaveBeenCalled();
		expect(serverMocks.removeDomainById).not.toHaveBeenCalled();
		expect(serverMocks.updateCompose).not.toHaveBeenCalled();
	});

	it("preserves compose template import permission errors without wrapping them as bad requests", async () => {
		permissionMocks.checkServicePermissionAndAccess.mockImplementation(
			async (_ctx, _serviceId, permissions) => {
				if ("volume" in permissions) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Missing volume permission",
					});
				}
			},
		);
		templateMocks.processTemplate.mockReturnValue({
			domains: [],
			envs: [],
			mounts: [
				{
					filePath: "/etc/app/config.yaml",
					content: "debug: false",
				},
			],
		});

		await expect(
			composeRouter.createCaller(createContext()).import(templateImportInput),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Missing volume permission",
		});

		expect(serverMocks.updateCompose).not.toHaveBeenCalled();
		expect(serverMocks.createMount).not.toHaveBeenCalled();
	});
});
