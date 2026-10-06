import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	recordVersion: vi.fn(),
	updateApplication: vi.fn(),
	findApplicationById: vi.fn(),
	claim: vi.fn(),
	createRun: vi.fn(),
	waitForRun: vi.fn(),
	getPlan: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	updateApplication: mocks.updateApplication,
	findApplicationById: mocks.findApplicationById,
	claimTestPlanGeneration: mocks.claim,
}));
vi.mock("@dokploy/server/services/test-plan-history", () => ({
	recordTestPlanVersion: mocks.recordVersion,
}));
vi.mock("@dokploy/server/services/qc-service-client", () => ({
	QC_SERVICE_TIMEOUT_MS: 10_000,
	createQcRun: mocks.createRun,
	waitForQcRun: mocks.waitForRun,
	getQcPlanMarkdown: mocks.getPlan,
}));

import {
	getQcRepoSource,
	isTestPlanGenerating,
	QC_STALE_AFTER_MS,
	regenerateTestPlanInBackground,
	runQcStep,
} from "@dokploy/server/services/qc-step";

const SHA = "a".repeat(40);

const app = (overrides: Record<string, unknown> = {}) =>
	({
		applicationId: "app1",
		name: "app",
		qcEnabled: true,
		qcFailurePolicy: "open",
		testPlanVersion: 0,
		testPlanStatus: "none",
		testPlanStartedAt: null,
		testPlanError: null,
		sourceType: "github",
		owner: "o",
		repository: "r",
		branch: "main",
		...overrides,
	}) as never;

const setStoredApp = (overrides: Record<string, unknown> = {}) =>
	mocks.findApplicationById.mockResolvedValue(app(overrides));

const doneRun = (overrides: Record<string, unknown> = {}) => ({
	runId: "run1",
	status: "done",
	planVersion: 3,
	verdict: "pass",
	stages: [{ stage: "plan", status: "ok" }],
	error: null,
	...overrides,
});

describe("getQcRepoSource", () => {
	test("builds the github clone URL and uses the app's branch", () => {
		expect(getQcRepoSource(app())).toEqual({
			repoUrl: "https://github.com/o/r.git",
			branch: "main",
		});
	});

	test("uses the custom git URL and branch", () => {
		expect(
			getQcRepoSource(
				app({
					sourceType: "git",
					customGitUrl: "git@host:o/r.git",
					customGitBranch: "dev",
				}),
			),
		).toEqual({ repoUrl: "git@host:o/r.git", branch: "dev" });
	});

	test("is null for sources without a resolvable repo", () => {
		expect(getQcRepoSource(app({ sourceType: "docker" }))).toBeNull();
		expect(getQcRepoSource(app({ sourceType: "gitlab" }))).toBeNull();
		expect(getQcRepoSource(app({ branch: null }))).toBeNull();
	});
});

