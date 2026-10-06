import { db } from "@dokploy/server/db";
import * as adminService from "@dokploy/server/services/admin";
import * as applicationService from "@dokploy/server/services/application";
import { deployApplication } from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as qcExec from "@dokploy/server/services/qc-exec";
import * as qcStep from "@dokploy/server/services/qc-step";
import * as builders from "@dokploy/server/utils/builders";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import * as gitProvider from "@dokploy/server/utils/providers/git";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn().mockResolvedValue([{}]),
		from: vi.fn(() => chain),
		innerJoin: vi.fn(() => chain),
		// biome-ignore lint/suspicious/noThenProperty: mimics drizzle's awaitable query builder
		then: (resolve: (v: any) => void) => resolve([]),
	};
	return {
		db: {
			select: vi.fn(() => chain),
			insert: vi.fn(),
			update: vi.fn(() => chain),
			delete: vi.fn(),
			query: {
				applications: { findFirst: vi.fn() },
				patch: { findMany: vi.fn().mockResolvedValue([]) },
				member: { findMany: vi.fn().mockResolvedValue([]) },
			},
		},
	};
});

vi.mock("@dokploy/server/services/application", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/application")
	>("@dokploy/server/services/application");
	return {
		...actual,
		findApplicationById: vi.fn(),
		updateApplicationStatus: vi.fn(),
	};
});
vi.mock("@dokploy/server/services/admin", () => ({ getDokployUrl: vi.fn() }));
vi.mock("@dokploy/server/services/deployment", () => ({
	createDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateDeployment: vi.fn(),
}));
vi.mock("@dokploy/server/services/qc-exec", () => ({
	runQcGeneratedTests: vi.fn(),
}));
vi.mock("@dokploy/server/services/qc-step", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/qc-step")
	>("@dokploy/server/services/qc-step");
	return { ...actual, runQcStep: vi.fn() };
});
vi.mock("@dokploy/server/utils/providers/git", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/providers/git")
	>("@dokploy/server/utils/providers/git");
	return { ...actual, getGitCommitInfo: vi.fn() };
});
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));
vi.mock("@dokploy/server/utils/builders", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/builders")
	>("@dokploy/server/utils/builders");
	return {
		...actual,
		mechanizeDockerContainer: vi.fn(),
		getBuildCommand: vi.fn(),
	};
});
vi.mock("@dokploy/server/utils/notifications/build-success", () => ({
	sendBuildSuccessNotifications: vi.fn(),
}));
vi.mock("@dokploy/server/utils/notifications/build-error", () => ({
	sendBuildErrorNotifications: vi.fn(),
}));
vi.mock("@dokploy/server/services/rollbacks", () => ({
	createRollback: vi.fn(),
}));

const app = (overrides = {}) => ({
	applicationId: "app1",
	name: "App",
	appName: "app",
	sourceType: "git" as const,
	customGitUrl: "https://github.com/o/r.git",
	customGitBranch: "main",
	customGitSSHKeyId: null,
	buildType: "nixpacks" as const,
	env: "",
	serverId: null,
	rollbackActive: false,
	enableSubmodules: false,
	environmentId: "env-id",
	qcEnabled: true,
	testExecEnabled: false,
	testExecSource: "command",
	environment: {
		projectId: "project-id",
		env: "",
		name: "production",
		project: { name: "P", organizationId: "org-id", env: "" },
	},
	domains: [],
	...overrides,
});

// deployApplication calls findApplicationById inside its own module, so the
// mock has to sit one level lower, on the query it runs.
const setApp = (application: unknown) => {
	vi.mocked(db.query.applications.findFirst).mockResolvedValue(
		application as any,
	);
	vi.mocked(applicationService.findApplicationById).mockResolvedValue(
		application as any,
	);
};

const scriptsRun = () =>
	vi.mocked(execProcess.execAsync).mock.calls.map(([command]) => command);

