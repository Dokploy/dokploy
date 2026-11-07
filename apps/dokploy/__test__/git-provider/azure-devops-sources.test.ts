import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	updateApp: vi.fn(),
	updateCompose: vi.fn(),
	access: vi.fn(),
	permission: vi.fn(),
	rotateToken: vi.fn(),
	hookStatus: vi.fn(),
	syncHook: vi.fn(),
}));
const current = vi.hoisted(() => ({
	sourceType: "azureDevops",
	azureDevopsId: "azure",
	azureDevopsProjectId: "11111111-1111-4111-8111-111111111111",
	azureDevopsRepositoryId: "22222222-2222-4222-8222-222222222222",
	azureDevopsProjectName: "Project",
	azureDevopsRepositoryName: "Repository",
	azureDevopsBranch: "main",
	watchPaths: null,
	environment: { project: { organizationId: "org" } },
	name: "Service",
	applicationId: "app",
	composeId: "compose",
	composePath: "./docker-compose.yml",
}));
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	hasValidLicense: async () => false,
	updateApplication: mocks.updateApp,
	updateCompose: mocks.updateCompose,
	findApplicationById: async () => current,
	findComposeById: async () => current,
	findPreviewDeploymentsByApplicationId: async () => [],
}));
vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: true,
	hasValidLicense: async () => false,
	updateApplication: mocks.updateApp,
	updateCompose: mocks.updateCompose,
	findApplicationById: async () => current,
	findComposeById: async () => current,
	findPreviewDeploymentsByApplicationId: async () => [],
}));
vi.mock("@dokploy/server/services/azure-devops", () => ({
	assertAzureDevopsSourceAccess: mocks.access,
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.permission,
	checkServiceAccess: mocks.permission,
}));
vi.mock("@dokploy/server/services/azure-devops-hooks", () => ({
	getAzureDevopsHookStatus: mocks.hookStatus,
	syncAzureDevopsWebhook: mocks.syncHook,
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		update: () => ({
			set: mocks.rotateToken.mockReturnValue({ where: async () => undefined }),
		}),
		delete: () => ({
			where: () => ({ returning: async () => [current] }),
		}),
	},
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: vi.fn() },
	cleanQueuesByCompose: vi.fn(),
	killDockerBuild: vi.fn(),
}));

const { applicationRouter } = await import("@/server/api/routers/application");
const { composeRouter } = await import("@/server/api/routers/compose");
const context = {
	session: { activeOrganizationId: "org", userId: "user" },
	user: { id: "user", email: "user@test.invalid", role: "owner" },
} as Parameters<typeof applicationRouter.createCaller>[0];
const app = applicationRouter.createCaller(context);
const compose = composeRouter.createCaller(context);
const source = {
	azureDevopsId: current.azureDevopsId,
	azureDevopsProjectId: current.azureDevopsProjectId,
	azureDevopsRepositoryId: current.azureDevopsRepositoryId,
	azureDevopsProjectName: current.azureDevopsProjectName,
	azureDevopsRepositoryName: current.azureDevopsRepositoryName,
	azureDevopsBranch: current.azureDevopsBranch,
};

beforeEach(() => {
	vi.clearAllMocks();
	current.sourceType = "azureDevops";
	mocks.hookStatus.mockResolvedValue([]);
	mocks.syncHook.mockResolvedValue([]);
	mocks.updateApp.mockResolvedValue({ applicationId: "app" });
	mocks.updateCompose.mockResolvedValue({ composeId: "compose" });
	mocks.access.mockResolvedValue(undefined);
});

