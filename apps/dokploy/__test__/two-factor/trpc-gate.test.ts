import { beforeEach, describe, expect, it, vi } from "vitest";
import { TWO_FACTOR_SETUP_REQUIRED } from "@/lib/two-factor";

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/index", () => ({
	hasValidLicense: vi.fn(async () => true),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));

const isTwoFactorSetupPendingForUserId = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/two-factor-policy", () => ({
	isTwoFactorSetupPendingForUserId,
}));

const {
	adminProcedure,
	cliProcedure,
	createTRPCRouter,
	enterpriseProcedure,
	protectedProcedure,
	withPermission,
} = await import("@/server/api/trpc");

const router = createTRPCRouter({
	user: createTRPCRouter({
		get: protectedProcedure.query(() => "ok"),
		session: protectedProcedure.query(() => "ok"),
	}),
	organization: createTRPCRouter({
		all: protectedProcedure.query(() => "ok"),
		setDefault: protectedProcedure.mutation(() => "ok"),
	}),
	project: createTRPCRouter({
		all: protectedProcedure.query(() => "ok"),
		create: withPermission("project", "create").mutation(() => "ok"),
	}),
	settings: createTRPCRouter({
		cli: cliProcedure.query(() => "ok"),
		admin: adminProcedure.query(() => "ok"),
		enterprise: enterpriseProcedure.query(() => "ok"),
	}),
});

const callerFor = (twoFactorSetupRequired: boolean) =>
	router.createCaller({
		session: { activeOrganizationId: "org-1" },
		user: { id: "u1", role: "owner", twoFactorSetupRequired },
	} as Parameters<typeof router.createCaller>[0]);

describe("tRPC two-factor gate", () => {
	const gated = callerFor(true);
	const compliant = callerFor(false);

	it.each([
		["project.all", () => gated.project.all()],
		["organization.setDefault", () => gated.organization.setDefault()],
		["project.create", () => gated.project.create()],
		["settings.cli", () => gated.settings.cli()],
		["settings.admin", () => gated.settings.admin()],
		["settings.enterprise", () => gated.settings.enterprise()],
	])("blocks %s for a gated user", async (_path, call) => {
		await expect(call()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: TWO_FACTOR_SETUP_REQUIRED,
		});
	});

	it("lets a gated user call allow-listed procedures", async () => {
		await expect(gated.user.get()).resolves.toBe("ok");
		await expect(gated.user.session()).resolves.toBe("ok");
		await expect(gated.organization.all()).resolves.toBe("ok");
	});

	it("lets a compliant user call everything", async () => {
		await expect(compliant.project.all()).resolves.toBe("ok");
		await expect(compliant.project.create()).resolves.toBe("ok");
		await expect(compliant.settings.cli()).resolves.toBe("ok");
		await expect(compliant.settings.admin()).resolves.toBe("ok");
		await expect(compliant.settings.enterprise()).resolves.toBe("ok");
	});

	it("still rejects unauthenticated calls", async () => {
		const anonymous = router.createCaller({
			session: null,
			user: null,
		} as Parameters<typeof router.createCaller>[0]);
		await expect(anonymous.user.get()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("doesn't query the policy for request-scoped contexts", async () => {
		await compliant.project.all();
		expect(isTwoFactorSetupPendingForUserId).not.toHaveBeenCalled();
	});
});

describe("tRPC two-factor gate on long-lived contexts", () => {
	const longLivedCaller = (twoFactorSetupRequired: boolean) =>
		router.createCaller({
			session: { activeOrganizationId: "org-1" },
			user: { id: "u1", role: "owner", twoFactorSetupRequired },
			longLived: true,
		} as Parameters<typeof router.createCaller>[0]);

	beforeEach(() => {
		isTwoFactorSetupPendingForUserId.mockReset();
	});

	it("blocks calls once the requirement applies after the connection opened", async () => {
		isTwoFactorSetupPendingForUserId.mockResolvedValue(true);
		const caller = longLivedCaller(false);

		await expect(caller.organization.setDefault()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: TWO_FACTOR_SETUP_REQUIRED,
		});
		await expect(caller.project.create()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: TWO_FACTOR_SETUP_REQUIRED,
		});
		expect(isTwoFactorSetupPendingForUserId).toHaveBeenCalledWith("u1");
	});

	it("allows calls once the user has enrolled after the connection opened", async () => {
		isTwoFactorSetupPendingForUserId.mockResolvedValue(false);

		await expect(longLivedCaller(true).project.all()).resolves.toBe("ok");
	});

	it("keeps allow-listed procedures available without a policy lookup", async () => {
		await expect(longLivedCaller(true).user.get()).resolves.toBe("ok");
		expect(isTwoFactorSetupPendingForUserId).not.toHaveBeenCalled();
	});

	it("rejects calls from a user who no longer exists", async () => {
		isTwoFactorSetupPendingForUserId.mockResolvedValue(null);

		await expect(longLivedCaller(false).project.all()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("fails closed when the policy lookup fails", async () => {
		isTwoFactorSetupPendingForUserId.mockRejectedValue(new Error("db down"));

		await expect(longLivedCaller(false).project.all()).rejects.toThrow();
	});
});
