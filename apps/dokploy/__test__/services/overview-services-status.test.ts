import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, test, vi } from "vitest";

const whereCalls: SQL[] = [];
let countPerType = 0;

// getAllServicesForOrganization joins environments, projects and server; the count path stops at projects.
const selectChain = () => ({
	from: () => ({
		innerJoin: () => ({
			innerJoin: () => ({
				where: (clause: SQL) => {
					whereCalls.push(clause);
					return Promise.resolve([{ count: countPerType }]);
				},
				leftJoin: () => ({
					where: (clause: SQL) => {
						whereCalls.push(clause);
						return Promise.resolve([]);
					},
				}),
			}),
		}),
	}),
});

vi.mock("@dokploy/server/db", () => ({
	db: { select: vi.fn(selectChain) },
}));

vi.mock("@dokploy/server/services/permission", () => ({
	hasPermission: vi.fn(),
}));

const { getAllServicesForOrganization, countServicesForOrganization } =
	await import("@dokploy/server/services/overview");

const toSql = (clause: SQL) => new PgDialect().sqlToQuery(clause);

const expectStatusClauseOnEveryType = () => {
	expect(whereCalls).toHaveLength(8);
	const statusColumns = whereCalls.map(
		(clause) =>
			toSql(clause).sql.match(/"(applicationStatus|composeStatus)"/)?.[1],
	);
	expect(statusColumns.filter((c) => c === "composeStatus")).toHaveLength(1);
	expect(statusColumns.filter((c) => c === "applicationStatus")).toHaveLength(
		7,
	);
};

beforeEach(() => {
	whereCalls.length = 0;
	countPerType = 0;
});

describe("getAllServicesForOrganization status filter", () => {
	test("returns early without querying when the member has no services", async () => {
		expect(await getAllServicesForOrganization("org", [])).toEqual([]);
		expect(whereCalls).toHaveLength(0);
	});

	test("queries every service type without a status clause by default", async () => {
		await getAllServicesForOrganization("org", null);
		expect(whereCalls).toHaveLength(8);
		for (const clause of whereCalls) {
			const { sql, params } = toSql(clause);
			expect(sql).not.toContain("Status");
			expect(params).toEqual(["org"]);
		}
	});

	test("adds the status clause to every service type query", async () => {
		await getAllServicesForOrganization("org", null, "running");
		expectStatusClauseOnEveryType();
		for (const clause of whereCalls) {
			expect(toSql(clause).params).toEqual(["org", "running"]);
		}
	});

	test("keeps member service scoping alongside the status clause", async () => {
		await getAllServicesForOrganization("org", ["svc-1"], "running");
		for (const clause of whereCalls) {
			const { sql, params } = toSql(clause);
			expect(sql).toContain(" in (");
			expect(params).toEqual(["org", "svc-1", "running"]);
		}
	});
});

describe("countServicesForOrganization", () => {
	test("returns 0 without querying when the member has no services", async () => {
		expect(await countServicesForOrganization("org", [], "running")).toBe(0);
		expect(whereCalls).toHaveLength(0);
	});

	test("sums the per-type counts using the same status scoping", async () => {
		countPerType = 2;
		expect(await countServicesForOrganization("org", null, "running")).toBe(16);
		expectStatusClauseOnEveryType();
		for (const clause of whereCalls) {
			expect(toSql(clause).params).toEqual(["org", "running"]);
		}
	});

	test("respects accessedServices for members", async () => {
		countPerType = 1;
		expect(
			await countServicesForOrganization("org", ["svc-1", "svc-2"], "running"),
		).toBe(8);
		for (const clause of whereCalls) {
			const { sql, params } = toSql(clause);
			expect(sql).toContain(" in (");
			expect(params).toEqual(["org", "svc-1", "svc-2", "running"]);
		}
	});
});