describe("Azure DevOps Application and Compose source mutations", () => {
	describe.each([
		{
			type: "application",
			disconnect: () => app.disconnectGitProvider({ applicationId: "app" }),
			remove: () => app.delete({ applicationId: "app" }),
			update: mocks.updateApp,
			id: "app",
		},
		{
			type: "compose",
			disconnect: () => compose.disconnectGitProvider({ composeId: "compose" }),
			remove: () =>
				compose.delete({ composeId: "compose", deleteVolumes: false }),
			update: mocks.updateCompose,
			id: "compose",
		},
	])("$type cleanup scope", ({ type, disconnect, remove, update, id }) => {
		it.each(["azureDevops", "github", "gitlab", "bitbucket", "gitea", "git"])(
			"leaves token rotation to the service when disconnecting %s",
			async (sourceType) => {
				current.sourceType = sourceType;
				await disconnect();
				expect(update).toHaveBeenCalledOnce();
				expect(update.mock.calls[0]?.[1]).not.toHaveProperty("refreshToken");
			},
		);
		it.each(["github", "gitlab", "bitbucket", "gitea", "git"])(
			"deletes a %s service without rotating its token or syncing Azure hooks",
			async (sourceType) => {
				current.sourceType = sourceType;
				expect(await remove()).toMatchObject({ azureDevopsCleanup: [] });
				expect(mocks.rotateToken).not.toHaveBeenCalled();
				expect(mocks.syncHook).not.toHaveBeenCalled();
			},
		);
		it.each(["azureDevops", "github"])(
			"rotates the token and reports retained cleanup records when deleting %s",
			async (sourceType) => {
				current.sourceType = sourceType;
				const records = [{ id: "hook", status: "cleanupPending" }];
				mocks.hookStatus.mockResolvedValue(records);
				expect(await remove()).toMatchObject({ azureDevopsCleanup: records });
				expect(mocks.rotateToken).toHaveBeenCalledExactlyOnceWith({
					refreshToken: expect.any(String),
				});
				expect(mocks.syncHook).toHaveBeenCalledExactlyOnceWith(type, id, true);
			},
		);
		it("cleans up an Azure source even without a local hook record", async () => {
			expect(await remove()).toMatchObject({ azureDevopsCleanup: [] });
			expect(mocks.rotateToken).toHaveBeenCalledOnce();
			expect(mocks.syncHook).toHaveBeenCalledExactlyOnceWith(type, id, true);
		});
	});
	it("allows automatic deployment updates with an unset watch-path list", async () => {
		await app.update({ applicationId: "app", autoDeploy: false });
		await compose.update({ composeId: "compose", autoDeploy: true });
		expect(mocks.updateApp).toHaveBeenCalled();
		expect(mocks.updateCompose).toHaveBeenCalled();
	});
	it("saves the Application source without changing its status", async () => {
		await app.saveAzureDevopsProvider({
			applicationId: "app",
			...source,
			azureDevopsBuildPath: "/src",
		});
		expect(mocks.updateApp).toHaveBeenCalledWith(
			"app",
			expect.objectContaining({
				sourceType: "azureDevops",
				azureDevopsBuildPath: "/src",
			}),
		);
		expect(mocks.updateApp.mock.calls[0]?.[1]).not.toHaveProperty(
			"applicationStatus",
		);
		expect(mocks.updateCompose).not.toHaveBeenCalled();
		expect(mocks.access).toHaveBeenCalledWith(
			{ activeOrganizationId: "org", userId: "user" },
			current,
			"azure",
		);
	});
	it("saves Compose through its own update mutation without changing its status", async () => {
		await compose.update({
			composeId: "compose",
			...source,
			sourceType: "azureDevops",
			composePath: "deploy/compose.yml",
		});
		expect(mocks.updateCompose).toHaveBeenCalledWith(
			"compose",
			expect.objectContaining({
				sourceType: "azureDevops",
				composePath: "deploy/compose.yml",
			}),
		);
		expect(mocks.updateCompose.mock.calls[0]?.[1]).not.toHaveProperty(
			"composeStatus",
		);
		expect(mocks.updateApp).not.toHaveBeenCalled();
	});
	it("enforces provider authorization on both general update endpoints", async () => {
		mocks.access.mockRejectedValue(new Error("Forbidden"));
		await expect(
			app.update({ applicationId: "app", azureDevopsId: "forbidden" }),
		).rejects.toThrow("Forbidden");
		await expect(
			compose.update({ composeId: "compose", azureDevopsId: "forbidden" }),
		).rejects.toThrow("Forbidden");
		expect(mocks.updateApp).not.toHaveBeenCalled();
		expect(mocks.updateCompose).not.toHaveBeenCalled();
	});
	it("authorizes path-only Compose source changes", async () => {
		await compose.update({
			composeId: "compose",
			composePath: "deploy/compose.yml",
		});
		expect(mocks.access).toHaveBeenCalledWith(
			{ activeOrganizationId: "org", userId: "user" },
			current,
			undefined,
		);
		expect(mocks.updateCompose).toHaveBeenCalledWith("compose", {
			composeId: "compose",
			composePath: "deploy/compose.yml",
		});
	});
	it("rejects path-only edits when the provider source cannot be edited", async () => {
		mocks.access.mockRejectedValue(new Error("Forbidden"));
		await expect(
			compose.update({ composeId: "compose", composePath: "other.yml" }),
		).rejects.toThrow("Forbidden");
		expect(mocks.updateCompose).not.toHaveBeenCalled();
	});
	it.each([
		"../outside.yml",
		"deploy/../../outside.yml",
		"deploy\\..\\outside.yml",
		"/outside.yml",
		"C:\\outside.yml",
		"\\\\host\\share\\outside.yml",
		"compose.yml\nother.yml",
	])("rejects an unsafe path-only Compose update: %s", async (composePath) => {
		await expect(
			compose.update({ composeId: "compose", composePath }),
		).rejects.toThrow();
		expect(mocks.updateCompose).not.toHaveBeenCalled();
	});
	it("prevents bypassing source edit restrictions through disconnect or another Application provider", async () => {
		mocks.access.mockRejectedValue(new Error("Forbidden"));
		await expect(
			app.disconnectGitProvider({ applicationId: "app" }),
		).rejects.toThrow("Forbidden");
		await expect(
			compose.disconnectGitProvider({ composeId: "compose" }),
		).rejects.toThrow("Forbidden");
		await expect(
			app.saveDockerProvider({
				applicationId: "app",
				dockerImage: "nginx",
				username: "",
				password: "",
				registryUrl: "",
			}),
		).rejects.toThrow("Forbidden");
	});
	it("validates project/repository IDs even when passed to the generic update endpoint", async () => {
		await expect(
			compose.update({
				composeId: "compose",
				sourceType: "azureDevops",
				azureDevopsRepositoryId: "invalid",
			}),
		).rejects.toThrow();
		expect(mocks.updateCompose).not.toHaveBeenCalled();
	});
});
