import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which host a "cancel build" reaches. A service that builds on a build server
 * is cancelled there, by deployment; the host-wide `pkill` only ever runs on
 * the serving host, and only for services that build there.
 */

const mocks = vi.hoisted(() => ({
	findComposeById: vi.fn(),
	findApplicationById: vi.fn(),
	findDeploymentById: vi.fn(),
	cancelBuildServerDeploymentsForService: vi.fn(),
	cancelBuildServerDeploymentById: vi.fn(),
	killDockerBuild: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	audit: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	findComposeById: mocks.findComposeById,
	findApplicationById: mocks.findApplicationById,
	findDeploymentById: mocks.findDeploymentById,
	cancelBuildServerDeploymentsForService:
		mocks.cancelBuildServerDeploymentsForService,
	cancelBuildServerDeploymentById: mocks.cancelBuildServerDeploymentById,
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByCompose: vi.fn(),
	cleanQueuesByApplication: vi.fn(),
	killDockerBuild: mocks.killDockerBuild,
	myQueue: { add: vi.fn() },
}));

const ctx = {
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
};

const { composeRouter } = await import("@/server/api/routers/compose");
const { applicationRouter } = await import("@/server/api/routers/application");
const { deploymentRouter } = await import("@/server/api/routers/deployment");

const composeCaller = composeRouter.createCaller(
	ctx as Parameters<typeof composeRouter.createCaller>[0],
);
const applicationCaller = applicationRouter.createCaller(
	ctx as Parameters<typeof applicationRouter.createCaller>[0],
);
const deploymentCaller = deploymentRouter.createCaller(
	ctx as Parameters<typeof deploymentRouter.createCaller>[0],
);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.cancelBuildServerDeploymentsForService.mockResolvedValue({
		usesBuildServer: false,
		cancelled: 0,
		warnings: [],
	});
	mocks.cancelBuildServerDeploymentById.mockResolvedValue(null);
});

describe("compose.killBuild", () => {
	it("cancels on the build server and never pkills the serving host", async () => {
		mocks.findComposeById.mockResolvedValue({
			composeId: "c1",
			name: "stack",
			serverId: "serving-1",
			buildServerId: "build-1",
		});

		await composeCaller.killBuild({ composeId: "c1" });

		expect(mocks.cancelBuildServerDeploymentsForService).toHaveBeenCalledWith({
			type: "compose",
			composeId: "c1",
		});
		expect(mocks.killDockerBuild).not.toHaveBeenCalled();
	});

	it("without a build server is exactly the old behaviour", async () => {
		mocks.findComposeById.mockResolvedValue({
			composeId: "c1",
			name: "stack",
			serverId: "serving-1",
			buildServerId: null,
		});

		await composeCaller.killBuild({ composeId: "c1" });

		expect(mocks.killDockerBuild).toHaveBeenCalledWith("compose", "serving-1");
		expect(mocks.cancelBuildServerDeploymentsForService).not.toHaveBeenCalled();
	});
});

describe("application.killBuild", () => {
	const application = (extra = {}) => ({
		applicationId: "a1",
		name: "app",
		serverId: "serving-1",
		buildServerId: null,
		...extra,
	});

	it("without a build server keeps the pkill on the serving host", async () => {
		mocks.findApplicationById.mockResolvedValue(application());

		await applicationCaller.killBuild({ applicationId: "a1" });

		expect(mocks.killDockerBuild).toHaveBeenCalledWith(
			"application",
			"serving-1",
		);
	});

	it("cancels the running build-server deployment and does not pkill the serving host", async () => {
		mocks.findApplicationById.mockResolvedValue(
			application({ buildServerId: "build-1" }),
		);
		mocks.cancelBuildServerDeploymentsForService.mockResolvedValue({
			usesBuildServer: true,
			cancelled: 1,
			warnings: [],
		});

		await applicationCaller.killBuild({ applicationId: "a1" });

		expect(mocks.cancelBuildServerDeploymentsForService).toHaveBeenCalledWith({
			type: "application",
			applicationId: "a1",
		});
		expect(mocks.killDockerBuild).not.toHaveBeenCalled();
	});

	it("an application configured for a build server never pkills the serving host, even with nothing running", async () => {
		mocks.findApplicationById.mockResolvedValue(
			application({ buildServerId: "build-1" }),
		);

		await applicationCaller.killBuild({ applicationId: "a1" });

		expect(mocks.killDockerBuild).not.toHaveBeenCalled();
	});

	it("a policy-forced remote build (no buildServerId on the app) is still cancelled remotely", async () => {
		mocks.findApplicationById.mockResolvedValue(application());
		mocks.cancelBuildServerDeploymentsForService.mockResolvedValue({
			usesBuildServer: true,
			cancelled: 1,
			warnings: [],
		});

		await applicationCaller.killBuild({ applicationId: "a1" });

		expect(mocks.killDockerBuild).not.toHaveBeenCalled();
	});
});

describe("deployment.killProcess", () => {
	const deployment = (extra = {}) => ({
		deploymentId: "dep-1",
		applicationId: "a1",
		composeId: null,
		pid: null,
		schedule: null,
		...extra,
	});

	it("stops a build-server deployment remotely and does not need a local pid", async () => {
		mocks.findDeploymentById.mockResolvedValue(deployment());
		mocks.cancelBuildServerDeploymentById.mockResolvedValue({
			status: "cancelled",
			result: "KILLED",
		});

		await deploymentCaller.killProcess({ deploymentId: "dep-1" });

		expect(mocks.cancelBuildServerDeploymentById).toHaveBeenCalledWith("dep-1");
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.updateDeploymentStatus).not.toHaveBeenCalled();
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ action: "cancel", resourceId: "dep-1" }),
		);
	});

	it("keeps the old pid kill for a deployment that does not build on a build server", async () => {
		mocks.findDeploymentById.mockResolvedValue(deployment({ pid: "4242" }));

		await deploymentCaller.killProcess({ deploymentId: "dep-1" });

		expect(mocks.execAsync).toHaveBeenCalledWith("kill -9 4242");
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith("dep-1", "error");
	});

	it("still says 'not running' when there is neither a remote build nor a pid", async () => {
		mocks.findDeploymentById.mockResolvedValue(deployment());

		await expect(
			deploymentCaller.killProcess({ deploymentId: "dep-1" }),
		).rejects.toMatchObject({ message: "Deployment is not running" });
	});

	it("a build-server deployment that already finished is not reported as cancelled", async () => {
		mocks.findDeploymentById.mockResolvedValue(deployment());
		mocks.cancelBuildServerDeploymentById.mockResolvedValue({
			status: "not-running",
		});

		await expect(
			deploymentCaller.killProcess({ deploymentId: "dep-1" }),
		).rejects.toMatchObject({ message: "Deployment is not running" });
		expect(mocks.audit).not.toHaveBeenCalled();
	});
});
