import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
	deleteWhere: vi.fn(),
	insertValues: vi.fn(),
	returning: vi.fn(),
	findMany: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
}));

vi.mock("@dokploy/server/db/schema", () => ({
	pendingGithubDeployments: {
		pendingGithubDeploymentId: "pending.pendingGithubDeploymentId",
		headSha: "pending.headSha",
		applicationId: "pending.applicationId",
		composeId: "pending.composeId",
	},
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		delete: vi.fn(() => ({
			where: mocks.deleteWhere,
		})),
		insert: vi.fn(() => ({
			values: mocks.insertValues,
		})),
		query: {
			pendingGithubDeployments: {
				findMany: mocks.findMany,
			},
		},
	},
}));

import {
	createPendingGithubDeployment,
	findPendingGithubDeploymentsBySha,
	removePendingGithubDeployment,
} from "@dokploy/server/services/pending-github-deployment";

describe("pending GitHub deployments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deleteWhere.mockReturnValue({ returning: mocks.returning });
		mocks.insertValues.mockReturnValue({ returning: mocks.returning });
		mocks.returning.mockResolvedValue([{ pendingGithubDeploymentId: "row" }]);
	});

	it("replaces the previous pending deployment of the same application", async () => {
		const created = await createPendingGithubDeployment({
			applicationId: "application-id",
			headSha: "abc123",
			titleLog: "fix: something",
			descriptionLog: "Hash: abc123",
		});

		expect(mocks.deleteWhere).toHaveBeenCalledWith({
			field: "pending.applicationId",
			value: "application-id",
		});
		expect(mocks.insertValues).toHaveBeenCalledWith({
			applicationId: "application-id",
			headSha: "abc123",
			titleLog: "fix: something",
			descriptionLog: "Hash: abc123",
		});
		expect(mocks.deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.insertValues.mock.invocationCallOrder[0] as number,
		);
		expect(created).toEqual({ pendingGithubDeploymentId: "row" });
	});

	it("scopes the replacement to the compose service when given a composeId", async () => {
		await createPendingGithubDeployment({
			composeId: "compose-id",
			headSha: "abc123",
			titleLog: "fix: something",
			descriptionLog: "Hash: abc123",
		});

		expect(mocks.deleteWhere).toHaveBeenCalledWith({
			field: "pending.composeId",
			value: "compose-id",
		});
	});

	it("finds pending deployments by commit sha", async () => {
		mocks.findMany.mockResolvedValue([]);

		await findPendingGithubDeploymentsBySha("abc123");

		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { field: "pending.headSha", value: "abc123" },
			}),
		);
	});

	it("returns the removed row so callers know whether they consumed it", async () => {
		const removed = await removePendingGithubDeployment("row");

		expect(mocks.deleteWhere).toHaveBeenCalledWith({
			field: "pending.pendingGithubDeploymentId",
			value: "row",
		});
		expect(removed).toEqual({ pendingGithubDeploymentId: "row" });
	});

	it("returns undefined when the row was already consumed", async () => {
		mocks.returning.mockResolvedValue([]);

		expect(await removePendingGithubDeployment("row")).toBeUndefined();
	});
});
