import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, test, vi } from "vitest";

const whereCalls: SQL[] = [];

vi.mock("@dokploy/server/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: () => ({
				innerJoin: () => ({
					innerJoin: () => ({
						leftJoin: () => ({
							where: (clause: SQL) => {
								whereCalls.push(clause);
								return Promise.resolve([]);
							},
						}),
					}),
				}),
			}),
		})),
	},
}));

const { getAllServicesForOrganization } = await import(
	"@dokploy/server/services/overview"
);

const toSql = (clause: SQL) => new PgDialect().sqlToQuery(clause);

describe("getAllServicesForOrganization status filter", () => {
	beforeEach(() => {
		whereCalls.length = 0;
	});

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
		expect(whereCalls).toHaveLength(8);
		const statusColumns = whereCalls.map(
			(clause) =>
				toSql(clause).sql.match(/"(applicationStatus|composeStatus)"/)?.[1],
		);
		expect(statusColumns.filter((c) => c === "composeStatus")).toHaveLength(1);
		expect(statusColumns.filter((c) => c === "applicationStatus")).toHaveLength(
			7,
		);
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
