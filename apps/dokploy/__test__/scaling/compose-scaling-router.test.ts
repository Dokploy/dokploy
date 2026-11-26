import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	checkPermission: vi.fn(),
	findComposeById: vi.fn(),
	getCachedComposeScalingStatus: vi.fn(),
	setComposeServiceReplicas: vi.fn(),
	getStackServiceCapacity: vi.fn(),
	findScalingEvents: vi.fn(),
	updateComposeServicePlacement: vi.fn(),
	switchComposeToStack: vi.fn(),
	readComposeSpecForSwitch: vi.fn(),
	checkStackCompatibility: vi.fn(),
	getComposeServiceMetrics: vi.fn(),
	installTaskMetricsAgent: vi.fn(),
	queueAdd: vi.fn(),
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
	return {
		ScaleRejectedError: scaleService.ScaleRejectedError,
		ScalingServerUnavailableError: status.ScalingServerUnavailableError,
		get IS_CLOUD() {
			return mocks.isCloud;
		},
		updateComposeServicePlacement: mocks.updateComposeServicePlacement,
		switchComposeToStack: mocks.switchComposeToStack,
		readComposeSpecForSwitch: mocks.readComposeSpecForSwitch,
		checkStackCompatibility: mocks.checkStackCompatibility,
		findComposeById: mocks.findComposeById,
		getCachedComposeScalingStatus: mocks.getCachedComposeScalingStatus,
		setComposeServiceReplicas: mocks.setComposeServiceReplicas,
		getStackServiceCapacity: mocks.getStackServiceCapacity,
		findScalingEvents: mocks.findScalingEvents,
		getComposeServiceMetrics: mocks.getComposeServiceMetrics,
		installTaskMetricsAgent: mocks.installTaskMetricsAgent,
		stackServiceName: (appName: string, service: string) =>
			`${appName}_${service}`,
	};
});

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: mocks.queueAdd },
}));

const { scalingRouter } = await import("@/server/api/routers/scaling");
const { ScaleRejectedError } = await import(
	"@dokploy/server/services/scaling/scale-service"
);

const caller = scalingRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof scalingRouter.createCaller>[0]);

const stack = {
	composeId: "compose-1",
	appName: "shop",
	name: "Shop",
	composeType: "stack",
};

