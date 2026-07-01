import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
	clearOldDeployments: vi.fn(),
	createApplication: vi.fn(),
	createBackup: vi.fn(),
	createCompose: vi.fn(),
	createDomain: vi.fn(),
	createEnvironment: vi.fn(),
	createLibsql: vi.fn(),
	createMariadb: vi.fn(),
	createMongo: vi.fn(),
	createMount: vi.fn(),
	createMysql: vi.fn(),
	createPort: vi.fn(),
	createPostgres: vi.fn(),
	createPreviewDeployment: vi.fn(),
	createProject: vi.fn(),
	createRedirect: vi.fn(),
	createRedis: vi.fn(),
	createSecurity: vi.fn(),
	deleteAllMiddlewares: vi.fn(),
	deleteEnvironment: vi.fn(),
	deleteProject: vi.fn(),
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
	findUserById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getApplicationStats: vi.fn(),
	getContainerLogs: vi.fn(),
	getWebServerSettings: vi.fn(),
	mechanizeDockerContainer: vi.fn(),
	readConfig: vi.fn(),
	readRemoteConfig: vi.fn(),
	removeDeployments: vi.fn(),
	removeDirectoryCode: vi.fn(),
	removeMonitoringDirectory: vi.fn(),
	removeService: vi.fn(),
	removeTraefikConfig: vi.fn(),
	startService: vi.fn(),
	startServiceRemote: vi.fn(),
	stopService: vi.fn(),
	stopServiceRemote: vi.fn(),
	unzipDrop: vi.fn(),
	updateApplication: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateEnvironmentById: vi.fn(),
	updateProjectById: vi.fn(),
	writeConfig: vi.fn(),
	writeConfigRemote: vi.fn(),
}));

