import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	updateApplication: vi.fn(),
	findApplicationById: vi.fn(),
	claim: vi.fn(),
	generate: vi.fn(),
	update: vi.fn(),
	resolve: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	updateApplication: mocks.updateApplication,
	findApplicationById: mocks.findApplicationById,
	claimTestPlanGeneration: mocks.claim,
}));
vi.mock("@dokploy/server/services/qc-agent-client", () => ({
	QC_AGENT_TIMEOUT_MS: 10_000,
	resolveQcProject: mocks.resolve,
	runTestPlanGenerate: mocks.generate,
	runTestPlanUpdate: mocks.update,
}));

import {
	isTestPlanGenerating,
	QC_STALE_AFTER_MS,
	regenerateTestPlanInBackground,
	runQcStep,
} from "@dokploy/server/services/qc-step";

const app = (overrides: Record<string, unknown> = {}) =>
	({
		applicationId: "app1",
		name: "app",
		qcEnabled: true,
		qcProjectId: "proj1",
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

describe("runQcStep", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setStoredApp();
		mocks.claim.mockResolvedValue(true);
		mocks.resolve.mockResolvedValue("proj1");
		mocks.generate.mockResolvedValue({
			status: "ready",
			content: "# plan",
			version: 1,
		});
		mocks.update.mockResolvedValue({
			status: "ready",
			content: "# plan v2",
			version: 2,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("generates when the application has no test plan yet", async () => {
		const result = await runQcStep(app());
		expect(mocks.generate).toHaveBeenCalledOnce();
		expect(mocks.update).not.toHaveBeenCalled();
		expect(result).toMatchObject({ verdict: "ready", testPlanVersion: 1 });
	});

	test("updates when a test plan already exists", async () => {
		setStoredApp({ testPlanVersion: 1 });
		const result = await runQcStep(app());
		expect(mocks.update).toHaveBeenCalledOnce();
		expect(mocks.generate).not.toHaveBeenCalled();
		expect(result).toMatchObject({ verdict: "ready", testPlanVersion: 2 });
	});

	test("uses the stored settings, not the caller's stale copy", async () => {
		setStoredApp({ qcEnabled: false });
		const result = await runQcStep(app({ qcEnabled: true }));
		expect(result.verdict).toBe("skipped");
		expect(mocks.claim).not.toHaveBeenCalled();
	});

	test("reports a reason when the step is disabled", async () => {
		setStoredApp({ qcEnabled: false });
		const result = await runQcStep(app());
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toBeTruthy();
	});

	test("reports a reason when the source type has no repo URL", async () => {
		setStoredApp({ qcProjectId: null, sourceType: "docker" });
		const result = await runQcStep(app());
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toContain("docker");
	});

	test("returns the error message under the open policy and records it", async () => {
		mocks.generate.mockRejectedValue(new Error("boom"));
		const result = await runQcStep(app());
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
		mocks.generate.mockRejectedValue(new Error("boom"));
		await expect(runQcStep(app())).rejects.toThrow("boom");
	});

	test("ignoreFailurePolicy returns the error instead of throwing", async () => {
		setStoredApp({ qcFailurePolicy: "closed" });
		mocks.generate.mockRejectedValue(new Error("boom"));
		const result = await runQcStep(app(), { ignoreFailurePolicy: true });
		expect(result).toMatchObject({ verdict: "error", reason: "boom" });
	});

	describe("when another run already holds the claim", () => {
		beforeEach(() => {
			mocks.claim.mockResolvedValue(false);
			vi.useFakeTimers();
		});

		test("waits for it and reports its plan without starting a second run", async () => {
			mocks.findApplicationById
				.mockResolvedValueOnce(app({ testPlanStatus: "generating" }))
				.mockResolvedValueOnce(app({ testPlanStatus: "generating" }))
				.mockResolvedValue(
					app({ testPlanStatus: "ready", testPlanVersion: 7 }),
				);

			const pending = runQcStep(app());
			await vi.advanceTimersByTimeAsync(10_000);
			const result = await pending;

			expect(result).toMatchObject({ verdict: "ready", testPlanVersion: 7 });
			expect(mocks.generate).not.toHaveBeenCalled();
			expect(mocks.update).not.toHaveBeenCalled();
		});

		test("applies the closed policy when the wait times out", async () => {
			setStoredApp({
				testPlanStatus: "generating",
				qcFailurePolicy: "closed",
			});

			const pending = runQcStep(app());
			const assertion = expect(pending).rejects.toThrow(/Timed out/);
			await vi.advanceTimersByTimeAsync(20_000);
			await assertion;
		});

		test("returns an error under the open policy when the wait times out", async () => {
			setStoredApp({ testPlanStatus: "generating" });

			const pending = runQcStep(app());
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
		setStoredApp({ qcEnabled: true, qcFailurePolicy: "closed" });
		mocks.claim.mockResolvedValue(true);
	});

	test("returns before the run finishes and records a failure as status", async () => {
		mocks.generate.mockRejectedValue(new Error("boom"));

		regenerateTestPlanInBackground(app());
		await vi.waitFor(() =>
			expect(mocks.updateApplication).toHaveBeenCalledWith(
				"app1",
				expect.objectContaining({ testPlanStatus: "error" }),
			),
		);
	});

	test("stores the reason when the step is skipped", async () => {
		setStoredApp({ qcProjectId: null, sourceType: "docker" });

		regenerateTestPlanInBackground(app());
		await vi.waitFor(() =>
			expect(mocks.updateApplication).toHaveBeenCalledWith("app1", {
				testPlanError: expect.stringContaining("docker"),
			}),
		);
	});
});
