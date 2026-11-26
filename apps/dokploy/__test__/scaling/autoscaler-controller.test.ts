import type { AutoscalingPolicy } from "@dokploy/server/db/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	applicationStatus: vi.fn(),
	composeStatus: vi.fn(),
	applicationMetrics: vi.fn(),
	composeMetrics: vi.fn(),
	applicationCapacity: vi.fn(),
	stackCapacity: vi.fn(),
	setApplicationReplicas: vi.fn(),
	setComposeServiceReplicas: vi.fn(),
	recordScalingEvent: vi.fn(),
	saveEvaluation: vi.fn(),
	listEnabledPolicies: vi.fn(),
	recordControllerHeartbeat: vi.fn(),
	acquireAdvisoryLock: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));
vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mocks.findComposeById,
}));
vi.mock("@dokploy/server/services/scaling/status", () => ({
	getApplicationScalingStatus: mocks.applicationStatus,
}));
vi.mock("@dokploy/server/services/scaling/compose-status", () => ({
	getComposeScalingStatus: mocks.composeStatus,
	stackServiceName: (appName: string, service: string) =>
		`${appName}_${service}`,
}));
vi.mock("@dokploy/server/services/scaling/metrics-client", () => ({
	getApplicationMetrics: mocks.applicationMetrics,
	getComposeServiceMetrics: mocks.composeMetrics,
}));
vi.mock("@dokploy/server/services/scaling/capacity-service", () => ({
	getApplicationCapacity: mocks.applicationCapacity,
	getStackServiceCapacity: mocks.stackCapacity,
}));
vi.mock("@dokploy/server/services/scaling/manual-scale", () => ({
	setApplicationReplicas: mocks.setApplicationReplicas,
}));
vi.mock("@dokploy/server/services/scaling/compose-scale", () => ({
	setComposeServiceReplicas: mocks.setComposeServiceReplicas,
}));
vi.mock("@dokploy/server/services/scaling/events", () => ({
	recordScalingEvent: mocks.recordScalingEvent,
}));
vi.mock(
	"@dokploy/server/services/scaling/autoscaling-policy",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/autoscaling-policy")
		>()),
		saveEvaluation: mocks.saveEvaluation,
		listEnabledPolicies: mocks.listEnabledPolicies,
		recordControllerHeartbeat: mocks.recordControllerHeartbeat,
	}),
);
vi.mock("@dokploy/server/services/scaling/advisory-lock", () => ({
	acquireAdvisoryLock: mocks.acquireAdvisoryLock,
	isAdvisoryLockHeld: vi.fn(async () => false),
}));

const { evaluatePolicy, runAutoscaler, runControllerTick } = await import(
	"@dokploy/server/services/scaling/autoscaler-controller"
);

const NOW = Date.parse("2026-11-03T12:00:00Z");

const policy = (
	overrides: Partial<AutoscalingPolicy> = {},
): AutoscalingPolicy =>
	({
		autoscalingPolicyId: "p1",
		applicationId: "app-1",
		composeId: null,
		serviceName: null,
		enabled: true,
		minReplicas: 1,
		maxReplicas: 6,
		cpuTargetPercent: 50,
		memoryTargetPercent: null,
		tolerancePercent: 10,
		evaluationIntervalSeconds: 30,
		scaleUpWindowSeconds: 0,
		scaleDownWindowSeconds: 300,
		cooldownSeconds: 60,
		maxScaleUpStep: 4,
		maxScaleDownStep: 1,
		state: null,
		lastEvaluatedAt: null,
		lastScaledAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}) as AutoscalingPolicy;

const summary = (ready: number, extra: Record<string, unknown> = {}) => ({
	replicas: [],
	recentFailures: [],
	counts: { ready, starting: 0, pending: 0, stopping: 0, failedRecent: 0 },
	pendingReasons: [],
	distribution: [],
	...extra,
});

