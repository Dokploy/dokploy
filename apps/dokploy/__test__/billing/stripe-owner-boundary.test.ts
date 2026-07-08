import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	findServersByUserId: vi.fn(),
	findUserById: vi.fn(),
	hasValidLicense: vi.fn(),
	stripeConstructor: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	findServersByUserId: mocks.findServersByUserId,
	findUserById: mocks.findUserById,
	updateUser: mocks.updateUser,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

vi.mock("stripe", () => ({
	default: mocks.stripeConstructor,
}));

const { stripeRouter } = await import("../../server/api/routers/stripe");

const createCaller = (role: "owner" | "admin" = "admin") =>
	stripeRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			ownerId: "owner-1",
			role,
		},
	} as never);

describe("Stripe billing owner boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findUserById.mockResolvedValue({
			id: "owner-1",
			email: "owner@example.com",
			stripeCustomerId: null,
			stripeSubscriptionId: null,
		});
		mocks.stripeConstructor.mockImplementation(() => ({
			billingPortal: {
				sessions: {
					create: vi.fn(),
				},
			},
			checkout: {
				sessions: {
					create: vi.fn(),
				},
			},
			customers: {
				retrieve: vi.fn(),
			},
			invoices: {
				list: vi.fn(),
			},
			products: {
				list: vi.fn(() => Promise.resolve({ data: [] })),
			},
			subscriptions: {
				list: vi.fn(() => Promise.resolve({ data: [] })),
				retrieve: vi.fn(),
				update: vi.fn(),
			},
		}));
	});

	it.each([
		["getProducts", () => createCaller("admin").getProducts()],
		[
			"createCheckoutSession",
			() =>
				createCaller("admin").createCheckoutSession({
					tier: "hobby",
					productId: "prod_hobby",
					serverQuantity: 1,
					isAnnual: false,
				}),
		],
		[
			"createCustomerPortalSession",
			() => createCaller("admin").createCustomerPortalSession(),
		],
		[
			"upgradeSubscription",
			() =>
				createCaller("admin").upgradeSubscription({
					tier: "hobby",
					serverQuantity: 1,
					isAnnual: false,
				}),
		],
		[
			"updateInvoiceNotifications",
			() => createCaller("admin").updateInvoiceNotifications({ enabled: true }),
		],
		["getInvoices", () => createCaller("admin").getInvoices()],
	])(
		"denies org admins from %s before billing side effects",
		async (_, call) => {
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(mocks.findUserById).not.toHaveBeenCalled();
			expect(mocks.stripeConstructor).not.toHaveBeenCalled();
		},
	);

	it("allows owners to read invoices for their billing owner account", async () => {
		await expect(createCaller("owner").getInvoices()).resolves.toEqual([]);

		expect(mocks.findUserById).toHaveBeenCalledWith("owner-1");
	});
});
