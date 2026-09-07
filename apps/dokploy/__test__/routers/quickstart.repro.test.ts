import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the onboarding quickstart "Remote Servers Only"
 * policy bypass. `application.deployNginxQuickstart` (introduced in 2e2e0c8c2)
 * originally gated server-less deploys on `IS_CLOUD` only and omitted the
 * `webServerSettings?.remoteServersOnly` clause that every other
 * service-creation route enforces. This test exercises the real tRPC handlers
 * via `applicationRouter.createCaller` so the inline guard is the only
 * variable under test.
 *
 * DB stays globally mocked by `__test__/setup.ts`; the small set of service
 * modules the two handlers read are mocked here with the targeted-mock
 * pattern used by `__test__/deploy/application.real.test.ts`.
 */

const hoisted = vi.hoisted(() => ({
	state: {
		webServerSettings: {
			remoteServersOnly: false,
			serverIp: "127.0.0.1",
		} as Record<string, unknown>,
		environment: { environmentId: "env-1", projectId: "proj-1" },
		project: { projectId: "proj-1", organizationId: "org-1" },
		createdApplication: {
			applicationId: "app-1",
			appName: "hello-world-abc123",
		},
		generatedHost: "hello-world-abc123.sslip.io",
		createdDomain: {
			domainId: "domain-1",
			host: "hello-world-abc123.sslip.io",
		},
		accessibleServerIds: new Set<string>(["srv-1"]),
	},
	getWebServerSettings: vi.fn(),
	findEnvironmentById: vi.fn(),
	findProjectById: vi.fn(),
	createApplication: vi.fn(),
	createDomain: vi.fn(),
	updateApplication: vi.fn(),
	generateTraefikMeDomain: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	checkServiceAccess: vi.fn(),
	addNewService: vi.fn(),
	audit: vi.fn(),
	queueAdd: vi.fn(),
	getApplicationStats: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		getWebServerSettings: hoisted.getWebServerSettings,
		findEnvironmentById: hoisted.findEnvironmentById,
		findProjectById: hoisted.findProjectById,
		createApplication: hoisted.createApplication,
		createDomain: hoisted.createDomain,
		updateApplication: hoisted.updateApplication,
		generateTraefikMeDomain: hoisted.generateTraefikMeDomain,
		getAccessibleServerIds: hoisted.getAccessibleServerIds,
		getApplicationStats: hoisted.getApplicationStats,
	};
});

vi.mock("@dokploy/server/services/permission", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		checkServiceAccess: hoisted.checkServiceAccess,
		addNewService: hoisted.addNewService,
	};
});

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: hoisted.queueAdd },
	cleanQueuesByApplication: vi.fn(),
	killDockerBuild: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: hoisted.audit,
}));

vi.mock("@/server/utils/deploy", () => ({
	deploy: vi.fn(),
	cancelDeployment: vi.fn(),
}));

const { applicationRouter } = await import("@/server/api/routers/application");

const buildCtx = () => ({
	user: {
		id: "user-1",
		email: "owner@test.com",
		role: "owner" as const,
		ownerId: "owner-1",
		enableEnterpriseFeatures: false,
		isValidEnterpriseLicense: false,
	},
	session: { activeOrganizationId: "org-1" },
	db: {},
	req: {},
	res: {},
});

// createCaller expects the full request context surface (NextApiRequest,
// better-auth Session/User). The middleware only reads session/user at runtime;
// cast the synthetic unit-test context to satisfy the router's context type.
const makeCaller = () =>
	applicationRouter.createCaller(
		buildCtx() as Parameters<typeof applicationRouter.createCaller>[0],
	);

const configureResolvedMocks = () => {
	hoisted.getWebServerSettings.mockResolvedValue(
		hoisted.state.webServerSettings,
	);
	hoisted.findEnvironmentById.mockResolvedValue(hoisted.state.environment);
	hoisted.findProjectById.mockResolvedValue(hoisted.state.project);
	hoisted.createApplication.mockResolvedValue(hoisted.state.createdApplication);
	hoisted.createDomain.mockResolvedValue(hoisted.state.createdDomain);
	hoisted.updateApplication.mockResolvedValue({});
	hoisted.generateTraefikMeDomain.mockResolvedValue(
		hoisted.state.generatedHost,
	);
	hoisted.getAccessibleServerIds.mockResolvedValue(
		hoisted.state.accessibleServerIds,
	);
	hoisted.checkServiceAccess.mockResolvedValue(undefined);
	hoisted.addNewService.mockResolvedValue(undefined);
	hoisted.audit.mockResolvedValue(undefined);
	hoisted.queueAdd.mockResolvedValue({ id: "job-1" });
};

