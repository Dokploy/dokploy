import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An expired, unfinished DoDomain connect session is equivalent to an
 * abandoned one: the domain goes back from "pending" to "unverified" and
 * drops its session id, even when the `session.abandoned` webhook never
 * arrives (an instance on a private network has no webhook endpoint).
 *
 * The reset is ONE conditional UPDATE, so the decision lives in SQL. The
 * mocked db here builds the real drizzle statement (no connection) and
 * records its rendered SQL and params; the tests assert the conditions that
 * keep verified/failed domains, live sessions and completed connections
 * untouched, and that callers act on whatever the UPDATE reports.
 */

const mocks = vi.hoisted(() => ({
	domain: null as Record<string, unknown> | null,
	/** Rows the (mocked) UPDATE ... RETURNING reports as reset. */
	resetRows: [] as { domainId: string }[],
	statements: [] as { sql: string; params: unknown[] }[],
	session: null as Record<string, unknown> | null,
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/db", async () => {
	const { drizzle } = await import("drizzle-orm/postgres-js");
	const postgres = (await import("postgres")).default;
	// postgres-js connects lazily, so building statements needs no server.
	const builder = drizzle(postgres("postgres://mock:mock@localhost:5432/mock"));
	return {
		db: {
			query: new Proxy({} as Record<string, unknown>, {
				get: (_target, table) => {
					if (table === "domains") {
						return {
							findFirst: vi.fn(async () => mocks.domain ?? undefined),
						};
					}
					if (table === "dodomainConnectSession") {
						return { findFirst: vi.fn(async () => mocks.session ?? undefined) };
					}
					return { findFirst: vi.fn(async () => undefined) };
				},
			}),
			select: (...args: unknown[]) =>
				(builder.select as (...a: unknown[]) => unknown)(...args),
			update: (table: never) => ({
				set: (values: never) => ({
					where: (condition: never) => ({
						returning: (fields: never) => {
							const query = builder
								.update(table)
								.set(values)
								.where(condition)
								.returning(fields)
								.toSQL();
							mocks.statements.push({
								sql: query.sql,
								params: query.params,
							});
							return Promise.resolve(mocks.resetRows);
						},
					}),
				}),
			}),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@dokploy/server/services/application", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/application")
	>()),
	findApplicationById: mocks.findApplicationById,
}));

const {
	expireStaleDoDomainSessions,
	getDoDomainConnectionStatus,
	withExpiredDoDomainSessionsReset,
} = await import("@dokploy/server/services/dodomain");

const integration = {
	dodomainId: "dd-1",
	organizationId: "org-1",
	name: "DoDomain",
	secretKey: "dd_sk_test",
	appId: "app_1",
	baseUrl: "https://dodomain.test",
	webhookEndpointId: null,
	webhookUrl: null,
	webhookSecret: null,
	createdAt: new Date(),
};

const application = {
	applicationId: "app-1",
	appName: "web-abc",
	name: "Web",
	serverId: null,
	server: null,
	environmentId: "env-1",
	environment: {
		projectId: "proj-1",
		project: { projectId: "proj-1", name: "Shop", organizationId: "org-1" },
	},
};

const pendingDomain = {
	domainId: "dom-1",
	host: "openrouter.example.com",
	applicationId: "app-1",
	composeId: null,
	dodomainSessionId: "ses_1",
	dodomainConnectionId: null,
	dnsVerificationStatus: "pending" as const,
	dnsVerifiedAt: null,
};

const expiredSession = {
	sessionId: "ses_1",
	domainId: "dom-1",
	dodomainId: "dd-1",
	connectUrl: "https://dodomain.test/connect/ses_1",
	records: [{ type: "A", host: "@", value: "203.0.113.10" }],
	expiresAt: new Date(Date.now() - 86_400_000),
	createdAt: new Date(Date.now() - 2 * 86_400_000),
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.domain = { ...pendingDomain };
	mocks.session = { ...expiredSession };
	mocks.resetRows = [];
	mocks.statements = [];
	mocks.findApplicationById.mockResolvedValue(application);
});

