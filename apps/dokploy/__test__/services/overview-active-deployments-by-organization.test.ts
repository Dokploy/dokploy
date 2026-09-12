import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Membership = {
	organizationId: string;
	role: string;
	accessedServices: string[];
};

const memberships: Membership[] = [
	{ organizationId: "org-a", role: "owner", accessedServices: [] },
	{ organizationId: "org-b", role: "member", accessedServices: ["svc-b"] },
	{ organizationId: "org-c", role: "member", accessedServices: ["svc-c"] },
];
const readableOrganizations = new Set(["org-a", "org-b"]);
const membershipWhere: SQL[] = [];
const countWhere: SQL[] = [];

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findMany: vi.fn(({ where }: { where: SQL }) => {
					membershipWhere.push(where);
					const { params } = new PgDialect().sqlToQuery(where);
					// The where clause carries [userId] or [userId, organizationId]
					const scopedTo = params[1] as string | undefined;
					return Promise.resolve(
						memberships.filter(
							(m) => !scopedTo || m.organizationId === scopedTo,
						),
					);
				}),
			},
		},
		select: vi.fn(() => ({
			from: () => ({
				innerJoin: () => ({
					innerJoin: () => ({
						where: (clause: SQL) => {
							countWhere.push(clause);
							return Promise.resolve([{ count: 1 }]);
						},
					}),
				}),
			}),
		})),
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	hasPermission: vi.fn((ctx: { session: { activeOrganizationId: string } }) =>
		Promise.resolve(
			readableOrganizations.has(ctx.session.activeOrganizationId),
		),
	),
}));

const { countActiveDeploymentsByOrganization } = await import(
	"@dokploy/server/services/overview"
);

beforeEach(() => {
	membershipWhere.length = 0;
	countWhere.length = 0;
});

describe("countActiveDeploymentsByOrganization", () => {
	test("session users get a count for every readable organization", async () => {
		const result = await countActiveDeploymentsByOrganization("user-1", null);

		// 8 service types × 2 readable organizations; org-c lacks service:read and is never counted
		expect(result).toEqual({ "org-a": 8, "org-b": 8, "org-c": 0 });
		expect(countWhere).toHaveLength(16);
		expect(new PgDialect().sqlToQuery(membershipWhere[0]!).params).toEqual([
			"user-1",
		]);
	});

	test("owner/admin memberships are not restricted by accessedServices, members are", async () => {
		await countActiveDeploymentsByOrganization("user-1", null);

		const paramsPerQuery = countWhere.map(
			(clause) => new PgDialect().sqlToQuery(clause).params,
		);
		expect(paramsPerQuery.filter((p) => p[0] === "org-a")).toEqual(
			Array(8).fill(["org-a", "running"]),
		);
		expect(paramsPerQuery.filter((p) => p[0] === "org-b")).toEqual(
			Array(8).fill(["org-b", "svc-b", "running"]),
		);
	});

	test("an organization-scoped lookup (API key) never touches other memberships", async () => {
		const result = await countActiveDeploymentsByOrganization(
			"user-1",
			"org-b",
		);

		expect(result).toEqual({ "org-b": 8 });
		expect(new PgDialect().sqlToQuery(membershipWhere[0]!).params).toEqual([
			"user-1",
			"org-b",
		]);
		expect(
			countWhere.every(
				(clause) => new PgDialect().sqlToQuery(clause).params[0] === "org-b",
			),
		).toBe(true);
	});

	test("an organization-scoped lookup without service:read returns 0 without counting", async () => {
		const result = await countActiveDeploymentsByOrganization(
			"user-1",
			"org-c",
		);

		expect(result).toEqual({ "org-c": 0 });
		expect(countWhere).toHaveLength(0);
	});
});