describe("runQcStep", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setStoredApp();
		mocks.claim.mockResolvedValue(true);
		mocks.createRun.mockResolvedValue({ runId: "run1" });
		mocks.waitForRun.mockResolvedValue(doneRun());
		mocks.getPlan.mockResolvedValue("# plan");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("asks the service for a plan of the given commit and stores it", async () => {
		const result = await runQcStep(app(), {
			commitSha: SHA,
			idempotencyKey: "dep1",
		});

		expect(mocks.createRun).toHaveBeenCalledWith({
			repoUrl: "https://github.com/o/r.git",
			branch: "main",
			commitSha: SHA,
			name: "app",
			force: undefined,
			idempotencyKey: "dep1",
		});
		expect(mocks.updateApplication).toHaveBeenCalledWith("app1", {
			testPlanContent: "# plan",
			testPlanVersion: 3,
			testPlanStatus: "ready",
			testPlanError: null,
		});
		expect(result).toMatchObject({
			verdict: "ready",
			testPlanVersion: 3,
			runId: "run1",
		});
		expect(result.stages).toEqual([{ stage: "plan", status: "ok" }]);
	});

	test("asks for tests too and returns once the service wants them run", async () => {
		mocks.waitForRun.mockResolvedValue(doneRun({ status: "awaiting_exec" }));
		const result = await runQcStep(app(), {
			commitSha: SHA,
			generateTests: true,
		});

		expect(mocks.createRun).toHaveBeenCalledWith(
			expect.objectContaining({ stages: ["plan", "generate", "triage"] }),
		);
		expect(mocks.waitForRun).toHaveBeenCalledWith("run1", {
			untilAwaitingExec: true,
		});
		expect(result).toMatchObject({ verdict: "ready", awaitingExec: true });
		expect(mocks.updateApplication).toHaveBeenCalledWith(
			"app1",
			expect.objectContaining({ testPlanStatus: "ready" }),
		);
	});

	test("a run that ended without waiting for tests is a plan only", async () => {
		const result = await runQcStep(app(), {
			commitSha: SHA,
			generateTests: true,
		});
		expect(result).toMatchObject({ verdict: "ready", awaitingExec: false });
	});

	test("only plans when tests were not asked for", async () => {
		await runQcStep(app(), { commitSha: SHA });
		expect(mocks.createRun).toHaveBeenCalledWith(
			expect.objectContaining({ stages: undefined }),
		);
	});

	test("keeps every plan version it produces", async () => {
		await runQcStep(app(), { commitSha: SHA, idempotencyKey: "dep1" });
		expect(mocks.recordVersion).toHaveBeenCalledWith({
			applicationId: "app1",
			branch: "main",
			version: 3,
			content: "# plan",
			commitSha: SHA,
			qcRunId: "run1",
		});
	});

	test("does not record anything when the run failed", async () => {
		mocks.waitForRun.mockResolvedValue(
			doneRun({ status: "failed", error: { code: "x", message: "boom" } }),
		);
		await runQcStep(app(), { commitSha: SHA });
		expect(mocks.recordVersion).not.toHaveBeenCalled();
	});

	test("passes force through for a manual regenerate", async () => {
		await runQcStep(app(), { commitSha: SHA, force: true });
		expect(mocks.createRun).toHaveBeenCalledWith(
			expect.objectContaining({ force: true }),
		);
	});

	test("uses the stored settings, not the caller's stale copy", async () => {
		setStoredApp({ qcEnabled: false });
		const result = await runQcStep(app({ qcEnabled: true }), {
			commitSha: SHA,
		});
		expect(result.verdict).toBe("skipped");
		expect(mocks.claim).not.toHaveBeenCalled();
		expect(mocks.createRun).not.toHaveBeenCalled();
	});

	test("reports a reason when the step is disabled", async () => {
		setStoredApp({ qcEnabled: false });
		const result = await runQcStep(app(), { commitSha: SHA });
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toBeTruthy();
	});

	test("reports a reason when the source type has no repo", async () => {
		setStoredApp({ sourceType: "docker" });
		const result = await runQcStep(app(), { commitSha: SHA });
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toContain("docker");
		expect(mocks.createRun).not.toHaveBeenCalled();
	});

	test("skips when there is no commit to plan for", async () => {
		const result = await runQcStep(app());
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toContain("commit");
		expect(mocks.createRun).not.toHaveBeenCalled();
	});

	test("a failed service run is an error carrying the service's message", async () => {
		mocks.waitForRun.mockResolvedValue(
			doneRun({
				status: "failed",
				error: { code: "stage_failed", message: "plan: gateway error" },
			}),
		);
		const result = await runQcStep(app(), { commitSha: SHA });
		expect(result).toMatchObject({
			verdict: "error",
			reason: "plan: gateway error",
			runId: "run1",
		});
		expect(mocks.updateApplication).toHaveBeenCalledWith("app1", {
			testPlanStatus: "error",
			testPlanError: "plan: gateway error",
		});
	});

	test("returns the error message under the open policy and records it", async () => {
		mocks.createRun.mockRejectedValue(new Error("boom"));
		const result = await runQcStep(app(), { commitSha: SHA });
		expect(result).toMatchObject({ verdict: "error", reason: "boom" });
		expect(mocks.updateApplication).toHaveBeenCalledWith(
			"app1",
			expect.objectContaining({
				testPlanStatus: "error",
				testPlanError: "boom",
			}),
		);
	});

	test("throws under the closed policy", async () => {
		setStoredApp({ qcFailurePolicy: "closed" });
		mocks.createRun.mockRejectedValue(new Error("boom"));
		await expect(runQcStep(app(), { commitSha: SHA })).rejects.toThrow("boom");
	});

	test("ignoreFailurePolicy returns the error instead of throwing", async () => {
		setStoredApp({ qcFailurePolicy: "closed" });
		mocks.createRun.mockRejectedValue(new Error("boom"));
		const result = await runQcStep(app(), {
			commitSha: SHA,
			ignoreFailurePolicy: true,
		});
		expect(result).toMatchObject({ verdict: "error", reason: "boom" });
	});

	describe("when another run already holds the claim", () => {
		beforeEach(() => {
			mocks.claim.mockResolvedValue(false);
			vi.useFakeTimers();
		});

		test("waits for it and reports its plan without calling the service", async () => {
			mocks.findApplicationById
				.mockResolvedValueOnce(app({ testPlanStatus: "generating" }))
				.mockResolvedValueOnce(app({ testPlanStatus: "generating" }))
				.mockResolvedValue(
					app({ testPlanStatus: "ready", testPlanVersion: 7 }),
				);

			const pending = runQcStep(app(), { commitSha: SHA });
			await vi.advanceTimersByTimeAsync(10_000);
			const result = await pending;

			expect(result).toMatchObject({ verdict: "ready", testPlanVersion: 7 });
			expect(mocks.createRun).not.toHaveBeenCalled();
		});

		test("applies the closed policy when the wait times out", async () => {
			setStoredApp({
				testPlanStatus: "generating",
				qcFailurePolicy: "closed",
			});

			const pending = runQcStep(app(), { commitSha: SHA });
			const assertion = expect(pending).rejects.toThrow(/Timed out/);
			await vi.advanceTimersByTimeAsync(20_000);
			await assertion;
		});

		test("returns an error under the open policy when the wait times out", async () => {
			setStoredApp({ testPlanStatus: "generating" });

			const pending = runQcStep(app(), { commitSha: SHA });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(await pending).toMatchObject({ verdict: "error" });
		});
	});
});