const setRemoteServersOnly = (value: boolean) => {
	hoisted.state.webServerSettings.remoteServersOnly = value;
};

beforeEach(() => {
	vi.clearAllMocks();
	setRemoteServersOnly(false);
	configureResolvedMocks();
});

describe("remoteServersOnly policy guard", () => {
	it("application.create REJECTS under remoteServersOnly=true with serverId omitted", async () => {
		setRemoteServersOnly(true);
		const caller = makeCaller();

		await expect(
			caller.create({
				name: "Test",
				appName: "test-app",
				environmentId: "env-1",
				sourceType: "docker",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You need to use a server to create an application",
		});

		expect(hoisted.createApplication).not.toHaveBeenCalled();
	});

	it("application.create SUCCEEDS under remoteServersOnly=false (no regression)", async () => {
		setRemoteServersOnly(false);
		const caller = makeCaller();

		const result = await caller.create({
			name: "Test",
			appName: "test-app",
			environmentId: "env-1",
			sourceType: "docker",
		});

		expect(result).toEqual(hoisted.state.createdApplication);
		expect(hoisted.createApplication).toHaveBeenCalledTimes(1);
	});

	it("deployNginxQuickstart REJECTS under remoteServersOnly=true with serverId omitted (the fix)", async () => {
		setRemoteServersOnly(true);
		const caller = makeCaller();

		await expect(
			caller.deployNginxQuickstart({ environmentId: "env-1" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You need to use a server to create an application",
		});

		expect(hoisted.createApplication).not.toHaveBeenCalled();
		expect(hoisted.queueAdd).not.toHaveBeenCalled();
	});

	it("deployNginxQuickstart SUCCEEDS under remoteServersOnly=false and enqueues a LOCAL deploy", async () => {
		setRemoteServersOnly(false);
		const caller = makeCaller();

		const result = await caller.deployNginxQuickstart({
			environmentId: "env-1",
		});

		expect(result).toEqual({
			applicationId: "app-1",
			domainUrl: "http://hello-world-abc123.sslip.io",
		});
		expect(hoisted.queueAdd).toHaveBeenCalledTimes(1);
		const [, jobData] = hoisted.queueAdd.mock.calls.at(0)!;
		expect(jobData).toMatchObject({
			applicationId: "app-1",
			server: false,
			serverId: undefined,
			type: "deploy",
			applicationType: "application",
		});
		expect(jobData.serverId).toBeUndefined();
	});

	it("deployNginxQuickstart SUCCEEDS under remoteServersOnly=true when serverId IS provided (policy honored)", async () => {
		setRemoteServersOnly(true);
		const caller = makeCaller();

		const result = await caller.deployNginxQuickstart({
			environmentId: "env-1",
			serverId: "srv-1",
		});

		expect(result).toEqual({
			applicationId: "app-1",
			domainUrl: "http://hello-world-abc123.sslip.io",
		});
		expect(hoisted.getAccessibleServerIds).toHaveBeenCalledTimes(1);
		expect(hoisted.queueAdd).toHaveBeenCalledTimes(1);
		const [, jobData] = hoisted.queueAdd.mock.calls.at(0)!;
		expect(jobData).toMatchObject({
			applicationId: "app-1",
			server: true,
			serverId: "srv-1",
		});
	});

	it("deployNginxQuickstart preserves the project-organization authorization check (no regression)", async () => {
		hoisted.findProjectById.mockResolvedValueOnce({
			projectId: "proj-1",
			organizationId: "other-org",
		});
		const caller = makeCaller();

		await expect(
			caller.deployNginxQuickstart({
				environmentId: "env-1",
				serverId: "srv-1",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this project",
		});

		expect(hoisted.createApplication).not.toHaveBeenCalled();
	});

	it("deployNginxQuickstart rejects an inaccessible serverId even when policy allows local", async () => {
		setRemoteServersOnly(false);
		hoisted.getAccessibleServerIds.mockResolvedValueOnce(new Set<string>([]));
		const caller = makeCaller();

		await expect(
			caller.deployNginxQuickstart({
				environmentId: "env-1",
				serverId: "forbidden-srv",
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});

		expect(hoisted.createApplication).not.toHaveBeenCalled();
	});
});

describe("TRPCError contract", () => {
	it("throws a TRPCError instance (mapped to HTTP 401, not a 400 BAD_REQUEST)", async () => {
		setRemoteServersOnly(true);
		const caller = makeCaller();

		await expect(
			caller.deployNginxQuickstart({ environmentId: "env-1" }),
		).rejects.toBeInstanceOf(TRPCError);
	});
});
