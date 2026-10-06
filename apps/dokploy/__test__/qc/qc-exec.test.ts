import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	cancelQcRun: vi.fn(),
	getQcManifest: vi.fn(),
	getQcTestBundle: vi.fn(),
	postQcExecResult: vi.fn(),
	waitForQcRun: vi.fn(),
	runGeneratedTests: vi.fn(),
}));

vi.mock("@dokploy/server/services/qc-service-client", () => ({
	cancelQcRun: mocks.cancelQcRun,
	getQcManifest: mocks.getQcManifest,
	getQcTestBundle: mocks.getQcTestBundle,
	postQcExecResult: mocks.postQcExecResult,
	waitForQcRun: mocks.waitForQcRun,
}));
vi.mock("@dokploy/server/utils/builders/run-generated-tests", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/builders/run-generated-tests")
	>("@dokploy/server/utils/builders/run-generated-tests");
	return { ...actual, runGeneratedTests: mocks.runGeneratedTests };
});

import { runQcGeneratedTests } from "@dokploy/server/services/qc-exec";

const manifest = {
	language: "python",
	files: ["qc_generated/test_a.py"],
	scenarios: ["S-1", "S-2"],
};
const application = (policy: "open" | "closed" = "closed") =>
	({
		appName: "app",
		testRunnerImage: null,
		testExecFailurePolicy: policy,
	}) as never;
const awaiting = {
	verdict: "ready",
	testPlanVersion: 1,
	runId: "run1",
	awaitingExec: true,
};

const triageRun = (verdict: string, output: Record<string, unknown> = {}) => ({
	runId: "run1",
	status: "done",
	verdict,
	error: null,
	stages: [{ stage: "triage", status: "ok", output: { verdict, ...output } }],
});

