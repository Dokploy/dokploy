import { REDACTED_SECRET_VALUE } from "@dokploy/server/utils/security/redaction";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
	addDomainToCompose: vi.fn(),
	clearOldDeployments: vi.fn(),
	cloneCompose: vi.fn(),
	createCommand: vi.fn(),
	createCompose: vi.fn(),
	createComposeByTemplate: vi.fn(),
	createDomain: vi.fn(),
	createMount: vi.fn(),
	deleteMount: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findComposeById: vi.fn(),
	findDomainsByComposeId: vi.fn(),
	findApplicationById: vi.fn(),
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
	getComposeContainer: vi.fn(),
	getContainerLogs: vi.fn(),
	getWebServerSettings: vi.fn(),
	loadServices: vi.fn(),
	randomizeComposeFile: vi.fn(),
	randomizeIsolatedDeploymentComposeFile: vi.fn(),
	removeCompose: vi.fn(),
	removeComposeDirectory: vi.fn(),
	removeDeploymentsByComposeId: vi.fn(),
	removeDomainById: vi.fn(),
	startCompose: vi.fn(),
	stopCompose: vi.fn(),
	updateCompose: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

const permissionMocks = vi.hoisted(() => ({
	addNewService: vi.fn(),
	checkPermission: vi.fn(),
	checkServiceAccess: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findMemberByUserId: vi.fn(),
}));

const templateMocks = vi.hoisted(() => ({
	fetchTemplateFiles: vi.fn(),
	fetchTemplatesList: vi.fn(),
	processTemplate: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
	audit: vi.fn(),
}));

const aiServiceMocks = vi.hoisted(() => ({
	deleteAiSettings: vi.fn(),
	getAiSettingById: vi.fn(),
	getAiSettingsByOrganizationId: vi.fn(),
	saveAiSettings: vi.fn(),
	suggestVariants: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	addDomainToCompose: serverMocks.addDomainToCompose,
	clearOldDeployments: serverMocks.clearOldDeployments,
	cloneCompose: serverMocks.cloneCompose,
	createCommand: serverMocks.createCommand,
	createCompose: serverMocks.createCompose,
	createComposeByTemplate: serverMocks.createComposeByTemplate,
	createDomain: serverMocks.createDomain,
	createMount: serverMocks.createMount,
	deleteMount: serverMocks.deleteMount,
	execAsync: serverMocks.execAsync,
	execAsyncRemote: serverMocks.execAsyncRemote,
	findComposeById: serverMocks.findComposeById,
	findDomainsByComposeId: serverMocks.findDomainsByComposeId,
	findApplicationById: serverMocks.findApplicationById,
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
	getComposeContainer: serverMocks.getComposeContainer,
	getContainerLogs: serverMocks.getContainerLogs,
	getWebServerSettings: serverMocks.getWebServerSettings,
	loadServices: serverMocks.loadServices,
	randomizeComposeFile: serverMocks.randomizeComposeFile,
	randomizeIsolatedDeploymentComposeFile:
		serverMocks.randomizeIsolatedDeploymentComposeFile,
	removeCompose: serverMocks.removeCompose,
	removeComposeDirectory: serverMocks.removeComposeDirectory,
	removeDeploymentsByComposeId: serverMocks.removeDeploymentsByComposeId,
	removeDomainById: serverMocks.removeDomainById,
	startCompose: serverMocks.startCompose,
	stopCompose: serverMocks.stopCompose,
	updateCompose: serverMocks.updateCompose,
	updateDeploymentStatus: serverMocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	addDomainToCompose: serverMocks.addDomainToCompose,
	clearOldDeployments: serverMocks.clearOldDeployments,
	cloneCompose: serverMocks.cloneCompose,
	createCommand: serverMocks.createCommand,
	createCompose: serverMocks.createCompose,
	createComposeByTemplate: serverMocks.createComposeByTemplate,
	createDomain: serverMocks.createDomain,
	createMount: serverMocks.createMount,
	deleteMount: serverMocks.deleteMount,
	execAsync: serverMocks.execAsync,
	execAsyncRemote: serverMocks.execAsyncRemote,
	findComposeById: serverMocks.findComposeById,
	findDomainsByComposeId: serverMocks.findDomainsByComposeId,
	findApplicationById: serverMocks.findApplicationById,
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
	getComposeContainer: serverMocks.getComposeContainer,
	getContainerLogs: serverMocks.getContainerLogs,
	getWebServerSettings: serverMocks.getWebServerSettings,
	loadServices: serverMocks.loadServices,
	randomizeComposeFile: serverMocks.randomizeComposeFile,
	randomizeIsolatedDeploymentComposeFile:
		serverMocks.randomizeIsolatedDeploymentComposeFile,
	removeCompose: serverMocks.removeCompose,
	removeComposeDirectory: serverMocks.removeComposeDirectory,
	removeDeploymentsByComposeId: serverMocks.removeDeploymentsByComposeId,
	removeDomainById: serverMocks.removeDomainById,
	startCompose: serverMocks.startCompose,
	stopCompose: serverMocks.stopCompose,
	updateCompose: serverMocks.updateCompose,
	updateDeploymentStatus: serverMocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/ai", () => ({
	deleteAiSettings: aiServiceMocks.deleteAiSettings,
	getAiSettingById: aiServiceMocks.getAiSettingById,
	getAiSettingsByOrganizationId: aiServiceMocks.getAiSettingsByOrganizationId,
	saveAiSettings: aiServiceMocks.saveAiSettings,
	suggestVariants: aiServiceMocks.suggestVariants,
}));

