import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Membership = {
	organizationId: string;
	role: string;
	accessedServices: string[] | null;
};
const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	findMany: vi.fn(),
	hasPermission: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		execute: mocks.execute,
		query: { member: { findMany: mocks.findMany } },
	},
}));
vi.mock("@dokploy/server/services/permission", () => ({
	hasPermission: mocks.hasPermission,
}));
const { countActiveDeploymentsByOrganization, getActiveDeploymentSummary } =
	await import("@dokploy/server/services/overview");
const dialect = new PgDialect();
let memberships: Membership[];
beforeEach(() => {
	vi.clearAllMocks();
	memberships = [
		{ organizationId: "org-a", role: "owner", accessedServices: [] },
		{ organizationId: "org-b", role: "member", accessedServices: ["svc-b"] },
		{ organizationId: "org-c", role: "member", accessedServices: ["svc-c"] },
	];
	mocks.findMany.mockImplementation(({ where }: { where: SQL }) => {
		const org = dialect.sqlToQuery(where).params[1];
		return memberships.filter((m) => !org || m.organizationId === org);
	});
	mocks.hasPermission.mockImplementation(
		(ctx) => ctx.session.activeOrganizationId !== "org-c",
	);
	mocks.execute.mockResolvedValue([
		{ organizationId: "org-a", count: 8 },
		{ organizationId: "org-b", count: 2 },
	]);
});

describe("batched organization deployment counts", () => {
	test("uses one aggregate query for ten organizations instead of eighty queries", async () => {
		memberships = Array.from({ length: 10 }, (_, i) => ({
			organizationId: `team-${i}`,
			role: "owner",
			accessedServices: [],
		}));
		mocks.execute.mockResolvedValue(
			memberships.map((m) => ({ organizationId: m.organizationId, count: 8 })),
		);
		const result = await countActiveDeploymentsByOrganization("user", null);
		expect(Object.values(result)).toEqual(Array(10).fill(8));
		expect(mocks.execute).toHaveBeenCalledTimes(1);
		const query = dialect.sqlToQuery(mocks.execute.mock.calls[0]![0]);
		expect(query.sql.match(/union all/g)).toHaveLength(7);
		expect(query.sql).not.toContain('"deployment"');
		expect(query.sql).not.toContain('"server"');
	});
	test("keeps permission-denied organizations at zero and scopes members within their organization", async () => {
		expect(await countActiveDeploymentsByOrganization("user", null)).toEqual({
			"org-a": 8,
			"org-b": 2,
			"org-c": 0,
		});
		const { sql, params } = dialect.sqlToQuery(mocks.execute.mock.calls[0]![0]);
		expect(params).toContain("svc-b");
		expect(params).not.toContain("svc-c");
		expect(params).not.toContain("org-c");
		expect(sql).toContain('"organizationId" =');
		expect(sql).toContain('"applicationId" in');
	});
	test("organization-scoped API access never queries other organizations", async () => {
		mocks.execute.mockResolvedValue([{ organizationId: "org-b", count: 2 }]);
		expect(await countActiveDeploymentsByOrganization("user", "org-b")).toEqual(
			{ "org-b": 2 },
		);
		const { params } = dialect.sqlToQuery(mocks.execute.mock.calls[0]![0]);
		expect(params).not.toContain("org-a");
		expect(params).toContain("org-b");
	});
	test("does not count inaccessible or empty memberships", async () => {
		expect(await countActiveDeploymentsByOrganization("user", "org-c")).toEqual(
			{ "org-c": 0 },
		);
		memberships = [
			{ organizationId: "empty", role: "member", accessedServices: [] },
		];
		expect(await countActiveDeploymentsByOrganization("user", null)).toEqual({
			empty: 0,
		});
		memberships = [];
		expect(await countActiveDeploymentsByOrganization("user", null)).toEqual(
			{},
		);
		expect(mocks.execute).not.toHaveBeenCalled();
	});
	test("returns only a single navigation target when exactly one service is active", async () => {
		const row = {
			organizationId: "org-a",
			count: 1,
			id: "app",
			name: "API",
			type: "application",
			projectId: "project",
			environmentId: "env",
		};
		mocks.execute.mockResolvedValue([row]);
		expect(await getActiveDeploymentSummary("org-a", null)).toEqual({
			count: 1,
			single: {
				id: "app",
				name: "API",
				type: "application",
				projectId: "project",
				environmentId: "env",
			},
		});
		mocks.execute.mockResolvedValue([{ ...row, count: 2 }]);
		expect(await getActiveDeploymentSummary("org-a", null)).toEqual({
			count: 2,
			single: null,
		});
		mocks.execute.mockResolvedValue([]);
		expect(await getActiveDeploymentSummary("org-a", null)).toEqual({
			count: 0,
			single: null,
		});
	});
});