describe("isTestPlanGenerating", () => {
	test("is true only for a recent generating row", () => {
		const recent = new Date(Date.now() - 1000).toISOString();
		const old = new Date(Date.now() - QC_STALE_AFTER_MS - 1000).toISOString();
		expect(
			isTestPlanGenerating({
				testPlanStatus: "generating",
				testPlanStartedAt: recent,
			}),
		).toBe(true);
		expect(
			isTestPlanGenerating({
				testPlanStatus: "generating",
				testPlanStartedAt: old,
			}),
		).toBe(false);
		expect(
			isTestPlanGenerating({
				testPlanStatus: "generating",
				testPlanStartedAt: null,
			}),
		).toBe(false);
		expect(
			isTestPlanGenerating({
				testPlanStatus: "ready",
				testPlanStartedAt: recent,
			}),
		).toBe(false);
	});
});

describe("regenerateTestPlanInBackground", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setStoredApp({ qcFailurePolicy: "closed" });
		mocks.claim.mockResolvedValue(true);
	});

	test("forces a new plan for the given commit and records a failure as status", async () => {
		mocks.createRun.mockRejectedValue(new Error("boom"));

		regenerateTestPlanInBackground(app(), SHA);
		await vi.waitFor(() =>
			expect(mocks.updateApplication).toHaveBeenCalledWith(
				"app1",
				expect.objectContaining({ testPlanStatus: "error" }),
			),
		);
		expect(mocks.createRun).toHaveBeenCalledWith(
			expect.objectContaining({ force: true, commitSha: SHA }),
		);
	});

	test("stores the reason when the step is skipped", async () => {
		setStoredApp({ sourceType: "docker" });

		regenerateTestPlanInBackground(app(), SHA);
		await vi.waitFor(() =>
			expect(mocks.updateApplication).toHaveBeenCalledWith("app1", {
				testPlanError: expect.stringContaining("docker"),
			}),
		);
	});
});