vi.mock("@dokploy/server/services/compose", () => ({
	createComposeByTemplate: serverMocks.createComposeByTemplate,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	addNewService: permissionMocks.addNewService,
	checkPermission: permissionMocks.checkPermission,
	checkServiceAccess: permissionMocks.checkServiceAccess,
	checkServicePermissionAndAccess:
		permissionMocks.checkServicePermissionAndAccess,
	findMemberByUserId: permissionMocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/project", () => ({
	findProjectById: serverMocks.findProjectById,
}));

vi.mock("@dokploy/server/templates/github", () => ({
	fetchTemplateFiles: templateMocks.fetchTemplateFiles,
	fetchTemplatesList: templateMocks.fetchTemplatesList,
}));

vi.mock("@dokploy/server/templates/processors", () => ({
	processTemplate: templateMocks.processTemplate,
}));

vi.mock("@dokploy/server/utils/ai/select-ai-provider", () => ({
	assertAIProviderApiUrlAllowed: vi.fn(async (value: string) => value),
	getProviderHeaders: vi.fn(() => ({})),
	getProviderName: vi.fn(() => "openai"),
	normalizeAIProviderApiUrl: vi.fn((value: string) => value),
	selectAIProvider: vi.fn(),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {},
	},
}));

vi.mock("@dokploy/server/services/git-provider", () => ({
	canEditDeployGitSource: vi.fn(() => true),
	redactGitProviderSecrets: vi.fn((value) => value),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: auditMocks.audit,
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByCompose: vi.fn(),
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

const { aiRouter } = await import("../../server/api/routers/ai");
const { composeRouter } = await import("../../server/api/routers/compose");
const { generateText } = await import("ai");
const { selectAIProvider } = await import(
	"@dokploy/server/utils/ai/select-ai-provider"
);

const project = (projectId: string, organizationId = "org-1") => ({
	projectId,
	organizationId,
	name: projectId,
	env: "",
});

const environment = (
	environmentId: string,
	projectId = "project-1",
	organizationId = "org-1",
) => ({
	environmentId,
	name: environmentId,
	projectId,
	project: project(projectId, organizationId),
});

const createContext = (role = "owner") =>
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

const aiDeployInput = {
	description: "Deploy generated stack",
	dockerCompose: "services:\n  app:\n    image: nginx",
	envVariables: "",
	environmentId: "env-1",
	id: "generated-stack",
	name: "Generated Stack",
	serverId: "server-denied",
};

describe("deploy target placement ownership boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		permissionMocks.checkPermission.mockResolvedValue(undefined);
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
		serverMocks.findEnvironmentById.mockImplementation(
			(environmentId: string) =>
				Promise.resolve(
					environmentId === "env-other"
						? environment("env-other", "project-other", "org-2")
						: environment(environmentId),
				),
		);
		serverMocks.findProjectById.mockImplementation((projectId: string) =>
			Promise.resolve(
				projectId === "project-other"
					? project("project-other", "org-2")
					: project(projectId),
			),
		);
		serverMocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		serverMocks.findServerById.mockResolvedValue({ ipAddress: "10.0.0.1" });
		serverMocks.getWebServerSettings.mockResolvedValue(null);
		serverMocks.createComposeByTemplate.mockResolvedValue({
			composeId: "compose-1",
			name: "compose",
		});
		aiServiceMocks.suggestVariants.mockResolvedValue([
			{
				id: "suggestion-1",
				name: "Suggestion",
				dockerCompose: "services: {}",
			},
		]);
		templateMocks.fetchTemplateFiles.mockResolvedValue({
			config: {
				config: {},
				variables: {},
			},
			dockerCompose: "services:\n  app:\n    image: nginx",
		});
		templateMocks.processTemplate.mockReturnValue({
			domains: [],
			envs: [],
			mounts: [],
		});
	});

	it("denies AI suggestion deploy to inaccessible servers before compose persistence", async () => {
		await expect(
			aiRouter.createCaller(createContext()).deploy(aiDeployInput),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(serverMocks.createComposeByTemplate).not.toHaveBeenCalled();
		expect(permissionMocks.addNewService).not.toHaveBeenCalled();
	});

	it("keeps AI suggestion deploy available for accessible target servers", async () => {
		await expect(
			aiRouter.createCaller(createContext()).deploy({
				...aiDeployInput,
				serverId: "server-1",
			}),
		).resolves.toBeNull();

		expect(serverMocks.createComposeByTemplate).toHaveBeenCalledWith(
			expect.objectContaining({
				environmentId: "env-1",
				serverId: "server-1",
			}),
		);
	});

	it("denies AI suggestion deploy domains without domain permission before compose persistence", async () => {
		permissionMocks.checkPermission.mockImplementation(async (_ctx, input) => {
			if (Object.hasOwn(input, "domain")) {
				throw new Error("Permission denied");
			}
		});

		await expect(
			aiRouter.createCaller(createContext()).deploy({
				...aiDeployInput,
				domains: [
					{
						host: "app.example.com",
						port: 3000,
						serviceName: "app",
					},
				],
				serverId: "server-1",
			}),
		).rejects.toThrow("Permission denied");

		expect(serverMocks.createComposeByTemplate).not.toHaveBeenCalled();
		expect(serverMocks.createDomain).not.toHaveBeenCalled();
		expect(permissionMocks.addNewService).not.toHaveBeenCalled();
	});

	it("denies AI suggestion deploy config files without volume permission before compose persistence", async () => {
		permissionMocks.checkPermission.mockImplementation(async (_ctx, input) => {
			if (Object.hasOwn(input, "volume")) {
				throw new Error("Permission denied");
			}
		});

		await expect(
			aiRouter.createCaller(createContext()).deploy({
				...aiDeployInput,
				configFiles: [
					{
						filePath: "/etc/app/config.yaml",
						content: "debug: false",
					},
				],
				serverId: "server-1",
			}),
		).rejects.toThrow("Permission denied");

		expect(serverMocks.createComposeByTemplate).not.toHaveBeenCalled();
		expect(serverMocks.createMount).not.toHaveBeenCalled();
		expect(permissionMocks.addNewService).not.toHaveBeenCalled();
	});

	it("keeps AI suggestion deploy domains and config files available with side-effect permissions", async () => {
		await expect(
			aiRouter.createCaller(createContext()).deploy({
				...aiDeployInput,
				configFiles: [
					{
						filePath: "/etc/app/config.yaml",
						content: "debug: false",
					},
				],
				domains: [
					{
						host: "app.example.com",
						port: 3000,
						serviceName: "app",
					},
				],
				serverId: "server-1",
			}),
		).resolves.toBeNull();

		expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
			expect.anything(),
			{ domain: ["create"] },
		);
		expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
			expect.anything(),
			{ volume: ["create"] },
		);
		expect(serverMocks.createDomain).toHaveBeenCalledWith(
			expect.objectContaining({
				composeId: "compose-1",
				domainType: "compose",
				host: "app.example.com",
			}),
		);
		expect(serverMocks.createMount).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "debug: false",
				filePath: "/etc/app/config.yaml",
				serviceId: "compose-1",
				serviceType: "compose",
				type: "file",
			}),
		);
	});

	it("denies local AI suggestion deploy when remote servers only is enabled", async () => {
		serverMocks.getWebServerSettings.mockResolvedValueOnce({
			remoteServersOnly: true,
		});

		await expect(
			aiRouter.createCaller(createContext()).deploy({
				...aiDeployInput,
				serverId: undefined,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(serverMocks.createComposeByTemplate).not.toHaveBeenCalled();
		expect(permissionMocks.addNewService).not.toHaveBeenCalled();
	});

	it("requires admin boundary before AI suggestions can spend provider credentials", async () => {
		await expect(
			aiRouter.createCaller(createContext("member")).suggest({
				aiId: "ai-1",
				input: "deploy postgres",
				serverId: "server-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(aiServiceMocks.suggestVariants).not.toHaveBeenCalled();
	});

	it("requires admin boundary before log analysis can spend provider credentials", async () => {
		await expect(
			aiRouter.createCaller(createContext("member")).analyzeLogs({
				aiId: "ai-1",
				context: "build",
				logs: "npm ERR! secret=value",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(aiServiceMocks.getAiSettingById).not.toHaveBeenCalled();
	});

	it("keeps log analysis available for admins after the credential-spend gate", async () => {
		const provider = vi.fn(() => "model");
		vi.mocked(selectAIProvider).mockReturnValueOnce(provider as never);
		vi.mocked(generateText).mockResolvedValueOnce({
			text: "Use the production build log",
		} as Awaited<ReturnType<typeof generateText>>);
		aiServiceMocks.getAiSettingById.mockResolvedValueOnce({
			aiId: "ai-1",
			apiKey: "secret",
			apiUrl: "https://api.openai.com/v1",
			isEnabled: true,
			model: "gpt-4o-mini",
			name: "OpenAI",
			organizationId: "org-1",
		});

		await expect(
			aiRouter.createCaller(createContext("admin")).analyzeLogs({
				aiId: "ai-1",
				context: "build",
				logs: "npm ERR! dependency failure",
			}),
		).resolves.toEqual({ analysis: "Use the production build log" });

		expect(provider).toHaveBeenCalledWith("gpt-4o-mini");
		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "model",
			}),
		);
	});

	it("denies AI suggestions for inaccessible servers before server metadata reaches AI service", async () => {
		await expect(
			aiRouter.createCaller(createContext()).suggest({
				aiId: "ai-1",
				input: "deploy postgres",
				serverId: "server-denied",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(aiServiceMocks.suggestVariants).not.toHaveBeenCalled();
		expect(serverMocks.findServerById).not.toHaveBeenCalled();
	});

	it("keeps AI suggestions available for accessible target servers", async () => {
		await expect(
			aiRouter.createCaller(createContext()).suggest({
				aiId: "ai-1",
				input: "deploy postgres",
				serverId: "server-1",
			}),
		).resolves.toEqual([
			expect.objectContaining({
				id: "suggestion-1",
			}),
		]);

		expect(aiServiceMocks.suggestVariants).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				serverId: "server-1",
			}),
		);
	});

	it("denies compose template deploy to environments outside the active organization before template fetch", async () => {
		await expect(
			composeRouter.createCaller(createContext()).deployTemplate({
				environmentId: "env-other",
				id: "postgres",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(templateMocks.fetchTemplateFiles).not.toHaveBeenCalled();
		expect(serverMocks.createComposeByTemplate).not.toHaveBeenCalled();
	});

	it("keeps compose template deploy available for same-organization targets", async () => {
		await expect(
			composeRouter.createCaller(createContext()).deployTemplate({
				environmentId: "env-1",
				id: "postgres",
				serverId: "server-1",
			}),
		).resolves.toMatchObject({ composeId: "compose-1" });

		expect(serverMocks.createComposeByTemplate).toHaveBeenCalledWith(
			expect.objectContaining({
				environmentId: "env-1",
				serverId: "server-1",
			}),
		);
	});

	it("redacts compose template deployment secrets in the mutation response", async () => {
		serverMocks.createComposeByTemplate.mockResolvedValueOnce({
			composeId: "compose-1",
			name: "compose",
			appName: "compose-one",
			env: "TOKEN=secret",
			refreshToken: "refresh-token",
		});

		await expect(
			composeRouter.createCaller(createContext()).deployTemplate({
				environmentId: "env-1",
				id: "postgres",
				serverId: "server-1",
			}),
		).resolves.toMatchObject({
			composeId: "compose-1",
			env: REDACTED_SECRET_VALUE,
			refreshToken: REDACTED_SECRET_VALUE,
		});
	});
});
