import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
	inserted: [] as unknown[],
	conflict: vi.fn(),
	deleted: vi.fn(),
	keepRows: [] as { id: string }[],
	fail: false,
}));

vi.mock("@dokploy/server/db", () => {
	const selectChain: any = {
		from: () => selectChain,
		where: () => selectChain,
		orderBy: () => selectChain,
		limit: async () => calls.keepRows,
	};
	return {
		db: {
			insert: () => ({
				values: (row: unknown) => {
					if (calls.fail) {
						throw new Error("database is down");
					}
					calls.inserted.push(row);
					return { onConflictDoNothing: calls.conflict };
				},
			}),
			select: () => selectChain,
			delete: () => ({ where: calls.deleted }),
		},
	};
});

import {
	MAX_PLAN_VERSIONS_KEPT,
	recordTestPlanVersion,
} from "@dokploy/server/services/test-plan-history";

const plan = {
	applicationId: "app1",
	branch: "main",
	version: 4,
	content: "# plan v4",
	commitSha: "a".repeat(40),
	qcRunId: "run1",
};

describe("recordTestPlanVersion", () => {
	beforeEach(() => {
		calls.inserted.length = 0;
		calls.conflict.mockReset();
		calls.deleted.mockReset();
		calls.keepRows = [];
		calls.fail = false;
	});

	it("stores the version with its commit and run", async () => {
		await recordTestPlanVersion(plan);
		expect(calls.inserted).toEqual([
			{
				applicationId: "app1",
				branch: "main",
				version: 4,
				content: "# plan v4",
				commitSha: "a".repeat(40),
				qcRunId: "run1",
			},
		]);
	});

	it("ignores a version it already has", async () => {
		await recordTestPlanVersion(plan);
		expect(calls.conflict).toHaveBeenCalledOnce();
	});

	it("stores a missing commit or run as null", async () => {
		await recordTestPlanVersion({
			applicationId: "app1",
			branch: "main",
			version: 1,
			content: "x",
		});
		expect(calls.inserted[0]).toMatchObject({ commitSha: null, qcRunId: null });
	});

	it("trims the oldest versions only once the limit is reached", async () => {
		calls.keepRows = Array.from(
			{ length: MAX_PLAN_VERSIONS_KEPT - 1 },
			(_, i) => ({ id: `p${i}` }),
		);
		await recordTestPlanVersion(plan);
		expect(calls.deleted).not.toHaveBeenCalled();

		calls.keepRows = Array.from({ length: MAX_PLAN_VERSIONS_KEPT }, (_, i) => ({
			id: `p${i}`,
		}));
		await recordTestPlanVersion(plan);
		expect(calls.deleted).toHaveBeenCalledOnce();
	});

	it("never throws, so a history problem cannot fail a deploy", async () => {
		calls.fail = true;
		await expect(recordTestPlanVersion(plan)).resolves.toBeUndefined();
	});
});
