import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	fetchDeployApiJobs: vi.fn(),
	findAllDeploymentsByApplicationId: vi.fn(),
	findAllDeploymentsByComposeId: vi.fn(),
	findAllDeploymentsByServerId: vi.fn(),
	findAllDeploymentsCentralized: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findDeploymentById: vi.fn(),
	findEnvironmentById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMemberByUserId: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findProjectById: vi.fn(),
	findRedisById: vi.fn(),
	findServerById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	isCloud: true,
	myQueueGetJobs: vi.fn(),
	removeDeployment: vi.fn(),
	resolveServicePath: vi.fn(),
	serverFindMany: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return mocks.isCloud;
	},
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	findAllDeploymentsByApplicationId: mocks.findAllDeploymentsByApplicationId,
	findAllDeploymentsByComposeId: mocks.findAllDeploymentsByComposeId,
	findAllDeploymentsByServerId: mocks.findAllDeploymentsByServerId,
	findAllDeploymentsCentralized: mocks.findAllDeploymentsCentralized,
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	findDeploymentById: mocks.findDeploymentById,
	findEnvironmentById: mocks.findEnvironmentById,
	findLibsqlById: mocks.findLibsqlById,
	findMariadbById: mocks.findMariadbById,
	findMongoById: mocks.findMongoById,
	findMySqlById: mocks.findMySqlById,
	findPostgresById: mocks.findPostgresById,
	findProjectById: mocks.findProjectById,
	findRedisById: mocks.findRedisById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	removeDeployment: mocks.removeDeployment,
	resolveServicePath: mocks.resolveServicePath,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			server: {
				findMany: mocks.serverFindMany,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: mocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: {
		getJobs: mocks.myQueueGetJobs,
	},
}));

vi.mock("@/server/utils/deploy", () => ({
	fetchDeployApiJobs: mocks.fetchDeployApiJobs,
}));

const { deploymentRouter } = await import(
	"../../server/api/routers/deployment"
);

const createCaller = () =>
	deploymentRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "member",
		},
	} as never);

describe("deployment router assigned-server boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isCloud = true;
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findMemberByUserId.mockResolvedValue({
			role: "member",
			accessedServices: ["app-1"],
		});
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.findAllDeploymentsByServerId.mockResolvedValue([
			{ deploymentId: "deployment-1", serverId: "server-1" },
		]);
		mocks.serverFindMany.mockResolvedValue([
			{ serverId: "server-1" },
			{ serverId: "server-2" },
		]);
		mocks.fetchDeployApiJobs.mockImplementation((serverId: string) =>
			Promise.resolve([{ id: `${serverId}-job`, serverId }]),
		);
		mocks.resolveServicePath.mockResolvedValue(undefined);
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			logPath: "/tmp/deployment.log",
			schedule: {
				serverId: "server-1",
			},
		});
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "logs" });
	});

	it("denies allByServer on inaccessible servers before deployment lookup", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().allByServer({ serverId: "server-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.findAllDeploymentsByServerId).not.toHaveBeenCalled();
	});

	it("filters cloud deployment queue jobs to accessible servers", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));

		await expect(createCaller().queueList()).resolves.toEqual([
			{ id: "server-1-job", serverId: "server-1", servicePath: undefined },
		]);

		expect(mocks.fetchDeployApiJobs).toHaveBeenCalledTimes(1);
		expect(mocks.fetchDeployApiJobs).toHaveBeenCalledWith("server-1");
	});

	it("filters self-hosted deployment queue jobs to the active organization", async () => {
		mocks.isCloud = false;
		mocks.myQueueGetJobs.mockResolvedValue([
			{
				id: "job-1",
				name: "deployments",
				data: { applicationId: "app-1", applicationType: "application" },
				timestamp: 200,
				getState: vi.fn().mockResolvedValue("waiting"),
			},
			{
				id: "job-2",
				name: "deployments",
				data: { applicationId: "foreign-app", applicationType: "application" },
				timestamp: 100,
				getState: vi.fn().mockResolvedValue("waiting"),
			},
		]);
		mocks.resolveServicePath.mockImplementation(
			(_orgId: string, data: Record<string, unknown>) =>
				Promise.resolve(
					data.applicationId === "app-1"
						? { href: "/dashboard/project/project-1", label: "Application" }
						: { href: null, label: "Application" },
				),
		);

		await expect(createCaller().queueList()).resolves.toEqual([
			{
				id: "job-1",
				name: "deployments",
				data: { applicationId: "app-1", applicationType: "application" },
				timestamp: 200,
				finishedOn: undefined,
				processedOn: undefined,
				failedReason: undefined,
				state: "waiting",
				servicePath: {
					href: "/dashboard/project/project-1",
					label: "Application",
				},
			},
		]);
	});

	it("denies schedule-backed deployment logs on inaccessible servers before remote tail", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			createCaller().readLogs({
				deploymentId: "deployment-1",
				tail: 100,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("denies server-bound deployment logs on inaccessible servers before remote tail", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			logPath: "/tmp/deployment.log",
			serverId: "server-1",
		});

		await expect(
			createCaller().readLogs({
				deploymentId: "deployment-1",
				tail: 100,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("denies server-bound deployment cancellation on inaccessible servers before process side effects", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			pid: "1234",
			serverId: "server-1",
		});

		await expect(
			createCaller().killProcess({ deploymentId: "deployment-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.updateDeploymentStatus).not.toHaveBeenCalled();
	});

	it("denies server-bound deployment removal on inaccessible servers before persistence", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			serverId: "server-1",
		});

		await expect(
			createCaller().removeDeployment({ deploymentId: "deployment-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.removeDeployment).not.toHaveBeenCalled();
	});

	it("denies backup deployment logs through the owning backup service before log reads", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			backupId: "backup-1",
			backup: {
				postgresId: "postgres-1",
			},
			deploymentId: "deployment-1",
			logPath: "/tmp/deployment.log",
		});
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("service denied"),
		);

		await expect(
			createCaller().readLogs({
				deploymentId: "deployment-1",
				tail: 100,
			}),
		).rejects.toThrow("service denied");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"postgres-1",
			{ deployment: ["read"] },
		);
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("denies volume-backup deployment cancellation through the owning service before process side effects", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			pid: "1234",
			volumeBackupId: "volume-backup-1",
			volumeBackup: {
				applicationId: "app-1",
			},
		});
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("service denied"),
		);

		await expect(
			createCaller().killProcess({ deploymentId: "deployment-1" }),
		).rejects.toThrow("service denied");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ deployment: ["cancel"] },
		);
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.updateDeploymentStatus).not.toHaveBeenCalled();
	});

	it("denies preview deployment removal through the preview application before persistence", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			previewDeploymentId: "preview-1",
			previewDeployment: {
				applicationId: "app-1",
			},
		});
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("service denied"),
		);

		await expect(
			createCaller().removeDeployment({ deploymentId: "deployment-1" }),
		).rejects.toThrow("service denied");

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ deployment: ["cancel"] },
		);
		expect(mocks.removeDeployment).not.toHaveBeenCalled();
	});

	it("fails closed for deployment rows with no supported owner relation", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			deploymentId: "deployment-1",
			logPath: "/tmp/deployment.log",
		});

		await expect(
			createCaller().readLogs({
				deploymentId: "deployment-1",
				tail: 100,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});
