import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	subscriptionsList: vi.fn(),
	findUserById: vi.fn(),
	isCloud: true,
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return mocks.isCloud;
	},
	findUserById: mocks.findUserById,
}));

vi.mock("@dokploy/server/services/proprietary/sso", () => ({
	getOrganizationOwnerId: vi.fn(),
}));

vi.mock("@/server/utils/stripe", () => ({
	HOBBY_PRICE_MONTHLY_ID: "price_hobby_monthly",
	HOBBY_PRICE_ANNUAL_ID: "price_hobby_annual",
	STARTUP_BASE_PRICE_MONTHLY_ID: "price_startup_monthly",
	STARTUP_BASE_PRICE_ANNUAL_ID: "price_startup_annual",
	LEGACY_PRICE_IDS: ["price_legacy_monthly", "price_legacy_annual"],
}));

vi.mock("stripe", () => ({
	default: class MockStripe {
		subscriptions = { list: mocks.subscriptionsList };
	},
}));

const { getBillingStatus, TRIAL_DURATION_DAYS } = await import(
	"@/server/utils/billing"
);

const HOBBY_MONTHLY = "price_hobby_monthly";

const nowSeconds = () => Math.floor(Date.now() / 1000);

const makeSub = (opts: {
	status: "active" | "trialing";
	priceId: string;
	trialEnd?: number;
}) => ({
	id: `sub_${opts.status}_${opts.priceId}`,
	status: opts.status,
	trial_end: opts.trialEnd ?? null,
	items: { data: [{ price: { id: opts.priceId }, quantity: 1 }] },
});

const ownerWith = (stripeCustomerId: string | null) => ({
	id: "owner-1",
	email: "owner@example.com",
	stripeCustomerId,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.isCloud = true;
	mocks.findUserById.mockResolvedValue(ownerWith("cus_1"));
});

describe("getBillingStatus — non-cloud", () => {
	it("reports active access for self-hosted (IS_CLOUD=false) without calling Stripe", async () => {
		mocks.isCloud = false;
		const status = await getBillingStatus("owner-1");
		expect(status.hasActiveAccess).toBe(true);
		expect(status.plan).toBeNull();
		expect(status.isOnTrial).toBe(false);
		expect(mocks.findUserById).not.toHaveBeenCalled();
		expect(mocks.subscriptionsList).not.toHaveBeenCalled();
	});
});

describe("getBillingStatus — cloud, no subscription", () => {
	it("reports no access when the customer has zero subscriptions", async () => {
		mocks.subscriptionsList.mockResolvedValue({ data: [] });
		const status = await getBillingStatus("owner-1");
		expect(status.hasActiveAccess).toBe(false);
		expect(status.plan).toBeNull();
		expect(status.isOnTrial).toBe(false);
		expect(status.hasUsedTrial).toBe(false);
		expect(mocks.subscriptionsList).toHaveBeenCalledWith(
			expect.objectContaining({ customer: "cus_1", status: "all" }),
		);
	});
});

describe("getBillingStatus — cloud, trialing subscription (the contract the checkout gate relies on)", () => {
	it("reports isOnTrial=true, plan=hobby, and hasActiveAccess=true for a trialing hobby sub — even though getProducts (status:active) would hide it", async () => {
		const trialEnd = nowSeconds() + 14 * 24 * 60 * 60;
		mocks.subscriptionsList.mockResolvedValue({
			data: [makeSub({ status: "trialing", priceId: HOBBY_MONTHLY, trialEnd })],
		});
		const status = await getBillingStatus("owner-1");
		expect(status.isOnTrial).toBe(true);
		expect(status.plan).toBe("hobby");
		expect(status.hasActiveAccess).toBe(true);
		expect(status.hasUsedTrial).toBe(true);
		expect(status.trialEndsAt).toEqual(new Date(trialEnd * 1000));
		expect(status.trialDaysRemaining).toBe(TRIAL_DURATION_DAYS);
	});
});

describe("getBillingStatus — cloud, active subscription", () => {
	it("reports plan=hobby and hasActiveAccess=true for an active hobby sub", async () => {
		mocks.subscriptionsList.mockResolvedValue({
			data: [makeSub({ status: "active", priceId: HOBBY_MONTHLY })],
		});
		const status = await getBillingStatus("owner-1");
		expect(status.plan).toBe("hobby");
		expect(status.isOnTrial).toBe(false);
		expect(status.hasActiveAccess).toBe(true);
	});
});
