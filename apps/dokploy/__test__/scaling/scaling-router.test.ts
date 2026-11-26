import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	checkPermission: vi.fn(),
	findApplicationById: vi.fn(),
	getCachedApplicationScalingStatus: vi.fn(),
	setApplicationReplicas: vi.fn(),
	findScalingEvents: vi.fn(),
	getApplicationCapacity: vi.fn(),
	getScalingSettings: vi.fn(),
	updateRolloutSettings: vi.fn(),
	updatePlacementSettings: vi.fn(),
	getApplicationMetrics: vi.fn(),
	installTaskMetricsAgent: vi.fn(),
	isCloud: false,
	audit: vi.fn(),
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
	return {
		ScaleRejectedError: scaleService.ScaleRejectedError,
		ScalingServerUnavailableError: status.ScalingServerUnavailableError,
		findApplicationById: mocks.findApplicationById,
		getCachedApplicationScalingStatus: mocks.getCachedApplicationScalingStatus,
		setApplicationReplicas: mocks.setApplicationReplicas,
		findScalingEvents: mocks.findScalingEvents,
		getApplicationCapacity: mocks.getApplicationCapacity,
		getScalingSettings: mocks.getScalingSettings,
		updateRolloutSettings: mocks.updateRolloutSettings,
		updatePlacementSettings: mocks.updatePlacementSettings,
		getApplicationMetrics: mocks.getApplicationMetrics,
		installTaskMetricsAgent: mocks.installTaskMetricsAgent,
		get IS_CLOUD() {
			return mocks.isCloud;
		},
	};
});

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

const { scalingRouter } = await import("@/server/api/routers/scaling");
const { ScaleRejectedError } = await import(
	"@dokploy/server/services/scaling/scale-service"
);

const caller = scalingRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof scalingRouter.createCaller>[0]);

const app = { applicationId: "app-1", appName: "web-app" };