describe("compose scaling router", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.isCloud = false;
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findComposeById.mockResolvedValue(stack);
	});

	it("checks service read access before reading status", async () => {
		mocks.getCachedComposeScalingStatus.mockResolvedValue({ services: [] });

		await expect(
			caller.composeStatus({ composeId: "compose-1" }),
		).resolves.toEqual({ services: [] });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["read"] },
		);
	});

	it("stops when the caller has no access to the compose", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new TRPCError({ code: "FORBIDDEN" }),
		);
		await expect(
			caller.setComposeReplicas({
				composeId: "compose-1",
				serviceName: "web",
				replicas: 2,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.setComposeServiceReplicas).not.toHaveBeenCalled();
	});

	it("requires deployment permission to scale and audits the change", async () => {
		mocks.setComposeServiceReplicas.mockResolvedValue({
			from: 1,
			to: 3,
			applied: true,
			note: null,
		});

		await caller.setComposeReplicas({
			composeId: "compose-1",
			serviceName: "web",
			replicas: 3,
			acknowledgeWarnings: true,
		});

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ deployment: ["create"] },
		);
		expect(mocks.setComposeServiceReplicas).toHaveBeenCalledWith({
			compose: stack,
			serviceName: "web",
			replicas: 3,
			userId: "user-1",
			acknowledgeWarnings: true,
		});
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				resourceType: "compose",
				resourceId: "compose-1",
				metadata: { service: "web", replicas: { from: 1, to: 3 } },
			}),
		);
	});

	it.each(["web; rm -rf /", "$(id)", "-p", ""])(
		"rejects the service name %j",
		async (serviceName) => {
			await expect(
				caller.setComposeReplicas({
					composeId: "compose-1",
					serviceName,
					replicas: 2,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(mocks.setComposeServiceReplicas).not.toHaveBeenCalled();
		},
	);

	it("rejects counts outside 1–100", async () => {
		for (const replicas of [0, 101, 1.5]) {
			await expect(
				caller.setComposeReplicas({
					composeId: "compose-1",
					serviceName: "web",
					replicas,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
	});

	it.each([
		["deployment_in_progress", "PRECONDITION_FAILED"],
		["replicas_stopped", "PRECONDITION_FAILED"],
		["custom_command", "PRECONDITION_FAILED"],
		["replicas_changed", "CONFLICT"],
	] as const)("maps %s to %s", async (reason, code) => {
		mocks.setComposeServiceReplicas.mockRejectedValue(
			new ScaleRejectedError(reason, "nope"),
		);
		await expect(
			caller.setComposeReplicas({
				composeId: "compose-1",
				serviceName: "api",
				replicas: 2,
			}),
		).rejects.toMatchObject({ code, message: "nope" });
	});

	it("rate-limits scaling per service", async () => {
		mocks.setComposeServiceReplicas.mockResolvedValue({
			from: 1,
			to: 2,
			applied: true,
			note: null,
		});
		const input = {
			composeId: "compose-1",
			serviceName: "worker",
			replicas: 2,
		};
		for (let i = 0; i < 10; i++) await caller.setComposeReplicas(input);

		await expect(caller.setComposeReplicas(input)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
		await expect(
			caller.setComposeReplicas({ ...input, serviceName: "worker-2" }),
		).resolves.toBeDefined();
	});

	it("estimates capacity only for stack services", async () => {
		mocks.getStackServiceCapacity.mockResolvedValue({
			fit: "fits",
			nodes: [{ hostname: "vm-1" }],
		});
		mocks.checkPermission.mockRejectedValue(new Error("no docker read"));

		await expect(
			caller.composeCapacity({
				composeId: "compose-1",
				serviceName: "web",
				replicas: 2,
			}),
		).resolves.toMatchObject({ nodes: [], nodeDetails: false });
		expect(mocks.getStackServiceCapacity).toHaveBeenCalledWith(
			stack,
			"shop_web",
			2,
		);

		mocks.findComposeById.mockResolvedValue({
			...stack,
			composeType: "docker-compose",
		});
		await expect(
			caller.composeCapacity({
				composeId: "compose-1",
				serviceName: "web",
				replicas: 2,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("lists history for the compose after a read check", async () => {
		mocks.findScalingEvents.mockResolvedValue({ events: [], total: 0 });

		await caller.composeEvents({ composeId: "compose-1", serviceName: "web" });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["read"] },
		);
		expect(mocks.findScalingEvents).toHaveBeenCalledWith({
			composeId: "compose-1",
			serviceName: "web",
			limit: 20,
			offset: 0,
		});
	});

	it("needs service configuration permission to save a stack placement", async () => {
		mocks.updateComposeServicePlacement.mockResolvedValue({
			nodeTarget: "pool",
		});
		await caller.updateComposePlacement({
			composeId: "compose-1",
			serviceName: "web",
			nodeTarget: "pool",
			hostname: null,
			pool: "eu",
			maxReplicasPerNode: 1,
		});
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["create"] },
		);
		expect(mocks.updateComposeServicePlacement).toHaveBeenCalledWith({
			compose: stack,
			serviceName: "web",
			placement: {
				nodeTarget: "pool",
				hostname: null,
				pool: "eu",
				nodeIds: [],
				maxReplicasPerNode: 1,
			},
			userId: "user-1",
		});
	});

	it("passes the chosen nodes of a stack service and requires at least one", async () => {
		mocks.updateComposeServicePlacement.mockResolvedValue({
			nodeTarget: "nodes",
		});
		await caller.updateComposePlacement({
			composeId: "compose-1",
			serviceName: "web",
			nodeTarget: "nodes",
			hostname: null,
			nodeIds: ["n1", "n2"],
			maxReplicasPerNode: 0,
		});
		expect(mocks.updateComposeServicePlacement).toHaveBeenCalledWith(
			expect.objectContaining({
				placement: expect.objectContaining({
					nodeTarget: "nodes",
					nodeIds: ["n1", "n2"],
				}),
			}),
		);

		await expect(
			caller.updateComposePlacement({
				composeId: "compose-1",
				serviceName: "web",
				nodeTarget: "nodes",
				hostname: null,
				nodeIds: [],
				maxReplicasPerNode: 0,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("requires a pool name when targeting a pool", async () => {
		await expect(
			caller.updateComposePlacement({
				composeId: "compose-1",
				serviceName: "web",
				nodeTarget: "pool",
				hostname: null,
				pool: null,
				maxReplicasPerNode: 0,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("switches to Stack and queues the first stack deploy", async () => {
		mocks.findComposeById.mockResolvedValue({
			...stack,
			composeType: "docker-compose",
			serverId: null,
		});
		mocks.switchComposeToStack.mockResolvedValue({ issues: [] });

		await caller.switchComposeToStack({
			composeId: "compose-1",
			acknowledgeWarnings: true,
		});

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["create"], deployment: ["create"] },
		);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				composeId: "compose-1",
				applicationType: "compose",
				type: "deploy",
			}),
			expect.anything(),
		);
	});

	it("does not queue a deploy when the switch is refused, nor run on Cloud", async () => {
		mocks.switchComposeToStack.mockRejectedValue(
			new ScaleRejectedError("incompatible", "Fix these first"),
		);
		await expect(
			caller.switchComposeToStack({ composeId: "compose-1" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mocks.queueAdd).not.toHaveBeenCalled();

		mocks.isCloud = true;
		await expect(
			caller.switchComposeToStack({ composeId: "compose-1" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mocks.switchComposeToStack).toHaveBeenCalledTimes(1);
	});

	it("reports stack compatibility after a read check", async () => {
		mocks.readComposeSpecForSwitch.mockResolvedValue(null);
		await expect(
			caller.composeStackCheck({ composeId: "compose-1" }),
		).resolves.toEqual({ readable: false, issues: [] });
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["read"] },
		);
	});

	it("needs monitoring access to read a service's replica metrics", async () => {
		mocks.getComposeServiceMetrics.mockResolvedValue({
			agent: { status: "ok", message: null },
			data: null,
		});

		await caller.composeMetrics({
			composeId: "compose-1",
			serviceName: "web",
			rangeMinutes: 15,
		});

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["read"], monitoring: ["read"] },
		);
		expect(mocks.getComposeServiceMetrics).toHaveBeenCalledWith(stack, "web", {
			rangeMinutes: 15,
		});
	});

	it("reports an unknown service as a precondition failure", async () => {
		mocks.getComposeServiceMetrics.mockRejectedValue(
			new ScaleRejectedError("unknown_service", "Service worker is not here."),
		);
		await expect(
			caller.composeMetrics({ composeId: "compose-1", serviceName: "worker" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("installs the metrics agent for the compose's server with server permission", async () => {
		mocks.installTaskMetricsAgent.mockResolvedValue(undefined);

		await caller.setupComposeMetricsAgent({ composeId: "compose-1" });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			{ service: ["read"], server: ["create"] },
		);
		expect(mocks.installTaskMetricsAgent).toHaveBeenCalledWith(stack);
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ resourceType: "server" }),
		);
	});

	it("leaves the agent to Dokploy Cloud", async () => {
		mocks.isCloud = true;
		await expect(
			caller.setupComposeMetricsAgent({ composeId: "compose-1" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(mocks.installTaskMetricsAgent).not.toHaveBeenCalled();
	});
});
