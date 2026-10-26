import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMemberByUserId, whereClauses } = vi.hoisted(() => ({
	mockFindMemberByUserId: vi.fn(),
	whereClauses: [] as unknown[],
}));

vi.mock("@dokploy/server/db", () => {
	const query = (rows: unknown[]) => {
		const builder: Record<string, unknown> = {
			then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
		};
		for (const method of ["from", "innerJoin", "orderBy", "limit", "offset"]) {
			builder[method] = () => builder;
		}
		builder.where = (clause: unknown) => {
			whereClauses.push(clause);
			return builder;
		};
		return builder;
	};
	return {
		db: {
			select: (fields: Record<string, unknown>) =>
				query("count" in fields ? [{ count: 1 }] : [{ id: "service-1" }]),
		},
	};
});

vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: mockFindMemberByUserId,
}));

vi.mock("@dokploy/server", () => ({}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByApplication: vi.fn(),
	cleanQueuesByCompose: vi.fn(),
	killDockerBuild: vi.fn(),
	myQueue: { add: vi.fn() },
}));

const routers = {
	application: (await import("@/server/api/routers/application"))
		.applicationRouter,
	compose: (await import("@/server/api/routers/compose")).composeRouter,
	postgres: (await import("@/server/api/routers/postgres")).postgresRouter,
	mysql: (await import("@/server/api/routers/mysql")).mysqlRouter,
	mariadb: (await import("@/server/api/routers/mariadb")).mariadbRouter,
	mongo: (await import("@/server/api/routers/mongo")).mongoRouter,
	redis: (await import("@/server/api/routers/redis")).redisRouter,
};

const search = (router: keyof typeof routers, role: string) =>
	routers[router]
		.createCaller({
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-1", email: "user@example.com", role },
		} as never)
		.search({});

const whereParams = () =>
	new PgDialect().sqlToQuery(whereClauses[0] as SQL).params;

describe.each(Object.keys(routers) as (keyof typeof routers)[])(
	"%s.search",
	(router) => {
		beforeEach(() => {
			vi.clearAllMocks();
			whereClauses.length = 0;
		});

		it.each(["owner", "admin"])(
			"returns every service in the organization for an %s",
			async (role) => {
				const result = await search(router, role);

				expect(result.total).toBe(1);
				expect(mockFindMemberByUserId).not.toHaveBeenCalled();
				expect(whereParams()).toEqual(["org-1"]);
			},
		);

		it("limits a member to their accessed services", async () => {
			mockFindMemberByUserId.mockResolvedValue({
				accessedServices: ["service-1", "service-2"],
			});

			const result = await search(router, "member");

			expect(result.total).toBe(1);
			expect(whereParams()).toEqual(["org-1", "service-1", "service-2"]);
		});

		it("returns nothing for a member without accessed services", async () => {
			mockFindMemberByUserId.mockResolvedValue({ accessedServices: [] });

			await expect(search(router, "member")).resolves.toEqual({
				items: [],
				total: 0,
			});
			expect(whereClauses).toHaveLength(0);
		});
	},
);
