import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Router-level scoping of the Snapvisor integration.
 *
 * `setApplicationProject`/`previewBuild`/`refreshPreviewBuild` take an
 * arbitrary `applicationId`/`previewDeploymentId`. Holding a role in the
 * active organization says nothing about that id, so every procedure must
 * prove the underlying application belongs to the caller's organization
 * BEFORE it touches the org's Snapvisor credentials or calls Snapvisor. The
 * access token must never be returned to the client.
 */

const SECRET_TOKEN = "sv-pat-0000000000000000beef";

const mocks = vi.hoisted(() => ({
	serviceOrganizationId: "org-1" as string | null,
	memberRole: "owner" as string,
	integration: null as Record<string, unknown> | null,
	application: null as Record<string, unknown> | null,
	previewDeployment: null as Record<string, unknown> | null,
}));

vi.mock("@dokploy/server/db", () => {
	const tableMock = () => ({
		findFirst: vi.fn(async () => undefined),
		findMany: vi.fn(async () => []),
	});
	const chain = (returning: Record<string, unknown>): any => {
		let row = returning;
		const self: any = {
			set: vi.fn((values: Record<string, unknown>) => {
				row = { ...row, ...values };
				return self;
			}),
			where: vi.fn(() => self),
			values: vi.fn((values: Record<string, unknown>) => {
				row = { ...row, ...values };
				return self;
			}),
			returning: vi.fn(async () => [row]),
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
					if (table === "snapvisorIntegration") {
						return {
							findFirst: vi.fn(async () => mocks.integration ?? undefined),
							findMany: vi.fn(async () => []),
						};
					}
					if (table === "applications") {
						return {
							findFirst: vi.fn(async () => mocks.application ?? undefined),
							findMany: vi.fn(async () => []),
						};
					}
					if (table === "previewDeployments") {
						return {
							findFirst: vi.fn(async () => mocks.previewDeployment ?? undefined),
							findMany: vi.fn(async () => []),
						};
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
			select: vi.fn(() => chain({})),
			insert: vi.fn(() => chain(mocks.integration ?? {})),
			update: vi.fn(() => chain(mocks.application ?? mocks.integration ?? {})),
			delete: vi.fn(() => chain(mocks.integration ?? {})),
		},
		dbUrl: "postgres://mock:mock@localhost:5432/mock",
	};
});

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => {}),
}));

const fetchSpy = vi.fn(async () => {
	throw new Error("Snapvisor must not be called in this test");
});
vi.stubGlobal("fetch", fetchSpy);

const { snapvisorRouter } = await import("@/server/api/routers/snapvisor");
const { createCallerFactory } = await import("@/server/api/trpc");

const createCaller = createCallerFactory(snapvisorRouter);
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
		snapvisorId: "sv-1",
		organizationId: "org-1",
		name: "Snapvisor",
		accessToken: SECRET_TOKEN,
		accountSlug: "my-team",
		baseUrl: "https://api.snapvisor.io",
		createdAt: new Date(),
	};
	mocks.application = {
		applicationId: "app-1",
		name: "web",
		snapvisorProjectName: null,
		environment: { project: { organizationId: "org-1" } },
	};
	mocks.previewDeployment = {
		previewDeploymentId: "preview-1",
		applicationId: "app-1",
		snapvisorBuildId: null,
		snapvisorBuildStatus: null,
	};
});

describe("snapvisor router org scoping", () => {
	it("rejects setApplicationProject for an application in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(
			caller().setApplicationProject({
				applicationId: "app-x",
				projectName: "web",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects setApplicationProject when the application record disagrees with the service scope", async () => {
		// assertServiceInOrganization (execute-based) passes, but the row read
		// back via findApplicationById belongs to a different organization: the
		// second, redundant check must still refuse.
		mocks.application = {
			...mocks.application,
			environment: { project: { organizationId: "org-2" } },
		};
		await expect(
			caller().setApplicationProject({
				applicationId: "app-1",
				projectName: "web",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects previewBuild for a preview of an application in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(
			caller().previewBuild({ previewDeploymentId: "preview-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects refreshPreviewBuild for a preview of an application in another organization", async () => {
		mocks.serviceOrganizationId = "org-2";
		await expect(
			caller().refreshPreviewBuild({ previewDeploymentId: "preview-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("rejects previewBuild for a compose preview (no applicationId)", async () => {
		mocks.previewDeployment = {
			...mocks.previewDeployment,
			applicationId: null,
		};
		await expect(
			caller().previewBuild({ previewDeploymentId: "preview-1" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("allows setApplicationProject for an in-organization application", async () => {
		const result = await caller().setApplicationProject({
			applicationId: "app-1",
			projectName: "web",
		});
		expect(result).toEqual({ projectName: "web" });
	});

	it("serves previewBuild for an in-organization preview with no build yet", async () => {
		const result = await caller().previewBuild({
			previewDeploymentId: "preview-1",
		});
		expect(result).toEqual({
			configured: true,
			buildId: null,
			buildStatus: null,
			reviewUrl: null,
		});
	});
});

describe("snapvisor router credentials", () => {
	it("masks the access token in one", async () => {
		const result = await caller().one();
		expect(result).not.toHaveProperty("accessToken");
		expect(result?.accessTokenMasked).toBe("••••beef");
		expect(JSON.stringify(result)).not.toContain(SECRET_TOKEN);
	});

	it("keeps credential procedures admin-only", async () => {
		await expect(caller("member").one()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(caller("member").remove()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(caller("member").projects()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("reports null from one when the org has no integration", async () => {
		mocks.integration = null;
		await expect(caller().one()).resolves.toBeNull();
	});
});