const appStatus = (overrides: Record<string, unknown> = {}) => ({
	...summary(2),
	deployed: true,
	mode: "replicated",
	configured: 2,
	desired: 2,
	stopped: false,
	inSync: true,
	rolloutInProgress: false,
	...overrides,
});

const metrics = (cpuPercent: number | null, fresh = 2, ready = 2) => ({
	agent: { status: "ok", message: null },
	data: {
		summary: {
			averages: { cpuPercent, memoryPercent: null },
			coverage: { ready, fresh },
		},
	},
});

describe("evaluatePolicy", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "web",
			applicationStatus: "done",
		});
		mocks.applicationStatus.mockResolvedValue(appStatus());
		mocks.applicationCapacity.mockResolvedValue({ placeable: null });
		mocks.setApplicationReplicas.mockResolvedValue({ applied: true });
		mocks.recordScalingEvent.mockResolvedValue({});
		mocks.saveEvaluation.mockResolvedValue(undefined);
	});

	it("scales a busy application through the scale path, as the autoscaler", async () => {
		mocks.applicationMetrics.mockResolvedValue(metrics(100));

		const out = await evaluatePolicy(policy(), NOW);

		expect(out.decision).toMatchObject({ action: "scale_up", target: 4 });
		expect(mocks.setApplicationReplicas).toHaveBeenCalledWith(
			expect.objectContaining({
				replicas: 4,
				userId: null,
				trigger: expect.objectContaining({
					source: "autoscaler",
					reason: expect.stringContaining("CPU 100%"),
				}),
			}),
		);
		expect(mocks.saveEvaluation).toHaveBeenCalledWith("p1", {
			state: expect.objectContaining({ lastDecision: out.decision }),
			evaluatedAt: new Date(NOW),
			scaledAt: new Date(NOW),
		});
	});

	it("gives the scale path a guard to run under the scale lock", async () => {
		mocks.applicationMetrics.mockResolvedValue(metrics(100));

		await evaluatePolicy(policy(), NOW);

		expect(mocks.setApplicationReplicas).toHaveBeenCalledWith(
			expect.objectContaining({ guard: expect.any(Function) }),
		);
	});

	it("caps a scale-up at what fits and says so", async () => {
		mocks.applicationMetrics.mockResolvedValue(metrics(150));
		mocks.applicationCapacity.mockResolvedValue({ placeable: 3 });

		const out = await evaluatePolicy(policy(), NOW);

		expect(mocks.setApplicationReplicas).toHaveBeenCalledWith(
			expect.objectContaining({ replicas: 3 }),
		);
		expect(out.decision.reason).toContain("only 3 replicas fit");
	});

	it("holds, and records it once, when nothing more fits", async () => {
		mocks.applicationMetrics.mockResolvedValue(metrics(150));
		mocks.applicationCapacity.mockResolvedValue({ placeable: 2 });

		const first = await evaluatePolicy(policy(), NOW);
		expect(first.decision.action).toBe("hold");
		expect(mocks.setApplicationReplicas).not.toHaveBeenCalled();
		expect(mocks.recordScalingEvent).toHaveBeenCalledTimes(1);

		// The readings, and so the reason, differ; the problem does not.
		mocks.applicationMetrics.mockResolvedValue(metrics(170));
		await evaluatePolicy(policy({ state: first.state }), NOW + 30_000);
		expect(mocks.recordScalingEvent).toHaveBeenCalledTimes(1);

		mocks.applicationCapacity.mockResolvedValue({ placeable: null });
		const recovered = await evaluatePolicy(
			policy({ state: first.state }),
			NOW + 60_000,
		);
		expect(recovered.state.lastEventKey).toBeNull();
	});

	it("does not read metrics while a deployment runs", async () => {
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "web",
			applicationStatus: "running",
		});

		const out = await evaluatePolicy(policy(), NOW);

		expect(out.decision).toMatchObject({
			action: "hold",
			reason: "A deployment is in progress",
		});
		expect(mocks.applicationMetrics).not.toHaveBeenCalled();
		expect(mocks.recordScalingEvent).not.toHaveBeenCalled();
	});

	it("waits while replicas start", async () => {
		mocks.applicationStatus.mockResolvedValue(
			appStatus({
				counts: {
					ready: 1,
					starting: 1,
					pending: 0,
					stopping: 0,
					failedRecent: 0,
				},
			}),
		);
		mocks.applicationMetrics.mockResolvedValue(metrics(150));

		const out = await evaluatePolicy(policy(), NOW);

		expect(out.decision.reason).toContain("1 of 2 replicas are ready");
		expect(mocks.setApplicationReplicas).not.toHaveBeenCalled();
	});

	it("logs changes and new problems, and every evaluation only for debug", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		try {
			mocks.applicationMetrics.mockResolvedValue(metrics(100));
			await evaluatePolicy(policy(), NOW);
			expect(log).toHaveBeenCalledWith(
				expect.stringMatching(/^Autoscaler: web: scale_up 2 -> 4: CPU 100%/),
			);

			mocks.applicationMetrics.mockResolvedValue(metrics(150));
			mocks.applicationCapacity.mockResolvedValue({ placeable: 2 });
			const held = await evaluatePolicy(policy(), NOW);
			await evaluatePolicy(policy({ state: held.state }), NOW + 30_000);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining("Autoscaler: web: hold:"),
			);

			log.mockClear();
			mocks.applicationMetrics.mockResolvedValue(metrics(50));
			await evaluatePolicy(policy(), NOW);
			expect(log).not.toHaveBeenCalled();
			vi.stubEnv("DOKPLOY_AUTOSCALER_LOG", "debug");
			await evaluatePolicy(policy(), NOW);
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining("Autoscaler: web: hold at 2:"),
			);
		} finally {
			vi.unstubAllEnvs();
			log.mockRestore();
			warn.mockRestore();
		}
	});

	it("explains an agent that is not set up, once", async () => {
		mocks.applicationMetrics.mockResolvedValue({
			agent: { status: "not_configured", message: null },
			data: null,
		});

		const first = await evaluatePolicy(policy(), NOW);
		expect(first.decision.reason).toContain("Enable replica metrics");
		await evaluatePolicy(policy({ state: first.state }), NOW + 30_000);

		expect(mocks.recordScalingEvent).toHaveBeenCalledTimes(1);
		expect(mocks.recordScalingEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "app-1",
				source: "autoscaler",
				action: "hold",
			}),
		);
	});

	it("records a failed scale as a hold with the reason", async () => {
		mocks.applicationMetrics.mockResolvedValue(metrics(100));
		mocks.setApplicationReplicas.mockRejectedValue(
			new Error("update out of sequence"),
		);

		const out = await evaluatePolicy(policy(), NOW);

		expect(out.decision).toMatchObject({
			action: "hold",
			reason: "Could not scale to 4: update out of sequence",
		});
		expect(mocks.saveEvaluation).toHaveBeenCalledWith(
			"p1",
			expect.objectContaining({ scaledAt: null }),
		);
	});

	it("records an evaluation that throws as an error", async () => {
		mocks.findApplicationById.mockRejectedValue(
			new Error("Application not found"),
		);

		const out = await evaluatePolicy(policy(), NOW);

		expect(out.decision).toMatchObject({
			action: "error",
			reason: "Evaluation failed: Application not found",
		});
		expect(mocks.recordScalingEvent).toHaveBeenCalledWith(
			expect.objectContaining({ action: "error" }),
		);
	});

	it("scales a plain Docker Compose service without a capacity limit", async () => {
		mocks.findComposeById.mockResolvedValue({
			composeId: "c1",
			appName: "shop",
			composeType: "docker-compose",
			composeStatus: "done",
			command: "",
		});
		mocks.composeStatus.mockResolvedValue({
			services: [
				{
					...summary(1),
					serviceName: "web",
					mode: "replicated",
					deployed: true,
					configured: 1,
					desired: 1,
					stopped: false,
					rolloutInProgress: false,
					singleInstanceReasons: [],
				},
			],
		});
		mocks.composeMetrics.mockResolvedValue(metrics(150, 1, 1));
		mocks.setComposeServiceReplicas.mockResolvedValue({ applied: true });

		await evaluatePolicy(
			policy({ applicationId: null, composeId: "c1", serviceName: "web" }),
			NOW,
		);

		expect(mocks.stackCapacity).not.toHaveBeenCalled();
		expect(mocks.setComposeServiceReplicas).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceName: "web",
				replicas: 3,
				trigger: expect.objectContaining({ source: "autoscaler" }),
			}),
		);
	});

	it("holds a compose service that can run one container only", async () => {
		mocks.findComposeById.mockResolvedValue({
			composeId: "c1",
			appName: "shop",
			composeType: "docker-compose",
			composeStatus: "done",
			command: "",
		});
		mocks.composeStatus.mockResolvedValue({
			services: [
				{
					...summary(1),
					serviceName: "db",
					mode: "replicated",
					deployed: true,
					configured: 1,
					desired: 1,
					stopped: false,
					rolloutInProgress: false,
					singleInstanceReasons: ["container_name is set"],
				},
			],
		});

		const out = await evaluatePolicy(
			policy({ applicationId: null, composeId: "c1", serviceName: "db" }),
			NOW,
		);

		expect(out.decision.reason).toContain("container_name is set");
		expect(mocks.composeMetrics).not.toHaveBeenCalled();
	});
});

