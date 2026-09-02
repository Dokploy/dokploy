import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
	deleteWhere: vi.fn(),
	insertValues: vi.fn(),
	onConflictDoUpdate: vi.fn(),
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

import { db } from "@dokploy/server/db";
import {
	createPendingGithubDeployment,
	findPendingGithubDeploymentsBySha,
	removePendingGithubDeployment,
} from "@dokploy/server/services/pending-github-deployment";

describe("pending GitHub deployments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deleteWhere.mockReturnValue({ returning: mocks.returning });
		mocks.insertValues.mockReturnValue({
			onConflictDoUpdate: mocks.onConflictDoUpdate,
		});
		mocks.onConflictDoUpdate.mockReturnValue({ returning: mocks.returning });
		mocks.returning.mockResolvedValue([{ pendingGithubDeploymentId: "row" }]);
	});

	it("upserts on the application id so a newer push replaces the parked row", async () => {
		const created = await createPendingGithubDeployment({
			applicationId: "application-id",
			headSha: "abc123",
			titleLog: "fix: something",
			descriptionLog: "Hash: abc123",
		});

		expect(mocks.insertValues).toHaveBeenCalledWith({
			applicationId: "application-id",
			headSha: "abc123",
			titleLog: "fix: something",
			descriptionLog: "Hash: abc123",
		});
		expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith({
			target: "pending.applicationId",
			set: expect.objectContaining({
				headSha: "abc123",
				titleLog: "fix: something",
				descriptionLog: "Hash: abc123",
				createdAt: expect.any(String),
			}),
		});
		expect(db.delete).not.toHaveBeenCalled();
		expect(created).toEqual({ pendingGithubDeploymentId: "row" });
	});

	it("upserts on the compose id when given a composeId", async () => {
		await createPendingGithubDeployment({
			composeId: "compose-id",
			headSha: "abc123",
			titleLog: "fix: something",
			descriptionLog: "Hash: abc123",
		});

		expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ target: "pending.composeId" }),
		);
	});

	it("finds pending deployments by commit sha with the service repository", async () => {
		mocks.findMany.mockResolvedValue([]);

		await findPendingGithubDeploymentsBySha("abc123");

		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { field: "pending.headSha", value: "abc123" },
				with: expect.objectContaining({
					application: {
						columns: expect.objectContaining({
							owner: true,
							repository: true,
						}),
					},
					compose: {
						columns: expect.objectContaining({
							owner: true,
							repository: true,
						}),
					},
				}),
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

	it("deletes through the given transaction instead of the shared db", async () => {
		const txWhere = vi.fn(() => ({
			returning: vi
				.fn()
				.mockResolvedValue([{ pendingGithubDeploymentId: "row" }]),
		}));
		const tx = { delete: vi.fn(() => ({ where: txWhere })) };

		const removed = await removePendingGithubDeployment(
			"row",
			tx as unknown as Parameters<typeof removePendingGithubDeployment>[1],
		);

		expect(tx.delete).toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
		expect(removed).toEqual({ pendingGithubDeploymentId: "row" });
	});
});
