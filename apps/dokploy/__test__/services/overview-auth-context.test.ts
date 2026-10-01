import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	count: vi.fn(),
	summary: vi.fn(),
	member: vi.fn(),
}));
vi.mock("@dokploy/server", () => ({
	countActiveDeploymentsByOrganization: mocks.count,
	getActiveDeploymentSummary: mocks.summary,
	getAllServicesForOrganization: vi.fn(),
	getAllBackupsForOrganization: vi.fn(),
	getAllDomainsForOrganization: vi.fn(),
}));
vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: mocks.member,
	hasPermission: vi.fn(),
}));
vi.mock("@/server/api/trpc", async () => {
	const { initTRPC } = await import("@trpc/server");
	const t = initTRPC
		.context<{
			authType?: "apiKey" | "session";
			user: { id: string; role: string };
			session: { activeOrganizationId: string };
			req?: { headers: Record<string, string> };
		}>()
		.create();
	return {
		createTRPCRouter: t.router,
		protectedProcedure: t.procedure,
		withPermission: () => t.procedure,
	};
});
const { overviewRouter } = await import("@/server/api/routers/overview");
beforeEach(() => {
	vi.clearAllMocks();
	mocks.count.mockResolvedValue({});
});
it.each([
	["apiKey", undefined, "org"],
	["session", { "x-api-key": "not-an-authentication-signal" }, null],
	[undefined, undefined, "org"],
] as const)(
	"uses trusted context %s instead of raw headers",
	async (authType, headers, expected) => {
		const caller = overviewRouter.createCaller({
			authType,
			user: { id: "user", role: "owner" },
			session: { activeOrganizationId: "org" },
			req: { headers: headers ?? {} },
		} as never);
		await caller.activeDeploymentsByOrganization();
		expect(mocks.count).toHaveBeenCalledWith("user", expected);
	},
);
it("scopes summary service access to the current membership", async () => {
	mocks.member.mockResolvedValue({
		role: "member",
		accessedServices: ["allowed"],
	});
	mocks.summary.mockResolvedValue({ count: 0, single: null });
	const caller = overviewRouter.createCaller({
		authType: "session",
		user: { id: "user", role: "owner" },
		session: { activeOrganizationId: "org" },
	} as never);
	await caller.activeDeploymentSummary();
	expect(mocks.summary).toHaveBeenCalledWith("org", ["allowed"]);
});
