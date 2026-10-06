import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	updateApplication: vi.fn(),
	generate: vi.fn(),
	update: vi.fn(),
	resolve: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
	updateApplication: mocks.updateApplication,
}));
vi.mock("@dokploy/server/services/qc-agent-client", () => ({
	resolveQcProject: mocks.resolve,
	runTestPlanGenerate: mocks.generate,
	runTestPlanUpdate: mocks.update,
}));

import { runQcStep } from "@dokploy/server/services/qc-step";

const app = (overrides: Record<string, unknown> = {}) => {
	const row = {
		applicationId: "app1",
		name: "app",
		qcEnabled: true,
		qcProjectId: "proj1",
		qcFailurePolicy: "open",
		testPlanVersion: 0,
		sourceType: "github",
		owner: "o",
		repository: "r",
		branch: "main",
		...overrides,
	};
	mocks.findApplicationById.mockResolvedValue(row);
	return row as never;
};

describe("runQcStep", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	test("generates when the application has no test plan yet", async () => {
		const result = await runQcStep(app({ testPlanVersion: 0 }));
		expect(mocks.generate).toHaveBeenCalledOnce();
		expect(mocks.update).not.toHaveBeenCalled();
		expect(result).toMatchObject({ verdict: "ready", testPlanVersion: 1 });
	});

	test("updates when a test plan already exists", async () => {
		const result = await runQcStep(app({ testPlanVersion: 1 }));
		expect(mocks.update).toHaveBeenCalledOnce();
		expect(mocks.generate).not.toHaveBeenCalled();
		expect(result).toMatchObject({ verdict: "ready", testPlanVersion: 2 });
	});

	test("reports a reason when the step is disabled", async () => {
		const result = await runQcStep(app({ qcEnabled: false }));
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toBeTruthy();
	});

	test("reports a reason when the source type has no repo URL", async () => {
		const result = await runQcStep(
			app({ qcProjectId: null, sourceType: "docker" }),
		);
		expect(result.verdict).toBe("skipped");
		expect(result.reason).toContain("docker");
	});

	test("returns the error message under the open policy", async () => {
		mocks.generate.mockRejectedValue(new Error("boom"));
		const result = await runQcStep(app());
		expect(result).toMatchObject({ verdict: "error", reason: "boom" });
	});

	test("throws under the closed policy", async () => {
		mocks.generate.mockRejectedValue(new Error("boom"));
		await expect(runQcStep(app({ qcFailurePolicy: "closed" }))).rejects.toThrow(
			"boom",
		);
	});
});