const permissionMocks = vi.hoisted(() => ({
	addNewEnvironment: vi.fn(),
	addNewProject: vi.fn(),
	addNewService: vi.fn(),
	checkEnvironmentAccess: vi.fn(),
	checkEnvironmentCreationPermission: vi.fn(),
	checkEnvironmentDeletionPermission: vi.fn(),
	checkPermission: vi.fn(),
	checkProjectAccess: vi.fn(),
	checkServiceAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findMemberByUserId: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
	update: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	updateReturning: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
	audit: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	clearOldDeployments: serverMocks.clearOldDeployments,
	createApplication: serverMocks.createApplication,
	createBackup: serverMocks.createBackup,
	createCompose: serverMocks.createCompose,
	createDomain: serverMocks.createDomain,
	createEnvironment: serverMocks.createEnvironment,
	createLibsql: serverMocks.createLibsql,
	createMariadb: serverMocks.createMariadb,
	createMongo: serverMocks.createMongo,
	createMount: serverMocks.createMount,
	createMysql: serverMocks.createMysql,
	createPort: serverMocks.createPort,
	createPostgres: serverMocks.createPostgres,
	createPreviewDeployment: serverMocks.createPreviewDeployment,
	createProject: serverMocks.createProject,
	createRedirect: serverMocks.createRedirect,
	createRedis: serverMocks.createRedis,
	createSecurity: serverMocks.createSecurity,
	deleteAllMiddlewares: serverMocks.deleteAllMiddlewares,
	deleteEnvironment: serverMocks.deleteEnvironment,
	deleteProject: serverMocks.deleteProject,
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
	findUserById: serverMocks.findUserById,
	getAccessibleServerIds: serverMocks.getAccessibleServerIds,
	getApplicationStats: serverMocks.getApplicationStats,
	getContainerLogs: serverMocks.getContainerLogs,
	getWebServerSettings: serverMocks.getWebServerSettings,
	mechanizeDockerContainer: serverMocks.mechanizeDockerContainer,
	readConfig: serverMocks.readConfig,
	readRemoteConfig: serverMocks.readRemoteConfig,
	removeDeployments: serverMocks.removeDeployments,
	removeDirectoryCode: serverMocks.removeDirectoryCode,
	removeMonitoringDirectory: serverMocks.removeMonitoringDirectory,
	removeService: serverMocks.removeService,
	removeTraefikConfig: serverMocks.removeTraefikConfig,
	startService: serverMocks.startService,
	startServiceRemote: serverMocks.startServiceRemote,
	stopService: serverMocks.stopService,
	stopServiceRemote: serverMocks.stopServiceRemote,
	unzipDrop: serverMocks.unzipDrop,
	updateApplication: serverMocks.updateApplication,
	updateApplicationStatus: serverMocks.updateApplicationStatus,
	updateDeploymentStatus: serverMocks.updateDeploymentStatus,
	updateEnvironmentById: serverMocks.updateEnvironmentById,
	updateProjectById: serverMocks.updateProjectById,
	writeConfig: serverMocks.writeConfig,
	writeConfigRemote: serverMocks.writeConfigRemote,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: dbMocks.update,
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewEnvironment: permissionMocks.addNewEnvironment,
	addNewProject: permissionMocks.addNewProject,
	addNewService: permissionMocks.addNewService,
	checkEnvironmentAccess: permissionMocks.checkEnvironmentAccess,
	checkEnvironmentCreationPermission:
		permissionMocks.checkEnvironmentCreationPermission,
	checkEnvironmentDeletionPermission:
		permissionMocks.checkEnvironmentDeletionPermission,
	checkPermission: permissionMocks.checkPermission,
	checkProjectAccess: permissionMocks.checkProjectAccess,
	checkServiceAccess: permissionMocks.checkServiceAccess,
	checkServicePermissionAndAccess:
		permissionMocks.checkServicePermissionAndAccess,
	findMemberByUserId: permissionMocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/git-provider", () => ({
	canEditDeployGitSource: vi.fn(() => true),
	redactGitProviderSecrets: vi.fn((value) => value),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: auditMocks.audit,
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByApplication: vi.fn(),
	killDockerBuild: vi.fn(),
	myQueue: {
		add: vi.fn(),
		getJob: vi.fn(),
		remove: vi.fn(),
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	cancelDeployment: vi.fn(),
	deploy: vi.fn(),
}));

const { applicationRouter } = await import(
	"../../server/api/routers/application"
);
const { domainRouter } = await import("../../server/api/routers/domain");
const { environmentRouter } = await import(
	"../../server/api/routers/environment"
);
const { projectRouter } = await import("../../server/api/routers/project");

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

const project = (projectId: string, organizationId = "org-1") => ({
	projectId,
	organizationId,
	name: projectId,
	env: "",
	environments: [],
	projectTags: [],
});

const environment = (
	environmentId: string,
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

const application = (
	applicationId: string,
	environmentId = "env-1",
	projectId = "project-1",
	organizationId = "org-1",
) => ({
	applicationId,
	name: applicationId,
	appName: `${applicationId}-slug`,
	environmentId,
	environment: environment(environmentId, projectId, organizationId),
	domains: [],
	mounts: [],
	ports: [],
	previewDeployments: [],
	redirects: [],
	refreshToken: "refresh-token",
	registry: null,
	security: [],
});

describe("project/environment placement ownership boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		permissionMocks.checkEnvironmentAccess.mockResolvedValue(undefined);
		permissionMocks.checkEnvironmentCreationPermission.mockResolvedValue(
			undefined,
		);
		permissionMocks.checkPermission.mockResolvedValue(undefined);
		permissionMocks.checkProjectAccess.mockResolvedValue(undefined);
		permissionMocks.checkServiceAccess.mockResolvedValue(undefined);
		permissionMocks.checkServicePermissionAndAccess.mockResolvedValue(
			undefined,
		);
		permissionMocks.findMemberByUserId.mockResolvedValue({
			role: "owner",
			accessedEnvironments: [],
			accessedProjects: [],
			accessedServices: [],
		});

		serverMocks.createEnvironment.mockResolvedValue(environment("env-new"));
		serverMocks.findEnvironmentById.mockImplementation(
			(environmentId: string) =>
				Promise.resolve(
					environmentId === "env-other"
						? environment("env-other", "project-2", "org-2")
						: environment(environmentId),
				),
		);
		serverMocks.findProjectById.mockImplementation((projectId: string) =>
			Promise.resolve(
				projectId === "project-2"
					? project("project-2", "org-2")
					: project(projectId),
			),
		);
		serverMocks.findApplicationById.mockImplementation(
			(applicationId: string) =>
				Promise.resolve(
					applicationId === "app-other"
						? application("app-other", "env-other", "project-2", "org-2")
						: application(applicationId),
				),
		);
		serverMocks.createApplication.mockResolvedValue(application("app-copy"));
		serverMocks.updateEnvironmentById.mockResolvedValue(environment("env-1"));
		serverMocks.updateProjectById.mockResolvedValue(project("project-1"));
		serverMocks.createProject.mockResolvedValue({
			environment: environment("env-target", "project-target"),
		});

		dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
		dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
		dbMocks.updateWhere.mockReturnValue({
			returning: dbMocks.updateReturning,
		});
		dbMocks.updateReturning.mockResolvedValue([
			{ applicationId: "app-1", appName: "app", environmentId: "env-1" },
		]);
	});

	it("denies environment creation in a project outside the active organization before persistence", async () => {
		await expect(
			environmentRouter.createCaller(createContext()).create({
				name: "staging",
				projectId: "project-2",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(serverMocks.createEnvironment).not.toHaveBeenCalled();
		expect(permissionMocks.addNewEnvironment).not.toHaveBeenCalled();
	});

	it("does not forward projectId mass assignment during environment update", async () => {
		await expect(
			environmentRouter.createCaller(createContext()).update({
				environmentId: "env-1",
				name: "staging",
				projectId: "project-2",
			} as never),
		).resolves.toEqual(environment("env-1"));

		expect(serverMocks.updateEnvironmentById).toHaveBeenCalledWith(
			"env-1",
			expect.not.objectContaining({ projectId: expect.any(String) }),
		);
		expect(permissionMocks.checkEnvironmentAccess).toHaveBeenCalledWith(
			expect.anything(),
			"env-1",
			"update",
		);
	});

	it("denies environment update before persistence without environment.update", async () => {
		permissionMocks.checkEnvironmentAccess.mockRejectedValueOnce(
			new Error("environment update denied"),
		);

		await expect(
			environmentRouter.createCaller(createContext()).update({
				environmentId: "env-1",
				name: "staging",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(serverMocks.findEnvironmentById).not.toHaveBeenCalled();
		expect(serverMocks.updateEnvironmentById).not.toHaveBeenCalled();
	});

	it("does not forward organizationId mass assignment during project update", async () => {
		await expect(
			projectRouter.createCaller(createContext()).update({
				projectId: "project-1",
				name: "renamed",
				organizationId: "org-2",
			} as never),
		).resolves.toEqual(project("project-1"));

		expect(serverMocks.updateProjectById).toHaveBeenCalledWith(
			"project-1",
			expect.not.objectContaining({ organizationId: expect.any(String) }),
		);
		expect(permissionMocks.checkProjectAccess).toHaveBeenCalledWith(
			expect.anything(),
			"update",
			"project-1",
		);
	});

	it("denies project update before persistence without project.update", async () => {
		permissionMocks.checkProjectAccess.mockRejectedValueOnce(
			new Error("project update denied"),
		);

		await expect(
			projectRouter.createCaller(createContext()).update({
				projectId: "project-1",
				name: "renamed",
			}),
		).rejects.toThrow("project update denied");

		expect(serverMocks.updateProjectById).not.toHaveBeenCalled();
	});

	it("denies application moves to a target environment outside the active organization before persistence", async () => {
		await expect(
			applicationRouter.createCaller(createContext()).move({
				applicationId: "app-1",
				targetEnvironmentId: "env-other",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(dbMocks.update).not.toHaveBeenCalled();
		expect(auditMocks.audit).not.toHaveBeenCalled();
	});

	it("keeps same-organization application moves available", async () => {
		await expect(
			applicationRouter.createCaller(createContext()).move({
				applicationId: "app-1",
				targetEnvironmentId: "env-1",
			}),
		).resolves.toMatchObject({
			applicationId: "app-1",
			environmentId: "env-1",
		});

		expect(dbMocks.updateSet).toHaveBeenCalledWith({
			environmentId: "env-1",
		});
	});

	it("denies member application moves to target environments outside their access list", async () => {
		permissionMocks.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedEnvironments: [],
			accessedProjects: ["project-1"],
			accessedServices: ["app-1"],
		});

		await expect(
			applicationRouter.createCaller(createContext("member")).move({
				applicationId: "app-1",
				targetEnvironmentId: "env-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(dbMocks.update).not.toHaveBeenCalled();
	});

	it("denies application domain creation when domainType is omitted before persistence", async () => {
		permissionMocks.checkServicePermissionAndAccess.mockRejectedValueOnce(
			new Error("service access denied"),
		);

		await expect(
			domainRouter.createCaller(createContext()).create({
				applicationId: "app-1",
				host: "app.example.com",
				https: false,
				path: "/",
				port: 3000,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "app-1", { domain: ["create"] });
		expect(serverMocks.createDomain).not.toHaveBeenCalled();
	});

	it("denies compose domain creation when domainType is omitted before persistence", async () => {
		permissionMocks.checkServicePermissionAndAccess.mockRejectedValueOnce(
			new Error("service access denied"),
		);

		await expect(
			domainRouter.createCaller(createContext()).create({
				composeId: "compose-1",
				host: "compose.example.com",
				https: false,
				path: "/",
				port: 3000,
				serviceName: "web",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "compose-1", {
			domain: ["create"],
		});
		expect(serverMocks.createDomain).not.toHaveBeenCalled();
	});

	it("keeps application domain creation available when domainType is omitted after access check", async () => {
		serverMocks.createDomain.mockResolvedValueOnce({
			domainId: "domain-1",
			host: "app.example.com",
		});

		await expect(
			domainRouter.createCaller(createContext()).create({
				applicationId: "app-1",
				host: "app.example.com",
				https: false,
				path: "/",
				port: 3000,
			}),
		).resolves.toMatchObject({ domainId: "domain-1" });

		expect(
			permissionMocks.checkServicePermissionAndAccess,
		).toHaveBeenCalledWith(expect.anything(), "app-1", { domain: ["create"] });
		expect(serverMocks.createDomain).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "app-1",
				host: "app.example.com",
			}),
		);
	});

	it("denies project duplicate selected services outside the source environment before clone persistence", async () => {
		await expect(
			projectRouter.createCaller(createContext()).duplicate({
				sourceEnvironmentId: "env-1",
				name: "duplicate",
				includeServices: true,
				selectedServices: [{ id: "app-other", type: "application" }],
				duplicateInSameProject: false,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(serverMocks.createProject).not.toHaveBeenCalled();
		expect(serverMocks.createApplication).not.toHaveBeenCalled();
		expect(permissionMocks.addNewProject).not.toHaveBeenCalled();
	});

	it("keeps project duplicate available for selected services from the source environment", async () => {
		await expect(
			projectRouter.createCaller(createContext()).duplicate({
				sourceEnvironmentId: "env-1",
				name: "duplicate",
				includeServices: true,
				selectedServices: [{ id: "app-1", type: "application" }],
				duplicateInSameProject: false,
			}),
		).resolves.toMatchObject({ environmentId: "env-target" });

		expect(serverMocks.createApplication).toHaveBeenCalledWith(
			expect.objectContaining({
				appName: "app-1",
				environmentId: "env-target",
			}),
		);
	});
});