describe("scaling router", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.isCloud = false;
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findApplicationById.mockResolvedValue(app);
	});

	it("checks service read access before reading replica status", async () => {
		mocks.getCachedApplicationScalingStatus.mockResolvedValue({ desired: 2 });

		await expect(caller.status({ applicationId: "app-1" })).resolves.toEqual({
			desired: 2,
		});
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["read"] },
		);
	});

	it("stops when the caller has no access to the service", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this service",
			}),
		);

		await expect(
			caller.status({ applicationId: "app-other-org" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(
			caller.setReplicas({ applicationId: "app-other-org", replicas: 3 }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(
			caller.events({ applicationId: "app-other-org" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.findApplicationById).not.toHaveBeenCalled();
		expect(mocks.setApplicationReplicas).not.toHaveBeenCalled();
		expect(mocks.findScalingEvents).not.toHaveBeenCalled();
	});

	it("requires deployment permission to scale and audits the change", async () => {
		mocks.setApplicationReplicas.mockResolvedValue({
			from: 2,
			to: 3,
			applied: true,
			note: null,
		});

		await caller.setReplicas({ applicationId: "app-1", replicas: 3 });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ deployment: ["create"] },
		);
		expect(mocks.setApplicationReplicas).toHaveBeenCalledWith({
			application: app,
			replicas: 3,
			userId: "user-1",
			acknowledgeWarnings: undefined,
		});
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "update",
				resourceId: "app-1",
				metadata: { replicas: { from: 2, to: 3 } },
			}),
		);
	});

	it.each([0, 101, 1.5])("rejects replica count %s", async (replicas) => {
		await expect(
			caller.setReplicas({ applicationId: "app-1", replicas }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.setApplicationReplicas).not.toHaveBeenCalled();
	});

	it.each([
		["rollout_in_progress", "PRECONDITION_FAILED"],
		["unsupported_mode", "PRECONDITION_FAILED"],
		["replicas_changed", "CONFLICT"],
		["insufficient_capacity", "PRECONDITION_FAILED"],
	] as const)("maps %s to %s", async (reason, code) => {
		mocks.setApplicationReplicas.mockRejectedValue(
			new ScaleRejectedError(reason, "rejected"),
		);

		await expect(
			caller.setReplicas({ applicationId: `app-${reason}`, replicas: 3 }),
		).rejects.toMatchObject({ code, message: "rejected" });
	});

	it("rate-limits manual scaling per application", async () => {
		mocks.setApplicationReplicas.mockResolvedValue({
			from: 1,
			to: 2,
			applied: true,
			note: null,
		});

		for (let i = 0; i < 10; i++) {
			await caller.setReplicas({ applicationId: "app-busy", replicas: 2 });
		}
		await expect(
			caller.setReplicas({ applicationId: "app-busy", replicas: 2 }),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		await expect(
			caller.setReplicas({ applicationId: "app-quiet", replicas: 2 }),
		).resolves.toBeDefined();
	});

	it("passes an explicit capacity acknowledgement through", async () => {
		mocks.setApplicationReplicas.mockResolvedValue({
			from: 2,
			to: 6,
			applied: true,
			note: null,
		});

		await caller.setReplicas({
			applicationId: "app-ack",
			replicas: 6,
			acknowledgeWarnings: true,
		});

		expect(mocks.setApplicationReplicas).toHaveBeenCalledWith(
			expect.objectContaining({ acknowledgeWarnings: true }),
		);
	});

	it("returns per-node capacity only to callers with Docker read access", async () => {
		const nodes = [{ id: "node-1", hostname: "app-1" }];
		mocks.getApplicationCapacity.mockResolvedValue({ fit: "fits", nodes });

		mocks.checkPermission.mockResolvedValue(undefined);
		await expect(
			caller.capacity({ applicationId: "app-1", replicas: 2 }),
		).resolves.toMatchObject({ nodes, nodeDetails: true });
		expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			docker: ["read"],
		});

		mocks.checkPermission.mockRejectedValue(
			new TRPCError({ code: "UNAUTHORIZED", message: "no docker access" }),
		);
		await expect(
			caller.capacity({ applicationId: "app-1", replicas: 2 }),
		).resolves.toMatchObject({ fit: "fits", nodes: [], nodeDetails: false });
	});

	it("estimates capacity and reads settings after a read check", async () => {
		mocks.getApplicationCapacity.mockResolvedValue({ fit: "fits" });
		mocks.getScalingSettings.mockReturnValue({ rollout: {} });

		await caller.capacity({ applicationId: "app-1", replicas: 4 });
		await caller.settings({ applicationId: "app-1" });

		expect(mocks.getApplicationCapacity).toHaveBeenCalledWith(app, 4);
		expect(mocks.getScalingSettings).toHaveBeenCalledWith(app);
		for (const call of mocks.checkServicePermissionAndAccess.mock.calls) {
			expect(call[2]).toEqual({ service: ["read"] });
		}
	});

	it("requires service configuration permission to change rollout and placement", async () => {
		await caller.updateRollout({
			applicationId: "app-1",
			strategy: "stop-first",
			batchSize: 2,
			delaySeconds: 0,
			monitorSeconds: 10,
			failureAction: "rollback",
			maxFailureRatioPercent: 0,
		});
		await caller.updatePlacement({
			applicationId: "app-1",
			nodeTarget: "node",
			hostname: "app-2",
			maxReplicasPerNode: 1,
		});

		for (const call of mocks.checkServicePermissionAndAccess.mock.calls) {
			expect(call[2]).toEqual({ service: ["create"] });
		}
		expect(mocks.updateRolloutSettings).toHaveBeenCalledWith({
			applicationId: "app-1",
			settings: {
				strategy: "stop-first",
				batchSize: 2,
				delaySeconds: 0,
				monitorSeconds: 10,
				failureAction: "rollback",
				maxFailureRatioPercent: 0,
			},
			userId: "user-1",
		});
		expect(mocks.updatePlacementSettings).toHaveBeenCalledWith({
			application: app,
			selection: {
				nodeTarget: "node",
				hostname: "app-2",
				pool: null,
				nodeIds: [],
				maxReplicasPerNode: 1,
			},
			userId: "user-1",
		});
		expect(mocks.audit).toHaveBeenCalledTimes(2);
	});

	it("rejects invalid rollout and placement input", async () => {
		await expect(
			caller.updateRollout({
				applicationId: "app-1",
				strategy: "start-first",
				batchSize: 1,
				delaySeconds: 0,
				monitorSeconds: 0,
				failureAction: "rollback",
				maxFailureRatioPercent: 0,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			caller.updatePlacement({
				applicationId: "app-1",
				nodeTarget: "node",
				hostname: null,
				maxReplicasPerNode: 0,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.updateRolloutSettings).not.toHaveBeenCalled();
		expect(mocks.updatePlacementSettings).not.toHaveBeenCalled();
	});

	it("needs service and monitoring read access for replica metrics", async () => {
		mocks.getApplicationMetrics.mockResolvedValue({
			agent: { status: "ok", message: null },
			data: null,
		});

		await caller.metrics({ applicationId: "app-1", rangeMinutes: 15 });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["read"], monitoring: ["read"] },
		);
		expect(mocks.getApplicationMetrics).toHaveBeenCalledWith(app, {
			rangeMinutes: 15,
		});
		await expect(
			caller.metrics({ applicationId: "app-1", rangeMinutes: 1 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("needs server permission to deploy the metrics agent", async () => {
		await caller.setupMetricsAgent({ applicationId: "app-1" });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["read"], server: ["create"] },
		);
		expect(mocks.installTaskMetricsAgent).toHaveBeenCalledWith(app);
		expect(mocks.audit).toHaveBeenCalled();
	});

	it("leaves the metrics agent to Dokploy Cloud", async () => {
		mocks.isCloud = true;

		await expect(
			caller.setupMetricsAgent({ applicationId: "app-1" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mocks.installTaskMetricsAgent).not.toHaveBeenCalled();
	});

	it("lists scaling history after a read check", async () => {
		mocks.findScalingEvents.mockResolvedValue({ events: [], total: 0 });

		await caller.events({ applicationId: "app-1", limit: 5, offset: 10 });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			{ service: ["read"] },
		);
		expect(mocks.findScalingEvents).toHaveBeenCalledWith({
			applicationId: "app-1",
			limit: 5,
			offset: 10,
		});
	});
});
