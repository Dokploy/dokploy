import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstDeployment = vi.fn();
const findApplicationById = vi.fn();
const updateApplication = vi.fn();
const resolveQcProject = vi.fn();
const runTestPlanGenerate = vi.fn();
const runTestPlanUpdate = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			deployments: {
				findFirst: (...args: unknown[]) => findFirstDeployment(...args),
			},
		},
	},
}));

vi.mock("@dokploy/server/db/schema", () => ({ deployments: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: (...args: unknown[]) => findApplicationById(...args),
	updateApplication: (...args: unknown[]) => updateApplication(...args),
}));

vi.mock("@dokploy/server/services/qc-agent-client", () => ({
	resolveQcProject: (...args: unknown[]) => resolveQcProject(...args),
	runTestPlanGenerate: (...args: unknown[]) => runTestPlanGenerate(...args),
	runTestPlanUpdate: (...args: unknown[]) => runTestPlanUpdate(...args),
}));

const { runQcStep } = await import("@dokploy/server/services/qc-step");

// Base row shape `runQcStep` reads from — only the fields it actually
// touches are set explicitly per test/mock, the rest just need to exist.
const baseApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	qcEnabled: true,
	sourceType: "github",
	owner: "acme",
	repository: "widgets",
	branch: "main",
	customGitUrl: null,
	customGitBranch: null,
	qcProjectId: null,
	qcFailurePolicy: "open",
	testPlanVersion: null,
	name: "widgets",
	...overrides,
});

describe("runQcStep — per-application lock", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findFirstDeployment.mockResolvedValue(undefined);
		updateApplication.mockResolvedValue(undefined);
		runTestPlanGenerate.mockResolvedValue({
			status: "ready",
			content: "plan",
			version: 1,
		});
	});

	it("serializes two overlapping calls for the SAME applicationId", async () => {
		const events: string[] = [];
		findApplicationById.mockImplementation(async (id: string) =>
			baseApplication({ applicationId: id }),
		);
		resolveQcProject.mockImplementation(async () => {
			events.push("start");
			await new Promise((resolve) => setTimeout(resolve, 30));
			events.push("end");
			return "qc-project-1";
		});

		const appA = baseApplication({ applicationId: "app-1" });
		await Promise.all([runQcStep(appA), runQcStep(appA)]);

		// If the two calls had raced instead of queuing, both "start"
		// entries would land before either "end" (["start","start","end","end"]).
		expect(events).toEqual(["start", "end", "start", "end"]);
	});

	it("does not block calls for a DIFFERENT applicationId", async () => {
		const events: string[] = [];
		findApplicationById.mockImplementation(async (id: string) =>
			baseApplication({ applicationId: id, name: id === "app-1" ? "a" : "b" }),
		);
		resolveQcProject.mockImplementation(async (params: { name: string }) => {
			events.push(`${params.name}-start`);
			await new Promise((resolve) => setTimeout(resolve, 30));
			events.push(`${params.name}-end`);
			return `qc-project-${params.name}`;
		});

		const appA = baseApplication({ applicationId: "app-1", name: "a" });
		const appB = baseApplication({ applicationId: "app-2", name: "b" });
		await Promise.all([runQcStep(appA), runQcStep(appB)]);

		// Different applications must overlap — both starts happen before
		// either finishes, unlike the same-app case above.
		expect(events.slice(0, 2).sort()).toEqual(["a-start", "b-start"]);
	});

	it("re-reads the application from DB on every call, not just the caller's own stale snapshot", async () => {
		findApplicationById.mockImplementation(async (id: string) =>
			baseApplication({ applicationId: id }),
		);
		resolveQcProject.mockResolvedValue("qc-project-1");

		const staleApp = baseApplication({
			applicationId: "app-1",
			qcProjectId: null,
		});
		await Promise.all([runQcStep(staleApp), runQcStep(staleApp)]);

		// Both the initial caller and the one that waited on the lock must
		// each re-fetch — proving the second run doesn't just reuse the
		// `staleApp` object it was queued with.
		expect(findApplicationById).toHaveBeenCalledTimes(2);
		expect(findApplicationById).toHaveBeenCalledWith("app-1");
	});
});
