import type { NextApiRequest, NextApiResponse } from "next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	constructEvent: vi.fn(),
	retrieveSubscription: vi.fn(),
	listSubscriptions: vi.fn(),
	userFindFirst: vi.fn(),
	organizationFindMany: vi.fn(),
	serverFindMany: vi.fn(),
	update: vi.fn(),
	set: vi.fn(),
	where: vi.fn(),
	returning: vi.fn(),
	select: vi.fn(),
	transaction: vi.fn(),
	sendInvoiceEmail: vi.fn(),
	sendPaymentFailedEmail: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: (field: unknown, value: unknown) => ({ field, value }),
	and: (...conditions: unknown[]) => ({ conditions }),
	asc: (field: unknown) => ({ field }),
}));

vi.mock("@dokploy/server", () => ({
	findUserById: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: mocks.update,
		transaction: mocks.transaction,
		query: {
			user: { findFirst: mocks.userFindFirst },
			organization: { findMany: mocks.organizationFindMany },
			server: { findMany: mocks.serverFindMany },
		},
	},
}));

vi.mock("@/server/db/schema", () => ({
	user: {
		id: "user.id",
		stripeCustomerId: "user.stripeCustomerId",
		stripeSubscriptionId: "user.stripeSubscriptionId",
		isEnterpriseCloud: "user.isEnterpriseCloud",
	},
	organization: {
		ownerId: "organization.ownerId",
		id: "organization.id",
	},
	server: {
		organizationId: "server.organizationId",
		serverId: "server.serverId",
		createdAt: "server.createdAt",
	},
}));

vi.mock("@/server/utils/stripe-notifications", () => ({
	sendInvoiceEmail: mocks.sendInvoiceEmail,
	sendPaymentFailedEmail: mocks.sendPaymentFailedEmail,
}));

vi.mock("@/server/utils/trial-notifications", () => ({
	sendTrialExpiringEmail: vi.fn(),
}));

vi.mock("stripe", () => ({
	default: class StripeMock {
		webhooks = { constructEvent: mocks.constructEvent };
		subscriptions = {
			retrieve: mocks.retrieveSubscription,
			list: mocks.listSubscriptions,
		};
	},
}));

vi.mock("node:stream/consumers", () => ({
	buffer: vi.fn().mockResolvedValue(Buffer.from("{}")),
}));

import {
	findSoleActiveSubscription,
	getBillingIssueSubscription,
	getSubscriptionPreventingCheckout,
	isCurrentSubscription,
} from "@/server/utils/stripe";

type Handler = typeof import("@/pages/api/stripe/webhook").default;

const CUSTOMER_ID = "cus_1";

const currentUser = {
	id: "user_1",
	stripeCustomerId: CUSTOMER_ID,
	stripeSubscriptionId: "sub_current" as string | null,
	isEnterpriseCloud: false,
	sendInvoiceNotifications: true,
};

let handler: Handler;

const createResponse = () => {
	const res = {} as NextApiResponse & {
		status: ReturnType<typeof vi.fn>;
		json: ReturnType<typeof vi.fn>;
		send: ReturnType<typeof vi.fn>;
	};
	res.status = vi.fn(() => res);
	res.json = vi.fn(() => res);
	res.send = vi.fn(() => res);
	return res;
};

const invokeWebhook = async (event: unknown) => {
	mocks.constructEvent.mockReturnValue(event);
	const req = {
		headers: { "stripe-signature": "sig" },
	} as unknown as NextApiRequest;
	const res = createResponse();
	await handler(req, res);
	return res;
};

const setUser = (user: Record<string, unknown>) => {
	mocks.userFindFirst.mockResolvedValue(user);
};

const setLiveSubscriptions = (
	subscriptions: { id: string; status: string }[],
) => {
	mocks.listSubscriptions.mockResolvedValue({ data: subscriptions });
};

beforeAll(async () => {
	process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
	process.env.STRIPE_SECRET_KEY = "sk_test";
	handler = (await import("@/pages/api/stripe/webhook")).default;
});

beforeEach(() => {
	vi.clearAllMocks();

	const chain = {
		set: mocks.set,
		where: mocks.where,
		returning: mocks.returning,
	};
	mocks.set.mockReturnValue(chain);
	mocks.where.mockReturnValue(chain);
	mocks.returning.mockResolvedValue([{}]);
	mocks.update.mockReturnValue(chain);
	mocks.organizationFindMany.mockResolvedValue([]);
	mocks.serverFindMany.mockResolvedValue([]);
	setLiveSubscriptions([]);

	const tx = {
		update: mocks.update,
		select: mocks.select,
		query: {
			organization: { findMany: mocks.organizationFindMany },
			server: { findMany: mocks.serverFindMany },
		},
	};

	mocks.select.mockReturnValue({
		from: () => ({
			where: () => ({
				// Re-read the account inside the transaction, like SELECT ... FOR UPDATE.
				for: () =>
					mocks.userFindFirst().then((user: unknown) => (user ? [user] : [])),
			}),
		}),
	});

	mocks.transaction.mockImplementation(async (callback) => callback(tx));
});

