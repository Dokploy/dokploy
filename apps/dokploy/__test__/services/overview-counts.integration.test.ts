// Opt-in: OVERVIEW_TEST_DATABASE_URL points to a disposable local Postgres database.
// All fixtures are TEMP tables on one connection; no application rows are modified.
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	findMany: vi.fn(),
	permission: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		execute: mocks.execute,
		query: { member: { findMany: mocks.findMany } },
	},
}));
vi.mock("@dokploy/server/services/permission", () => ({
	hasPermission: mocks.permission,
}));
const { countActiveDeploymentsByOrganization, getActiveDeploymentSummary } =
	await import("@dokploy/server/services/overview");
const url = globalThis.process.env.OVERVIEW_TEST_DATABASE_URL;
const tables = [
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
];
let connection: ReturnType<typeof postgres>;
let memberships: {
	organizationId: string;
	role: string;
	accessedServices: string[] | null;
}[];
const dialect = new PgDialect();
describe.skipIf(!url)("active deployment aggregates on PostgreSQL", () => {
	beforeAll(async () => {
		connection = postgres(url!, { max: 1 });
		await connection.unsafe(
			'CREATE TEMP TABLE project ("projectId" text, "organizationId" text); CREATE TEMP TABLE environment ("environmentId" text,"projectId" text);',
		);
		for (const table of tables) {
			const status =
				table === "compose" ? "composeStatus" : "applicationStatus";
			await connection.unsafe(
				`CREATE TEMP TABLE "${table}" ("${table}Id" text, name text,"environmentId" text,"${status}" text);`,
			);
		}
		mocks.execute.mockImplementation((query: SQL) => {
			const { sql, params } = dialect.sqlToQuery(query);
			return connection.unsafe(sql, params as never[]);
		});
		mocks.findMany.mockImplementation(({ where }: { where: SQL }) => {
			const org = dialect.sqlToQuery(where).params[1];
			return memberships.filter((m) => !org || m.organizationId === org);
		});
		mocks.permission.mockImplementation(
			(ctx) => ctx.session.activeOrganizationId !== "denied",
		);
	});
	beforeEach(async () => {
		mocks.execute.mockClear();
		await connection.unsafe(
			`TRUNCATE ${["project", "environment", ...tables].map((t) => `"${t}"`).join(",")};`,
		);
		memberships = [];
	});
	afterAll(async () => {
		await connection?.end();
	});
	async function addOrg(
		org: string,
		role = "owner",
		accessedServices: string[] | null = null,
	) {
		memberships.push({ organizationId: org, role, accessedServices });
		await connection`INSERT INTO project VALUES (${org},${org});`;
		await connection`INSERT INTO environment VALUES (${org},${org});`;
	}
	async function addService(
		table: string,
		id: string,
		org: string,
		status = "running",
	) {
		await connection.unsafe(`INSERT INTO "${table}" VALUES ($1,$2,$3,$4)`, [
			id,
			`Name ${id}`,
			org,
			status,
		]);
	}
	it("counts all eight service types across ten organizations in a single query", async () => {
		for (let i = 0; i < 10; i++) {
			const org = `org-${i}`;
			await addOrg(org);
			for (const table of tables)
				await addService(table, `${org}-${table}`, org);
		}
		const result = await countActiveDeploymentsByOrganization("user", null);
		expect(Object.keys(result)).toHaveLength(10);
		expect(Object.values(result)).toEqual(Array(10).fill(8));
		expect(mocks.execute).toHaveBeenCalledTimes(1);
	});
	it("never leaks another tenant's service IDs or a denied/empty membership", async () => {
		await addOrg("owner");
		await addOrg("member", "member", ["allowed", "other-tenant"]);
		await addOrg("denied");
		await addOrg("empty", "member", []);
		await addService("application", "other-tenant", "owner");
		await addService("compose", "allowed", "member");
		await addService("postgres", "hidden", "member");
		await addService("redis", "private", "denied");
		await addService("mysql", "not-assigned", "empty");
		expect(await countActiveDeploymentsByOrganization("user", null)).toEqual({
			owner: 1,
			member: 1,
			denied: 0,
			empty: 0,
		});
		expect(
			await countActiveDeploymentsByOrganization("user", "member"),
		).toEqual({ member: 1 });
	});
	it("returns the exact single target, excludes non-running services, and drops the target for multiple services", async () => {
		await addOrg("team");
		await addService("compose", "live", "team");
		await addService("application", "finished", "team", "done");
		expect(await getActiveDeploymentSummary("team", null)).toEqual({
			count: 1,
			single: {
				id: "live",
				name: "Name live",
				type: "compose",
				projectId: "team",
				environmentId: "team",
			},
		});
		await addService("redis", "cache", "team");
		expect(await getActiveDeploymentSummary("team", null)).toEqual({
			count: 2,
			single: null,
		});
		expect(await getActiveDeploymentSummary("team", [])).toEqual({
			count: 0,
			single: null,
		});
		expect(await getActiveDeploymentSummary("team", ["live"])).toMatchObject({
			count: 1,
			single: { id: "live", type: "compose" },
		});
	});
});
