import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	isCloud: true,
	findUserById: vi.fn(),
	updateUser: vi.fn(),
	findServersByUserId: vi.fn(),
	getBillingStatus: vi.fn(),
	getCurrentPlan: vi.fn(),
	getStripeClient: vi.fn(),
	getStripeItems: vi.fn(),
	checkoutCreate: vi.fn(),
	customersRetrieve: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return mocks.isCloud;
	},
	findUserById: mocks.findUserById,
	updateUser: mocks.updateUser,
	findServersByUserId: mocks.findServersByUserId,
}));

vi.mock("@/server/api/trpc", async () => {
	const { initTRPC, TRPCError } = await import("@trpc/server");
	const t = initTRPC.create();
	return {
		adminProcedure: t.procedure.use(({ ctx, next }) => {
			// The mocked tRPC has no context type, so cast to the shape we pass in tests.
			const c = ctx as {
				session?: unknown;
				user?: { role?: string };
			};
			if (
				!c.session ||
				!c.user ||
				(c.user.role !== "owner" && c.user.role !== "admin")
			) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return next({ ctx: { session: c.session, user: c.user } });
		}),
		createTRPCRouter: t.router,
		protectedProcedure: t.procedure,
		withPermission: () => t.procedure.use(({ next }) => next()),
	};
});

vi.mock("@/server/utils/billing", () => ({
	getBillingStatus: mocks.getBillingStatus,
	getCurrentPlan: mocks.getCurrentPlan,
	getStripeClient: mocks.getStripeClient,
	TRIAL_DURATION_DAYS: 14,
	TRIAL_SERVER_LIMIT: 1,
}));

vi.mock("@/server/utils/stripe", () => ({
	getStripeItems: mocks.getStripeItems,
	HOBBY_PRICE_ANNUAL_ID: "price_hobby_annual",
	HOBBY_PRICE_MONTHLY_ID: "price_hobby_monthly",
	HOBBY_PRODUCT_ID: "prod_hobby",
	LEGACY_PRICE_IDS: ["price_legacy_monthly", "price_legacy_annual"],
	PRODUCT_ANNUAL_ID: "prod_annual",
	PRODUCT_MONTHLY_ID: "prod_monthly",
	STARTUP_BASE_PRICE_ANNUAL_ID: "price_startup_annual",
	STARTUP_BASE_PRICE_MONTHLY_ID: "price_startup_monthly",
	STARTUP_PRODUCT_ID: "prod_startup",
	WEBSITE_URL: "https://app.example.com",
}));

vi.mock("stripe", () => ({
	default: class MockStripe {
		checkout = { sessions: { create: mocks.checkoutCreate } };
		customers = { retrieve: mocks.customersRetrieve };
	},
}));

const { stripeRouter } = await import("@/server/api/routers/stripe");

const ownerCtx = {
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", role: "owner", ownerId: "owner-1" },
};

const input = (tier: "legacy" | "hobby" | "startup") => ({
	tier,
	productId: "prod_x",
	serverQuantity: tier === "startup" ? 3 : 1,
	isAnnual: false,
});

// The real router infers a full Next context type (db/req/res/...); the mocked
// procedures only read session+user. Cast so tests can pass a minimal context.
const makeCaller = (ctx: unknown) => stripeRouter.createCaller(ctx as never);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.isCloud = true;
	mocks.findUserById.mockResolvedValue({
		id: "owner-1",
		email: "owner@example.com",
		stripeCustomerId: "cus_1",
	});
	mocks.getStripeItems.mockReturnValue([{ price: "price_x", quantity: 1 }]);
	mocks.customersRetrieve.mockResolvedValue({ deleted: false });
	mocks.checkoutCreate.mockResolvedValue({ id: "cs_test_123" });
});

describe("createCheckoutSession — duplicate-subscription guard", () => {
	it("rejects a trialing user with 'You already have an active plan or trial' and never calls Stripe", async () => {
		mocks.getBillingStatus.mockResolvedValue({
			hasActiveAccess: true,
			isOnTrial: true,
			plan: "hobby",
		});
		const caller = makeCaller(ownerCtx);
		await expect(caller.createCheckoutSession(input("hobby"))).rejects.toThrow(
			"You already have an active plan or trial",
		);
		expect(mocks.findUserById).toHaveBeenCalledWith("owner-1");
		expect(mocks.getBillingStatus).toHaveBeenCalledWith("owner-1");
		expect(mocks.checkoutCreate).not.toHaveBeenCalled();
	});

	it("rejects a user with an active (non-trial) plan and never calls Stripe", async () => {
		mocks.getBillingStatus.mockResolvedValue({
			hasActiveAccess: true,
			isOnTrial: false,
			plan: "startup",
		});
		const caller = makeCaller(ownerCtx);
		await expect(
			caller.createCheckoutSession(input("startup")),
		).rejects.toThrow("You already have an active plan or trial");
		expect(mocks.checkoutCreate).not.toHaveBeenCalled();
	});

	it("rejects non-cloud callers before any user/billing/Stripe call", async () => {
		mocks.isCloud = false;
		const caller = makeCaller(ownerCtx);
		await expect(caller.createCheckoutSession(input("hobby"))).rejects.toThrow(
			"only available in Dokploy Cloud",
		);
		expect(mocks.findUserById).not.toHaveBeenCalled();
		expect(mocks.getBillingStatus).not.toHaveBeenCalled();
		expect(mocks.checkoutCreate).not.toHaveBeenCalled();
	});
});

describe("createCheckoutSession — happy path (no existing plan/trial)", () => {
	it("creates a Stripe checkout session for an eligible user and returns the session id", async () => {
		mocks.getBillingStatus.mockResolvedValue({
			hasActiveAccess: false,
			isOnTrial: false,
			plan: null,
		});
		const caller = makeCaller(ownerCtx);
		const result = await caller.createCheckoutSession(input("hobby"));
		expect(result).toEqual({ sessionId: "cs_test_123" });
		expect(mocks.getStripeItems).toHaveBeenCalledWith("hobby", 1, false);
		expect(mocks.customersRetrieve).toHaveBeenCalledWith("cus_1");
		expect(mocks.checkoutCreate).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "subscription",
				line_items: [{ price: "price_x", quantity: 1 }],
				customer: "cus_1",
				metadata: { adminId: "owner-1" },
			}),
		);
	});

	it("creates a checkout session when the customer has no stripe id (email-based checkout)", async () => {
		mocks.findUserById.mockResolvedValue({
			id: "owner-1",
			email: "owner@example.com",
			stripeCustomerId: null,
		});
		mocks.getBillingStatus.mockResolvedValue({
			hasActiveAccess: false,
			isOnTrial: false,
			plan: null,
		});
		const caller = makeCaller(ownerCtx);
		const result = await caller.createCheckoutSession(input("hobby"));
		expect(result).toEqual({ sessionId: "cs_test_123" });
		expect(mocks.customersRetrieve).not.toHaveBeenCalled();
		expect(mocks.checkoutCreate).toHaveBeenCalledWith(
			expect.objectContaining({ customer_email: "owner@example.com" }),
		);
	});
});
