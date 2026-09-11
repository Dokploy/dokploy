import { clearOldDeployments } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn(),
}));

vi.mock("@dokploy/server/services/rollbacks", () => ({
	removeRollbackById: vi.fn().mockResolvedValue(undefined),
}));

import { findApplicationById } from "@dokploy/server/services/application";
import { findComposeById } from "@dokploy/server/services/compose";
import { removeRollbackById } from "@dokploy/server/services/rollbacks";

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
		vi.mocked(findApplicationById).mockResolvedValue({
			serverId: null,
		} as any);
		vi.mocked(findComposeById).mockResolvedValue({
			serverId: null,
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

	it("continues cleaning up remaining deployments after one removal fails", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "success-1", status: "done" }),
			makeDeployment({ deploymentId: "failed-1", status: "error" }),
			makeDeployment({ deploymentId: "failed-2", status: "error" }),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);
		vi.mocked(db.delete)
			.mockImplementationOnce(() => {
				throw new Error("db unavailable");
			})
			.mockReturnValue({
				where: () => ({
					returning: () => Promise.resolve([]),
				}),
			} as any);

		await expect(
			clearOldDeployments("app-1", "application"),
		).resolves.not.toThrow();

		// failed-1's removal throws but doesn't stop failed-2 from being attempted.
		expect(db.delete).toHaveBeenCalledTimes(2);
	});

	it("removes the rollback (and its image) before deleting a deployment that has one", async () => {
		const deploymentList = [
			makeDeployment({ deploymentId: "success-1", status: "done" }),
			makeDeployment({
				deploymentId: "failed-1",
				status: "error",
				rollbackId: "rollback-1",
			}),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("app-1", "application");

		expect(removeRollbackById).toHaveBeenCalledWith("rollback-1");
		expect(db.delete).toHaveBeenCalledTimes(1);
	});

	it("removes remote logs via execAsyncRemote using the application's server, not local execAsync", async () => {
		vi.mocked(findApplicationById).mockResolvedValue({
			serverId: "server-1",
		} as any);
		const deploymentList = [
			makeDeployment({ deploymentId: "success-1", status: "done" }),
			makeDeployment({
				deploymentId: "failed-1",
				status: "error",
				logPath: "/logs/failed-1.log",
				serverId: null,
			}),
		];
		vi.mocked(db.query.deployments.findMany).mockResolvedValue(
			deploymentList as any,
		);

		await clearOldDeployments("app-1", "application");

		// the batched remote cleanup uses the application's server, independent
		// of the (often-unset) per-deployment serverId column.
		expect(execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringContaining("rm -rf /logs/failed-1.log;"),
		);
	});
});