describe("expireStaleDoDomainSessions", () => {
	it("does not touch the database for an empty list", async () => {
		await expect(expireStaleDoDomainSessions([])).resolves.toEqual([]);
		expect(mocks.statements).toHaveLength(0);
	});

	it("resets to unverified and clears the session id, scoped to the given domains", async () => {
		mocks.resetRows = [{ domainId: "dom-1" }];
		await expect(
			expireStaleDoDomainSessions(["dom-1", "dom-2"]),
		).resolves.toEqual(["dom-1"]);

		expect(mocks.statements).toHaveLength(1);
		const { sql, params } = mocks.statements[0] as {
			sql: string;
			params: unknown[];
		};
		expect(sql).toMatch(/^update "domain" set /);
		expect(sql).toContain('set "dodomainSessionId" = $1');
		expect(sql).toContain('"dnsVerificationStatus" = $2');
		// SET NULL session id + unverified; WHERE ... IN (ids) AND status = pending.
		expect(params.slice(0, 2)).toEqual([null, "unverified"]);
		expect(params).toEqual(
			expect.arrayContaining(["dom-1", "dom-2", "pending"]),
		);
		expect(sql).toContain('"domain"."domainId" in ($3, $4)');
	});

	it("only ever matches pending domains (verified and failed are never touched)", async () => {
		await expireStaleDoDomainSessions(["dom-1"]);
		const { sql, params } = mocks.statements[0] as {
			sql: string;
			params: unknown[];
		};
		expect(sql).toMatch(/"domain"\."dnsVerificationStatus" = \$\d+/);
		expect(params).toContain("pending");
		expect(params).not.toContain("verified");
		expect(params).not.toContain("failed");
	});

	it("only resets when the current session is not live, in the same statement", async () => {
		const before = Date.now();
		await expireStaleDoDomainSessions(["dom-1"]);
		const { sql, params } = mocks.statements[0] as {
			sql: string;
			params: unknown[];
		};
		// "No unexpired session row for the session id the domain points at".
		expect(sql).toMatch(
			/not exists \(select 1 from "dodomain_connect_session" where \("dodomain_connect_session"\."sessionId" = "domain"\."dodomainSessionId" and "dodomain_connect_session"\."expiresAt" > \$\d+\)\)/,
		);
		// The cutoff goes through the typed timestamp column (serialized by
		// drizzle), never as a raw Date interpolated in a sql`` template.
		const cutoff = params.at(-1);
		expect(typeof cutoff).toBe("string");
		const cutoffMs = new Date(cutoff as string).getTime();
		expect(cutoffMs).toBeGreaterThanOrEqual(before);
		expect(cutoffMs).toBeLessThanOrEqual(Date.now());
	});

	it("skips a domain that already holds a connection (session.completed ran)", async () => {
		await expireStaleDoDomainSessions(["dom-1"]);
		const { sql } = mocks.statements[0] as { sql: string };
		expect(sql).toContain('"dodomainConnectionId" is null');
	});
});

describe("withExpiredDoDomainSessionsReset", () => {
	it("returns the list as-is without writing when nothing is pending", async () => {
		const rows = [
			{ ...pendingDomain, dnsVerificationStatus: "verified" as const },
			{ ...pendingDomain, domainId: "dom-2", dnsVerificationStatus: null },
		];
		await expect(withExpiredDoDomainSessionsReset(rows)).resolves.toBe(rows);
		expect(mocks.statements).toHaveLength(0);
	});

	it("only submits the pending domains to the UPDATE", async () => {
		const rows = [
			{
				...pendingDomain,
				domainId: "dom-v",
				dnsVerificationStatus: "verified" as const,
			},
			{ ...pendingDomain, domainId: "dom-p" },
		];
		await withExpiredDoDomainSessionsReset(rows);
		expect(mocks.statements).toHaveLength(1);
		const { params } = mocks.statements[0] as { params: unknown[] };
		expect(params).toContain("dom-p");
		expect(params).not.toContain("dom-v");
	});

	it("reflects an expired pending domain as unverified with no session", async () => {
		mocks.resetRows = [{ domainId: "dom-1" }];
		const rows = [
			{ ...pendingDomain },
			{ ...pendingDomain, domainId: "dom-live", dodomainSessionId: "ses_2" },
		];
		const result = await withExpiredDoDomainSessionsReset(rows);
		expect(result[0]).toMatchObject({
			domainId: "dom-1",
			dnsVerificationStatus: "unverified",
			dodomainSessionId: null,
		});
		// The row the UPDATE did not report (live session) is left as stored.
		expect(result[1]).toEqual(rows[1]);
	});

	it("leaves a pending domain with a live session unchanged", async () => {
		mocks.resetRows = [];
		const rows = [{ ...pendingDomain }];
		const result = await withExpiredDoDomainSessionsReset(rows);
		expect(result).toEqual([pendingDomain]);
	});
});

describe("getDoDomainConnectionStatus", () => {
	it("reports unverified and no connect URL for a pending domain whose session expired", async () => {
		mocks.resetRows = [{ domainId: "dom-1" }];
		const status = await getDoDomainConnectionStatus({
			integration,
			domainId: "dom-1",
		});
		expect(status.status).toBe("unverified");
		expect(status.connectUrl).toBeNull();
		expect(status.records).toEqual([]);
		expect(status.sessionExpiresAt).toBeNull();
		expect(mocks.statements).toHaveLength(1);
	});

	it("keeps a live pending session pending with its connect URL", async () => {
		mocks.session = {
			...expiredSession,
			expiresAt: new Date(Date.now() + 86_400_000),
		};
		mocks.resetRows = [];
		const status = await getDoDomainConnectionStatus({
			integration,
			domainId: "dom-1",
		});
		expect(status.status).toBe("pending");
		expect(status.connectUrl).toBe(expiredSession.connectUrl);
	});

	it("never resets (or even attempts to reset) a verified domain", async () => {
		mocks.domain = {
			...pendingDomain,
			dnsVerificationStatus: "verified",
			dodomainConnectionId: "conn_1",
		};
		const status = await getDoDomainConnectionStatus({
			integration,
			domainId: "dom-1",
		});
		expect(status.status).toBe("verified");
		expect(status.connectUrl).toBeNull();
		expect(mocks.statements).toHaveLength(0);
	});
});