describe("deployApplication with the QC step", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setApp(app());
		vi.mocked(adminService.getDokployUrl).mockResolvedValue("http://x");
		vi.mocked(deploymentService.createDeployment).mockResolvedValue({
			deploymentId: "dep1",
			logPath: "/tmp/dep1.log",
		} as any);
		vi.mocked(deploymentService.updateDeployment).mockResolvedValue({} as any);
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout: "",
			stderr: "",
		} as any);
		vi.mocked(builders.getBuildCommand).mockResolvedValue("BUILD_SCRIPT;");
		vi.mocked(gitProvider.getGitCommitInfo).mockResolvedValue({
			message: "m",
			hash: "c0ffee",
		});
		vi.mocked(qcStep.runQcStep).mockResolvedValue({
			verdict: "ready",
			testPlanVersion: 4,
			runId: "run1",
			stages: [{ stage: "plan", status: "ok" }],
		});
	});

	it("clones first, plans the commit that was cloned, then builds", async () => {
		await deployApplication({
			applicationId: "app1",
			titleLog: "t",
			descriptionLog: "d",
		});

		expect(qcStep.runQcStep).toHaveBeenCalledWith(expect.anything(), {
			commitSha: "c0ffee",
			idempotencyKey: "dep1",
			generateTests: false,
		});
		expect(qcExec.runQcGeneratedTests).not.toHaveBeenCalled();

		const scripts = scriptsRun();
		const cloneIndex = scripts.findIndex((s) =>
			String(s).includes("git clone"),
		);
		const buildIndex = scripts.findIndex((s) =>
			String(s).includes("BUILD_SCRIPT"),
		);
		expect(cloneIndex).toBeGreaterThanOrEqual(0);
		expect(buildIndex).toBeGreaterThan(cloneIndex);
		// the clone and the build are separate runs, with the QC step between them
		expect(String(scripts[cloneIndex])).not.toContain("BUILD_SCRIPT");
		expect(String(scripts[buildIndex])).not.toContain("git clone");

		const qcOrder = vi.mocked(qcStep.runQcStep).mock.invocationCallOrder[0];
		const execOrders = vi.mocked(execProcess.execAsync).mock
			.invocationCallOrder;
		expect(execOrders[cloneIndex]).toBeLessThan(qcOrder as number);
		expect(execOrders[buildIndex]).toBeGreaterThan(qcOrder as number);
	});

	it("records the run, its stages and the plan version on the deployment", async () => {
		await deployApplication({
			applicationId: "app1",
			titleLog: "t",
			descriptionLog: "d",
		});
		expect(deploymentService.updateDeployment).toHaveBeenCalledWith("dep1", {
			testPlanVersionAtDeploy: 4,
			qcVerdict: "ready",
			qcRunId: "run1",
			qcStageStatus: [{ stage: "plan", status: "ok" }],
		});
	});

	it("writes the outcome to the deployment log", async () => {
		await deployApplication({
			applicationId: "app1",
			titleLog: "t",
			descriptionLog: "d",
		});
		const logged = scriptsRun().some(
			(s) =>
				String(s).includes("/tmp/dep1.log") &&
				String(s).includes(
					Buffer.from("== QC test plan v4 ready ==").toString("base64"),
				),
		);
		expect(logged).toBe(true);
	});

	it("a blocking QC failure stops the deploy before the build", async () => {
		vi.mocked(qcStep.runQcStep).mockRejectedValue(new Error("QC down"));
		await expect(
			deployApplication({
				applicationId: "app1",
				titleLog: "t",
				descriptionLog: "d",
			}),
		).rejects.toThrow("QC down");
		expect(scriptsRun().some((s) => String(s).includes("BUILD_SCRIPT"))).toBe(
			false,
		);
		expect(builders.mechanizeDockerContainer).not.toHaveBeenCalled();
		expect(deploymentService.updateDeployment).toHaveBeenCalledWith("dep1", {
			qcVerdict: "error",
		});
		const blocked = scriptsRun().some((s) =>
			String(s).includes(
				Buffer.from("== QC test plan blocked the deploy: QC down ==").toString(
					"base64",
				),
			),
		);
		expect(blocked).toBe(true);
	});

	it("does not split the deploy when the QC step is off", async () => {
		setApp(app({ qcEnabled: false }));
		vi.mocked(qcStep.runQcStep).mockResolvedValue({
			verdict: "skipped",
			testPlanVersion: 0,
		});
		await deployApplication({
			applicationId: "app1",
			titleLog: "t",
			descriptionLog: "d",
		});

		expect(qcStep.runQcStep).not.toHaveBeenCalled();
		const withBuild = scriptsRun().filter((s) =>
			String(s).includes("BUILD_SCRIPT"),
		);
		expect(withBuild).toHaveLength(1);
		expect(String(withBuild[0])).toContain("git clone");
	});

	it("skips the QC step for a source it cannot plan", async () => {
		setApp(app({ sourceType: "gitlab" }));
		vi.mocked(qcStep.runQcStep).mockResolvedValue({
			verdict: "skipped",
			testPlanVersion: 0,
		});
		await deployApplication({
			applicationId: "app1",
			titleLog: "t",
			descriptionLog: "d",
		});
		expect(qcStep.runQcStep).toHaveBeenCalledWith(expect.anything());
		expect(gitProvider.getGitCommitInfo).toHaveBeenCalledTimes(1); // only the post-build commit title
	});

	describe("with tests generated by the QC service", () => {
		const generated = (overrides = {}) =>
			app({
				testExecEnabled: true,
				testExecSource: "generated",
				testCommand: "npm test",
				...overrides,
			});
		const passed = {
			status: "passed" as const,
			exitCode: 0,
			summary: { source: "generated" as const, verdict: "pass", passed: 3 },
			stages: [{ stage: "triage", status: "ok" }],
		};

		beforeEach(() => {
			setApp(generated());
			vi.mocked(qcStep.runQcStep).mockResolvedValue({
				verdict: "ready",
				testPlanVersion: 2,
				runId: "run9",
				awaitingExec: true,
			});
			vi.mocked(qcExec.runQcGeneratedTests).mockResolvedValue(passed);
		});

		const deploy = () =>
			deployApplication({
				applicationId: "app1",
				titleLog: "t",
				descriptionLog: "d",
			});

		it("asks the service for tests, runs them after the plan and before the build", async () => {
			await deploy();

			expect(qcStep.runQcStep).toHaveBeenCalledWith(expect.anything(), {
				commitSha: "c0ffee",
				idempotencyKey: "dep1",
				generateTests: true,
			});
			expect(qcExec.runQcGeneratedTests).toHaveBeenCalledWith(
				expect.objectContaining({
					deploymentId: "dep1",
					qcResult: expect.objectContaining({ runId: "run9" }),
				}),
			);

			const planned = vi.mocked(qcStep.runQcStep).mock.invocationCallOrder[0];
			const tested = vi.mocked(qcExec.runQcGeneratedTests).mock
				.invocationCallOrder[0];
			const buildIndex = scriptsRun().findIndex((s) =>
				String(s).includes("BUILD_SCRIPT"),
			);
			const buildOrder = vi.mocked(execProcess.execAsync).mock
				.invocationCallOrder[buildIndex];
			expect(planned).toBeLessThan(tested as number);
			expect(tested).toBeLessThan(buildOrder as number);
		});

		it("records the outcome on the deployment", async () => {
			await deploy();
			expect(deploymentService.updateDeployment).toHaveBeenCalledWith("dep1", {
				testExecStatus: "passed",
				testExecExitCode: 0,
				testExecSummary: passed.summary,
				qcStageStatus: passed.stages,
			});
		});

		it("does not also run the user's own test command", async () => {
			await deploy();
			expect(
				scriptsRun().some((s) => String(s).includes("QC_TEST_EXIT_CODE")),
			).toBe(false);
		});

		it("stops before the build when the failure policy blocks the deploy", async () => {
			vi.mocked(qcExec.runQcGeneratedTests).mockResolvedValue({
				status: "failed",
				exitCode: 1,
				summary: { source: "generated", verdict: "fail" },
				blockDeploy: new Error("Generated tests failed: 1 of 3 tests failed"),
			});
			await expect(deploy()).rejects.toThrow("Generated tests failed");

			expect(deploymentService.updateDeployment).toHaveBeenCalledWith(
				"dep1",
				expect.objectContaining({
					testExecStatus: "failed",
					testExecExitCode: 1,
				}),
			);
			expect(scriptsRun().some((s) => String(s).includes("BUILD_SCRIPT"))).toBe(
				false,
			);
			expect(builders.mechanizeDockerContainer).not.toHaveBeenCalled();
		});

		it("keeps going when a failed run is not blocking", async () => {
			vi.mocked(qcExec.runQcGeneratedTests).mockResolvedValue({
				status: "failed",
				exitCode: 1,
				summary: { source: "generated", verdict: "fail" },
			});
			await deploy();
			expect(builders.mechanizeDockerContainer).toHaveBeenCalled();
		});

		it("says why when the QC step is off, instead of silently running nothing", async () => {
			setApp(generated({ qcEnabled: false }));
			vi.mocked(qcStep.runQcStep).mockResolvedValue({
				verdict: "skipped",
				testPlanVersion: 0,
			});
			await deploy();

			expect(qcExec.runQcGeneratedTests).not.toHaveBeenCalled();
			expect(deploymentService.updateDeployment).toHaveBeenCalledWith(
				"dep1",
				expect.objectContaining({
					testExecStatus: "skipped",
					testExecSummary: expect.objectContaining({ source: "generated" }),
				}),
			);
		});

		it("runs nothing extra when the test source is the user's command", async () => {
			setApp(generated({ testExecSource: "command" }));
			vi.mocked(qcStep.runQcStep).mockResolvedValue({
				verdict: "ready",
				testPlanVersion: 1,
				runId: "r",
			});
			await deploy();
			expect(qcExec.runQcGeneratedTests).not.toHaveBeenCalled();
			expect(qcStep.runQcStep).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ generateTests: false }),
			);
		});
	});
});
