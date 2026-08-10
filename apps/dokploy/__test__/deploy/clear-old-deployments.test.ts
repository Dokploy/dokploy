import { clearOldDeployments } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

const makeDeployment = (overrides: Record<string, unknown>) => ({
	deploymentId: "",
	logPath: ".",
	serverId: null,
	status: "done",
	rollbackId: null,
	createdAt: new Date().toISOString(),
	...overrides,
});

describe("clearOldDeployments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.delete).mockReturnValue({
			where: () => ({
				returning: () => Promise.resolve([]),
			}),
		} as any);
	});

	it("keeps the most recent successful deployment and deletes the rest", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "failed-1", status: "error" }),
			makeDeployment({ deploymentId: "success-1", status: "done" }),
			makeDeployment({ deploymentId: "success-2", status: "done" }),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("app-1", "application");

		// deploymentList order is newest-first (query orders by desc createdAt);
		// first "done" entry (success-1) is kept, failed-1 and success-2 are deleted.
		expect(db.delete).toHaveBeenCalledTimes(2);
	});

	it("falls back to the newest deployment when none succeeded", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "failed-1", status: "error" }),
			makeDeployment({ deploymentId: "failed-2", status: "error" }),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("app-1", "application");

		// failed-1 (newest) is kept as fallback, only failed-2 is deleted.
		expect(db.delete).toHaveBeenCalledTimes(1);
	});

	it("removes nothing when there is a single deployment", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "only-1", status: "done" }),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("compose-1", "compose");

		expect(db.delete).not.toHaveBeenCalled();
	});

	it("never deletes the currently-running deployment, even if newer than the last success", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "running-1", status: "running" }),
			makeDeployment({ deploymentId: "success-1", status: "done" }),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("app-1", "application");

		// running-1 is excluded from deletion candidates entirely, and
		// success-1 is kept as the most recent successful deployment.
		expect(db.delete).not.toHaveBeenCalled();
	});

	it("deletes older non-running deployments while a build is in progress", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "running-1", status: "running" }),
			makeDeployment({ deploymentId: "success-1", status: "done" }),
			makeDeployment({ deploymentId: "failed-1", status: "error" }),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("app-1", "application");

		// running-1 is protected; only failed-1 (older than the kept success) is removed.
		expect(db.delete).toHaveBeenCalledTimes(1);
	});
});