describe("webhook subscription scoping", () => {
	it("ignores payment_failed for a replaced subscription", async () => {
		setUser(currentUser);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_old",
			status: "past_due",
			customer: CUSTOMER_ID,
			items: { data: [] },
		});

		const res = await invokeWebhook({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_old" },
			},
		});

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.sendPaymentFailedEmail).not.toHaveBeenCalled();
		expect(mocks.organizationFindMany).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("ignores payment_succeeded for a replaced subscription", async () => {
		setUser(currentUser);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_old",
			status: "active",
			customer: CUSTOMER_ID,
			items: { data: [{ price: { id: "price_other" }, quantity: 4 }] },
		});

		await invokeWebhook({
			type: "invoice.payment_succeeded",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_old" },
			},
		});

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.sendInvoiceEmail).not.toHaveBeenCalled();
	});

	it("does not store a subscription created alongside the current one", async () => {
		setUser(currentUser);

		await invokeWebhook({
			type: "customer.subscription.created",
			data: {
				object: { id: "sub_old", customer: CUSTOMER_ID },
			},
		});

		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("adopts an active subscription when the stored id is missing", async () => {
		setUser({ ...currentUser, stripeSubscriptionId: null });
		setLiveSubscriptions([{ id: "sub_recovered", status: "active" }]);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_recovered",
			customer: CUSTOMER_ID,
			status: "active",
			items: { data: [{ price: { id: "price_other" }, quantity: 2 }] },
		});

		await invokeWebhook({
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_recovered",
					customer: CUSTOMER_ID,
					status: "active",
					items: { data: [{ price: { id: "price_other" }, quantity: 2 }] },
				},
			},
		});

		expect(mocks.set).toHaveBeenCalledWith({
			serversQuantity: 2,
			stripeSubscriptionId: "sub_recovered",
		});
	});

	it("does not adopt a canceled subscription while another one is live", async () => {
		setUser({ ...currentUser, stripeSubscriptionId: null });
		// Delayed `active` payload for the canceled subscription A.
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_A",
			status: "canceled",
			customer: CUSTOMER_ID,
			items: { data: [{ price: { id: "price_other" }, quantity: 9 }] },
		});
		setLiveSubscriptions([
			{ id: "sub_A", status: "canceled" },
			{ id: "sub_B", status: "active" },
		]);

		await invokeWebhook({
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_A",
					customer: CUSTOMER_ID,
					status: "active",
					items: { data: [{ price: { id: "price_other" }, quantity: 9 }] },
				},
			},
		});

		expect(mocks.listSubscriptions).toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.organizationFindMany).not.toHaveBeenCalled();
	});

	it("does not recover a canceled subscription from a delayed created event", async () => {
		setUser({ ...currentUser, stripeSubscriptionId: null });
		setLiveSubscriptions([
			{ id: "sub_A", status: "canceled" },
			{ id: "sub_B", status: "active" },
		]);

		await invokeWebhook({
			type: "customer.subscription.created",
			data: {
				object: { id: "sub_A", customer: CUSTOMER_ID, status: "active" },
			},
		});

		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("ignores deletion of a replaced subscription", async () => {
		setUser(currentUser);

		await invokeWebhook({
			type: "customer.subscription.deleted",
			data: {
				object: { id: "sub_old", customer: CUSTOMER_ID },
			},
		});

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.organizationFindMany).not.toHaveBeenCalled();
	});

	it("ignores updates of a replaced subscription", async () => {
		setUser(currentUser);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_old",
			status: "past_due",
			customer: CUSTOMER_ID,
			items: { data: [] },
		});

		await invokeWebhook({
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_old",
					customer: CUSTOMER_ID,
					status: "past_due",
					items: { data: [] },
				},
			},
		});

		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.organizationFindMany).not.toHaveBeenCalled();
	});

	it("still disables servers when the current subscription fails", async () => {
		setUser(currentUser);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_current",
			status: "past_due",
			customer: CUSTOMER_ID,
			items: { data: [] },
		});

		await invokeWebhook({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_current" },
			},
		});

		expect(mocks.set).toHaveBeenCalledWith({ serversQuantity: 0 });
		expect(mocks.sendPaymentFailedEmail).toHaveBeenCalled();
		expect(mocks.organizationFindMany).toHaveBeenCalled();
	});

	it("re-enables servers when the current subscription is updated to active", async () => {
		setUser(currentUser);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_current",
			status: "active",
			customer: CUSTOMER_ID,
			items: { data: [{ price: { id: "price_other" }, quantity: 2 }] },
		});

		await invokeWebhook({
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_current",
					customer: CUSTOMER_ID,
					status: "active",
					items: { data: [{ price: { id: "price_other" }, quantity: 2 }] },
				},
			},
		});

		expect(mocks.set).toHaveBeenCalledWith({ serversQuantity: 2 });
		expect(mocks.organizationFindMany).toHaveBeenCalled();
	});

	it("runs account and server mutations inside the owner transaction", async () => {
		setUser(currentUser);
		mocks.retrieveSubscription.mockResolvedValue({
			id: "sub_current",
			status: "past_due",
			customer: CUSTOMER_ID,
			items: { data: [] },
		});

		await invokeWebhook({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_current" },
			},
		});

		expect(mocks.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.select).toHaveBeenCalled();
		// The email is sent after the transaction commits, never while locked.
		expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.sendPaymentFailedEmail.mock.invocationCallOrder[0]!,
		);
	});
});

