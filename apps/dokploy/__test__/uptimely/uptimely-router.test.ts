import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Router-level scoping of the Uptimely integration.
 *
 * Per-service procedures take an arbitrary `serviceId`. Holding a role in the
 * active organization says nothing about that id, so every procedure must
 * prove the service belongs to the caller's organization BEFORE it touches
 * the org's Uptimely credentials or calls Uptimely. The API key must never be
 * returned to the client.
 */

const SECRET_KEY = "c0ffee00-0000-4000-8000-00000000beef";

const mocks = vi.hoisted(() => ({
	serviceOrganizationId: "org-1" as string | null,
	memberRole: "owner" as string,
	integration: null as Record<string, unknown> | null,
	linksFindMany: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@dokploy/server/db", () => {
	const tableMock = () => ({
		findFirst: vi.fn(async () => undefined),
		findMany: vi.fn(async () => []),
	});
	const chain = (): any => {
		const self: any = {
			set: vi.fn(() => self),
			where: vi.fn(() => self),
			values: vi.fn(() => self),
			returning: vi.fn(async () => [{}]),
			// biome-ignore lint/suspicious/noThenProperty: drizzle's query builder is itself a thenable, so the fake standing in for it must be one too
			then: (resolve: (value: unknown) => void) => resolve([]),
		};
		return self;
	};
	return {
		db: {
			query: new Proxy({} as Record<string, unknown>, {
				get: (_target, table) => {
					if (table === "member") {
						return {
							findFirst: vi.fn(async () => ({
								id: "member-1",
								userId: "user-1",
								organizationId: "org-1",
								role: mocks.memberRole,
								accessedServices: [],
								accessedProjects: [],
								accessedEnvironments: [],
								user: { id: "user-1" },
							})),
							findMany: vi.fn(async () => []),
						};
					}
					if (table === "uptimelyIntegration") {
						return {
							findFirst: vi.fn(async () => mocks.integration ?? undefined),
							findMany: vi.fn(async () => []),
						};
					}
					if (table === "uptimelyMonitorLink") {
						return { findFirst: vi.fn(), findMany: mocks.linksFindMany };
					}
					return tableMock();
				},
			}),
			// Service → organization resolver used by assertServiceInOrganization.
			execute: vi.fn(async () =>
				mocks.serviceOrganizationId
					? [{ organizationId: mocks.serviceOrganizationId }]
					: [],
			),
			select: vi.fn(() => chain()),
			insert: vi.fn(() => chain()),
			update: vi.fn(() => chain()),
			delete: vi.fn(() => chain()),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => {}),
}));

const fetchSpy = vi.fn(async () => {
	throw new Error("Uptimely must not be called in this test");
});
vi.stubGlobal("fetch", fetchSpy);

const { uptimelyRouter } = await import("@/server/api/routers/uptimely");
const { createCallerFactory } = await import("@/server/api/trpc");

const createCaller = createCallerFactory(uptimelyRouter);
const caller = (role = "owner") =>
	createCaller({
		user: { id: "user-1", email: "owner@test.com", role },
		session: { activeOrganizationId: "org-1" },
		req: {} as unknown,
		res: {} as unknown,
	} as never);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.serviceOrganizationId = "org-1";
	mocks.memberRole = "owner";
	mocks.integration = {
		uptimelyId: "upt-1",
		organizationId: "org-1",
		name: "Uptimely",
		apiKey: SECRET_KEY,
		projectId: "11111111-1111-4111-8111-111111111111",
		baseUrl: "https://uptimely.test",
		statusPageSlug: "devino",
		createdAt: new Date(),
	};
	mocks.linksFindMany.mockResolvedValue([]);
});

describe("uptimely router org scoping", () => {
	const foreign = { serviceType: "application" as const, serviceId: "app-x" };

	it("rejects serviceStatus for a service in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(caller().serviceStatus(foreign)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(mocks.linksFindMany).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects linkService for a service in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(
			caller().linkService({ ...foreign, includeSslAndDomain: true }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects preflightService for a service in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(caller().preflightService(foreign)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("keeps preflightService behind the same gate as linkService", async () => {
		// Same permission (service:create) as linking; a bare member without
		// access to the service is refused.
		mocks.memberRole = "member";
		await expect(
			caller("member").preflightService({
				serviceType: "application",
				serviceId: "app-1",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects a malformed check path before touching anything", async () => {
		for (const checkPath of ["health", "//evil.com", "https://x", " /a"]) {
			await expect(
				caller().preflightService({
					serviceType: "application",
					serviceId: "app-1",
					checkPath,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				caller().linkService({
					serviceType: "application",
					serviceId: "app-1",
					includeSslAndDomain: false,
					checkPath,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects unlinkService and runProbe for a service in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(caller().unlinkService(foreign)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(caller().runProbe(foreign)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects an id that matches no service at all (no existence oracle)", async () => {
		mocks.serviceOrganizationId = null;
		await expect(caller().serviceStatus(foreign)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("serves an in-organization service", async () => {
		const result = await caller().serviceStatus({
			serviceType: "application",
			serviceId: "app-1",
		});
		expect(result).toMatchObject({
			configured: true,
			monitors: [],
			badgeUrl: "https://uptimely.test/status/devino/badge",
		});
		expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
	});

	it("reports configured: false when the org has no integration", async () => {
		mocks.integration = null;
		await expect(
			caller().serviceStatus({ serviceType: "redis", serviceId: "r-1" }),
		).resolves.toEqual({ configured: false });
	});
});

describe("uptimely router credentials", () => {
	it("masks the API key in one", async () => {
		const result = await caller().one();
		expect(result).not.toHaveProperty("apiKey");
		expect(result?.apiKeyMasked).toBe("••••beef");
		expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
	});

	it("keeps credential procedures admin-only", async () => {
		await expect(caller("member").one()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(caller("member").remove()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