describe("runControllerTick", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.findApplicationById.mockRejectedValue(new Error("gone"));
		mocks.saveEvaluation.mockResolvedValue(undefined);
		mocks.recordScalingEvent.mockResolvedValue({});
	});

	it("evaluates only the policies whose interval has passed", async () => {
		mocks.listEnabledPolicies.mockResolvedValue([
			policy({ autoscalingPolicyId: "due", lastEvaluatedAt: null }),
			policy({
				autoscalingPolicyId: "recent",
				lastEvaluatedAt: new Date(NOW - 10_000),
			}),
			policy({
				autoscalingPolicyId: "old",
				lastEvaluatedAt: new Date(NOW - 31_000),
			}),
		]);

		const count = await runControllerTick({ now: () => NOW });

		expect(count).toBe(2);
		expect(mocks.saveEvaluation.mock.calls.map(([id]) => id).sort()).toEqual([
			"due",
			"old",
		]);
	});
});

describe("runAutoscaler", () => {
	it("stands by without evaluating while another process leads", async () => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.acquireAdvisoryLock.mockResolvedValue(null);
		const stop = new AbortController();
		const alive = vi.fn(() => stop.abort());

		await runAutoscaler({
			version: "test",
			signal: stop.signal,
			onAlive: alive,
		});

		expect(alive).toHaveBeenCalled();
		expect(mocks.recordControllerHeartbeat).not.toHaveBeenCalled();
		expect(mocks.listEnabledPolicies).not.toHaveBeenCalled();
	});

	it("leads: beats, evaluates, and releases the lock when stopped", async () => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		const release = vi.fn(async () => {});
		mocks.acquireAdvisoryLock.mockResolvedValue({
			release,
			isHeld: async () => true,
		});
		mocks.listEnabledPolicies.mockResolvedValue([]);
		const stop = new AbortController();
		mocks.recordControllerHeartbeat.mockImplementation(async () => {
			stop.abort();
		});

		await runAutoscaler({ version: "test", signal: stop.signal, tickMs: 1 });

		expect(mocks.recordControllerHeartbeat).toHaveBeenCalledWith(
			expect.objectContaining({ version: "test" }),
		);
		expect(mocks.listEnabledPolicies).toHaveBeenCalled();
		expect(release).toHaveBeenCalled();
	});
});