describe("subscription helpers", () => {
	it("requires an exact subscription id match", () => {
		expect(isCurrentSubscription("sub_current", "sub_current")).toBe(true);
		expect(isCurrentSubscription("sub_current", "sub_old")).toBe(false);
		expect(isCurrentSubscription(null, "sub_current")).toBe(false);
	});

	it("finds the sole active subscription only", () => {
		expect(
			findSoleActiveSubscription([
				{ id: "sub_1", status: "past_due" },
				{ id: "sub_2", status: "active" },
			])?.id,
		).toBe("sub_2");
		expect(
			findSoleActiveSubscription([
				{ id: "sub_1", status: "active" },
				{ id: "sub_2", status: "trialing" },
			]),
		).toBeNull();
		expect(
			findSoleActiveSubscription([{ id: "sub_1", status: "canceled" }]),
		).toBeNull();
	});

	it("reports a billing issue for the current subscription only", () => {
		const subscriptions = [
			{ id: "sub_A", status: "past_due" },
			{ id: "sub_B", status: "active" },
		];

		// The replaced subscription A must not hide current B's controls.
		expect(getBillingIssueSubscription(subscriptions, "sub_B")).toBeNull();
		expect(getBillingIssueSubscription(subscriptions, "sub_A")?.id).toBe(
			"sub_A",
		);

		// Without a stored id, an active subscription means the account is fine.
		expect(getBillingIssueSubscription(subscriptions)).toBeNull();
		expect(
			getBillingIssueSubscription([{ id: "sub_A", status: "past_due" }])?.id,
		).toBe("sub_A");
	});

	it("keeps a portal action when no current subscription can be identified", () => {
		const unpaidSubscriptions = [
			{ id: "sub_A", status: "past_due" },
			{ id: "sub_C", status: "unpaid" },
		];

		// No stored id and no active plan: those unpaid subscriptions still
		// block checkout, so the billing page must keep the portal action.
		expect(getBillingIssueSubscription(unpaidSubscriptions)?.id).toBe("sub_A");
		expect(
			getBillingIssueSubscription(unpaidSubscriptions, "sub_canceled")?.id,
		).toBe("sub_A");

		// An active subscription proves the account is fine.
		expect(
			getBillingIssueSubscription([
				...unpaidSubscriptions,
				{ id: "sub_B", status: "active" },
			]),
		).toBeNull();
	});

	it("blocks checkout for active and non-paid subscriptions", () => {
		expect(
			getSubscriptionPreventingCheckout([{ id: "sub_1", status: "active" }])
				?.id,
		).toBe("sub_1");
		expect(
			getSubscriptionPreventingCheckout([{ id: "sub_2", status: "trialing" }])
				?.id,
		).toBe("sub_2");
		expect(
			getSubscriptionPreventingCheckout([{ id: "sub_3", status: "unpaid" }])
				?.id,
		).toBe("sub_3");
		expect(
			getSubscriptionPreventingCheckout([{ id: "sub_4", status: "incomplete" }])
				?.id,
		).toBe("sub_4");
		expect(
			getSubscriptionPreventingCheckout([{ id: "sub_5", status: "paused" }])
				?.id,
		).toBe("sub_5");
		expect(
			getSubscriptionPreventingCheckout([{ id: "sub_6", status: "canceled" }]),
		).toBeNull();
		expect(getSubscriptionPreventingCheckout([])).toBeNull();
	});

	it("prefers the current subscription when blocking checkout", () => {
		const subscriptions = [
			{ id: "sub_A", status: "past_due" },
			{ id: "sub_B", status: "active" },
		];

		expect(getSubscriptionPreventingCheckout(subscriptions, "sub_B")?.id).toBe(
			"sub_B",
		);
		// Still fall back to another blocking subscription for the same customer.
		expect(
			getSubscriptionPreventingCheckout(subscriptions, "sub_canceled")?.id,
		).toBe("sub_A");
	});
});
