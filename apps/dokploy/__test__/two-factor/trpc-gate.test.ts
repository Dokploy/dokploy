import { describe, expect, it, vi } from "vitest";
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
});
