import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMemberByUserId, whereClauses } = vi.hoisted(() => ({
	mockFindMemberByUserId: vi.fn(),
	whereClauses: [] as unknown[],
}));

vi.mock("@dokploy/server/db", () => {
	const query = (rows: unknown[]) => {
		const builder = Object.assign(Promise.resolve(rows), {
			from: () => builder,
			innerJoin: () => builder,
			orderBy: () => builder,
			limit: () => builder,
			offset: () => builder,
			where: (clause: unknown) => {
				whereClauses.push(clause);
				return builder;
			},
		});
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

const search = (router: keyof typeof routers, sessionRole = "member") =>
	routers[router]
		.createCaller({
			session: { activeOrganizationId: "org-1" },
			user: { id: "user-1", email: "user@example.com", role: sessionRole },
		} as never)
		.search({});

const membership = (role: string, accessedServices: string[] = []) =>
	mockFindMemberByUserId.mockResolvedValue({ role, accessedServices });

const params = (clause: unknown) =>
	new PgDialect().sqlToQuery(clause as SQL).params;

const expectBothQueriesFilteredBy = (expected: string[]) => {
	expect(whereClauses).toHaveLength(2);
	for (const clause of whereClauses) {
		expect(params(clause)).toEqual(expected);
	}
};

describe.each(Object.keys(routers) as (keyof typeof routers)[])(
	"%s.search",
	(router) => {
		beforeEach(() => {
			vi.clearAllMocks();
			whereClauses.length = 0;
		});

		it.each(["owner", "admin"])(
			"returns every service in the active organization for an %s",
			async (role) => {
				membership(role);

				const result = await search(router, role);

				expect(result.total).toBe(1);
				expect(mockFindMemberByUserId).toHaveBeenCalledWith("user-1", "org-1");
				expectBothQueriesFilteredBy(["org-1"]);
			},
		);

		it.each(["member", "custom-viewer"])(
			"limits a %s to their accessed services",
			async (role) => {
				membership(role, ["service-1", "service-2"]);

				const result = await search(router, role);

				expect(result.total).toBe(1);
				expectBothQueriesFilteredBy(["org-1", "service-1", "service-2"]);
			},
		);

		it("uses the membership role, not the session role", async () => {
			membership("member", ["service-1"]);

			await search(router, "owner");

			expectBothQueriesFilteredBy(["org-1", "service-1"]);
		});

		it("returns nothing for a member without accessed services", async () => {
			membership("member");

			await expect(search(router)).resolves.toEqual({ items: [], total: 0 });
			expect(whereClauses).toHaveLength(0);
		});

		it("rejects callers without a membership in the active organization", async () => {
			mockFindMemberByUserId.mockRejectedValue(
				new TRPCError({ code: "UNAUTHORIZED", message: "Permission denied" }),
			);

			await expect(search(router, "owner")).rejects.toThrow(
				"Permission denied",
			);
			expect(whereClauses).toHaveLength(0);
		});
	},
);