describe("runQcGeneratedTests", () => {
	const logs: string[] = [];
	const call = (
		policy: "open" | "closed" = "closed",
		qcResult: object = awaiting,
	) =>
		runQcGeneratedTests({
			application: application(policy),
			qcResult: qcResult as never,
			deploymentId: "dep1",
			serverId: null,
			log: async (message) => {
				logs.push(message);
			},
		});

	beforeEach(() => {
		vi.clearAllMocks();
		logs.length = 0;
		mocks.getQcManifest.mockResolvedValue(manifest);
		mocks.getQcTestBundle.mockResolvedValue(Buffer.from("bundle"));
		mocks.runGeneratedTests.mockResolvedValue({
			exitCode: 0,
			durationSec: 2,
			logTail: "ok",
		});
		mocks.postQcExecResult.mockResolvedValue(undefined);
		mocks.cancelQcRun.mockResolvedValue(undefined);
		mocks.waitForQcRun.mockResolvedValue(
			triageRun("pass", {
				headline: "all 2 tests passed",
				passed: 2,
				failed: 0,
				skipped: 0,
			}),
		);
	});

	it("runs the tests, reports them and records a pass", async () => {
		const outcome = await call();

		expect(mocks.runGeneratedTests).toHaveBeenCalledWith(
			expect.objectContaining({
				deploymentId: "dep1",
				appName: "app",
				bundle: Buffer.from("bundle"),
			}),
		);
		expect(mocks.postQcExecResult).toHaveBeenCalledWith("run1", {
			exitCode: 0,
			durationSec: 2,
			logTail: "ok",
		});
		expect(outcome).toMatchObject({ status: "passed", exitCode: 0 });
		expect(outcome.blockDeploy).toBeUndefined();
		expect(outcome.summary).toMatchObject({
			source: "generated",
			verdict: "pass",
			passed: 2,
			failed: 0,
		});
		expect(outcome.stages).toEqual([
			{
				stage: "triage",
				status: "ok",
				output: expect.objectContaining({ verdict: "pass" }),
			},
		]);
		expect(logs.at(-1)).toContain("ok: all 2 tests passed");
		expect(mocks.cancelQcRun).not.toHaveBeenCalled();
	});

	it("blocks the deploy when tests fail under the closed policy", async () => {
		mocks.runGeneratedTests.mockResolvedValue({
			exitCode: 1,
			durationSec: 2,
			logTail: "x",
		});
		mocks.waitForQcRun.mockResolvedValue(
			triageRun("fail", {
				headline: "1 of 2 tests failed",
				passed: 1,
				failed: 1,
				failures: ["S-2 x"],
			}),
		);
		const outcome = await call("closed");

		expect(outcome.status).toBe("failed");
		expect(outcome.exitCode).toBe(1);
		expect(outcome.blockDeploy?.message).toContain("1 of 2 tests failed");
		expect(outcome.summary.failures).toEqual(["S-2 x"]);
		expect(logs.at(-1)).toContain("FAILED");
	});

	it("lets the deploy continue when tests fail under the open policy", async () => {
		mocks.waitForQcRun.mockResolvedValue(
			triageRun("fail", { headline: "1 of 2 tests failed" }),
		);
		const outcome = await call("open");
		expect(outcome.status).toBe("failed");
		expect(outcome.blockDeploy).toBeUndefined();
	});

	it("reports failures judged not to be application bugs, without blocking even when closed", async () => {
		mocks.runGeneratedTests.mockResolvedValue({
			exitCode: 1,
			durationSec: 2,
			logTail: "x",
		});
		mocks.waitForQcRun.mockResolvedValue(
			triageRun("warn", {
				headline:
					"2 failing test(s), none judged an application bug: 2 test bug",
				passed: 3,
				failed: 2,
				categories: { test_bug: 2 },
				details: [
					{ name: "S-2 x", category: "test_bug", reason: "README.md:4 says 2" },
				],
			}),
		);
		const outcome = await call("closed");

		expect(outcome.status).toBe("failed");
		expect(outcome.exitCode).toBe(1);
		expect(outcome.blockDeploy).toBeUndefined();
		expect(outcome.summary).toMatchObject({
			verdict: "warn",
			failed: 2,
			categories: { test_bug: 2 },
		});
		expect(outcome.summary.details?.[0]).toMatchObject({
			name: "S-2 x",
			category: "test_bug",
		});
		expect(logs.at(-1)).toContain("WARNING");
	});

	it("still blocks when the service found an application bug", async () => {
		mocks.waitForQcRun.mockResolvedValue(
			triageRun("fail", {
				headline: "1 failing test(s): 1 code bug",
				failed: 1,
				categories: { code_bug: 1 },
			}),
		);
		const outcome = await call("closed");
		expect(outcome.status).toBe("failed");
		expect(outcome.blockDeploy?.message).toContain("1 code bug");
	});

	it("records a 'no tests executed' warning as skipped, not as a failure", async () => {
		mocks.waitForQcRun.mockResolvedValue(
			triageRun("warn", { headline: "no tests were executed" }),
		);
		const outcome = await call("closed");
		expect(outcome.status).toBe("skipped");
		expect(outcome.blockDeploy).toBeUndefined();
	});

	it("treats a run the service could not finish as a failure", async () => {
		mocks.waitForQcRun.mockResolvedValue({
			runId: "run1",
			status: "failed",
			verdict: "fail",
			error: { code: "stage_failed", message: "triage: boom" },
			stages: [],
		});
		const outcome = await call("closed");
		expect(outcome.status).toBe("failed");
		expect(outcome.blockDeploy?.message).toContain("triage: boom");
	});

	it("when the tests cannot be run, applies the policy and cancels the service run", async () => {
		mocks.runGeneratedTests.mockRejectedValue(new Error("docker not found"));

		const closed = await call("closed");
		expect(closed.status).toBe("skipped");
		expect(closed.summary).toMatchObject({ verdict: "error" });
		expect(closed.blockDeploy?.message).toContain("docker not found");
		expect(mocks.postQcExecResult).not.toHaveBeenCalled();
		expect(mocks.cancelQcRun).toHaveBeenCalledWith("run1");

		const open = await call("open");
		expect(open.blockDeploy).toBeUndefined();
	});

	it("cancels the run when the bundle fails its checksum", async () => {
		mocks.getQcTestBundle.mockRejectedValue(new Error("checksum"));
		const outcome = await call("open");
		expect(outcome.summary.headline).toContain("checksum");
		expect(mocks.runGeneratedTests).not.toHaveBeenCalled();
		expect(mocks.cancelQcRun).toHaveBeenCalledWith("run1");
	});

	it("does not cancel a run whose results were reported, even if triage then fails to be read", async () => {
		mocks.waitForQcRun.mockRejectedValue(new Error("timed out"));
		const outcome = await call("open");
		expect(outcome.status).toBe("skipped");
		expect(mocks.cancelQcRun).not.toHaveBeenCalled();
	});

	it("skips quietly when the service has no tests for this commit", async () => {
		const outcome = await call("closed", {
			verdict: "ready",
			testPlanVersion: 1,
			runId: "run1",
			awaitingExec: false,
		});
		expect(outcome).toMatchObject({ status: "skipped", exitCode: null });
		expect(outcome.blockDeploy).toBeUndefined();
		expect(mocks.getQcManifest).not.toHaveBeenCalled();
		expect(logs[0]).toContain("no tests to generate");
	});

	it("skips with the QC step's reason when the step itself did not work", async () => {
		const outcome = await call("closed", {
			verdict: "error",
			testPlanVersion: 0,
			reason: "service unreachable",
		});
		expect(outcome.status).toBe("skipped");
		expect(outcome.summary.headline).toBe("service unreachable");
		expect(outcome.blockDeploy).toBeUndefined();
	});
});
