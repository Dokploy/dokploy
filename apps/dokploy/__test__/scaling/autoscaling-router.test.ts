import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	checkPermission: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	getCachedComposeScalingStatus: vi.fn(),
	findAutoscalingPolicy: vi.fn(),
	getControllerStatus: vi.fn(),
	saveAutoscalingPolicy: vi.fn(),
	audit: vi.fn(),
	isCloud: false,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	checkPermission: mocks.checkPermission,
}));

vi.mock("@dokploy/server/index", async () => {
	const scaleService = await vi.importActual<
		typeof import("@dokploy/server/services/scaling/scale-service")
	>("@dokploy/server/services/scaling/scale-service");
	const status = await vi.importActual<
		typeof import("@dokploy/server/services/scaling/status")
	>("@dokploy/server/services/scaling/status");
	const replicas = await vi.importActual<
		typeof import("@dokploy/server/services/scaling/replicas")
	>("@dokploy/server/services/scaling/replicas");
	const policy = await vi.importActual<
		typeof import("@dokploy/server/services/scaling/autoscaling-policy")
	>("@dokploy/server/services/scaling/autoscaling-policy");
	return {
		ScaleRejectedError: scaleService.ScaleRejectedError,
		ScalingServerUnavailableError: status.ScalingServerUnavailableError,
		get IS_CLOUD() {
			return mocks.isCloud;
		},
		getServiceMode: replicas.getServiceMode,
		settingsOf: policy.settingsOf,
		findApplicationById: mocks.findApplicationById,
		findComposeById: mocks.findComposeById,
		getCachedComposeScalingStatus: mocks.getCachedComposeScalingStatus,
		findAutoscalingPolicy: mocks.findAutoscalingPolicy,
		getControllerStatus: mocks.getControllerStatus,
		saveAutoscalingPolicy: mocks.saveAutoscalingPolicy,
	};
});

vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));
vi.mock("@/server/queues/queueSetup", () => ({ myQueue: { add: vi.fn() } }));

const { scalingRouter } = await import("@/server/api/routers/scaling");

const caller = scalingRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof scalingRouter.createCaller>[0]);

const settings = {
	enabled: true,
	minReplicas: 2,
	maxReplicas: 6,
	cpuTargetPercent: 60,
	memoryTargetPercent: null,
	tolerancePercent: 10,
	evaluationIntervalSeconds: 30,
	scaleUpWindowSeconds: 60,
	scaleDownWindowSeconds: 300,
	cooldownSeconds: 60,
	maxScaleUpStep: 4,
	maxScaleDownStep: 1,
};

const application = { kind: "application" as const, applicationId: "app-1" };

describe("autoscaling router", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.isCloud = false;
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "web",
			modeSwarm: null,
		});
		mocks.getControllerStatus.mockResolvedValue({
			running: true,
			heartbeatAt: "2026-11-03T12:00:00.000Z",
			version: "v1",
		});
		mocks.saveAutoscalingPolicy.mockResolvedValue({
			autoscalingPolicyId: "p1",
		});
	});

	it("returns defaults and the controller's status for a target without a policy", async () => {
		mocks.findAutoscalingPolicy.mockResolvedValue(null);

		const result = await caller.autoscaling({ target: application });

		expect(result).toMatchObject({
			saved: false,
			settings: { enabled: false, cpuTargetPercent: 70 },
			lastDecision: null,
			controller: { running: true },
			available: true,
		});
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["read"] },
		);
	});

	it("needs edit and deploy permission to save, and audits it", async () => {
		await caller.updateAutoscaling({ target: application, settings });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["create"], deployment: ["create"] },
		);
		expect(mocks.saveAutoscalingPolicy).toHaveBeenCalledWith({
			target: application,
			settings,
			userId: "user-1",
		});
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				resourceType: "application",
				resourceId: "app-1",
			}),
		);
	});

	it("stops when the caller may not deploy", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new TRPCError({ code: "FORBIDDEN" }),
		);
		await expect(
			caller.updateAutoscaling({ target: application, settings }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.saveAutoscalingPolicy).not.toHaveBeenCalled();
	});

	it("refuses to turn it on for a global service, but lets it be saved off", async () => {
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			modeSwarm: { Global: {} },
		});
		await expect(
			caller.updateAutoscaling({ target: application, settings }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

		await caller.updateAutoscaling({
			target: application,
			settings: { ...settings, enabled: false },
		});
		expect(mocks.saveAutoscalingPolicy).toHaveBeenCalledTimes(1);
	});

	it("refuses a compose service that can run one container only", async () => {
		mocks.findComposeById.mockResolvedValue({ composeId: "c1", command: "" });
		mocks.getCachedComposeScalingStatus.mockResolvedValue({
			services: [
				{
					serviceName: "db",
					mode: "replicated",
					singleInstanceReasons: ["container_name is set"],
				},
			],
		});
		await expect(
			caller.updateAutoscaling({
				target: { kind: "compose", composeId: "c1", serviceName: "db" },
				settings,
			}),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining("container_name is set"),
		});
	});

	it("validates the settings", async () => {
		await expect(
			caller.updateAutoscaling({
				target: application,
				settings: { ...settings, minReplicas: 7 },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			caller.updateAutoscaling({
				target: application,
				settings: {
					...settings,
					cpuTargetPercent: null,
					memoryTargetPercent: null,
				},
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("is not offered on Dokploy Cloud", async () => {
		mocks.isCloud = true;
		await expect(
			caller.updateAutoscaling({ target: application, settings }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});
