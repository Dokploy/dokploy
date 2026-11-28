import { captureEvent } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userUpdates: Record<string, unknown>[] = [];
const serverUpdates: Record<string, unknown>[] = [];

const stripeMock = vi.hoisted(() => ({
	webhooks: { constructEvent: vi.fn() },
	subscriptions: { retrieve: vi.fn(), list: vi.fn() },
}));

vi.mock("stripe", () => ({
	default: class {
		webhooks = stripeMock.webhooks;
		subscriptions = stripeMock.subscriptions;
	},
}));
vi.mock("@dokploy/server", () => ({
	captureEvent: vi.fn(),
	findUserById: vi.fn(),
	stableEventUuid: vi.fn(() => "uuid"),
}));
vi.mock("drizzle-orm", () => ({
	and: vi.fn(),
	asc: vi.fn(),
	eq: vi.fn(),
}));
vi.mock("@/server/db/schema", () => ({
	organization: {},
	server: {},
	user: {},
}));
vi.mock("@/server/utils/stripe-notifications", () => ({
	sendInvoiceEmail: vi.fn(),
	sendPaymentFailedEmail: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => {
	const db = {
		update: () => ({
			set: (values: Record<string, unknown>) => {
				("serverStatus" in values ? serverUpdates : userUpdates).push(values);
				return { where: () => ({ returning: async () => [] }) };
			},
		}),
		query: {
			user: {
				// The subscription was deleted earlier, so no subscription id is stored.
				findFirst: async () => ({
					id: "user_1",
					isEnterpriseCloud: false,
					stripeSubscriptionId: null,
				}),
			},
			organization: { findMany: async () => [{ id: "org_1" }] },
			server: { findMany: async () => [] },
		},
	};
	return { db };
});

const subscription = (status: string, quantity: number) => ({
	id: "sub_1",
	status,
	customer: "cus_1",
	items: { data: [{ quantity, price: { id: "price_1" } }] },
});

describe("customer.subscription.updated webhook", () => {
	beforeEach(() => {
		vi.mocked(captureEvent).mockClear();
		userUpdates.length = 0;
		serverUpdates.length = 0;
		process.env.STRIPE_SECRET_KEY = "sk_test";
		process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
	});

	it.each([false, true])(
		"keeps a cancelled subscription disabled (trial conversion: %s)",
		async (trialConverted) => {
			// An older `active` update arrives after the subscription was deleted.
			stripeMock.webhooks.constructEvent.mockReturnValue({
				id: "evt_old",
				created: 1,
				type: "customer.subscription.updated",
				data: {
					object: subscription("active", 3),
					previous_attributes: trialConverted ? { status: "trialing" } : {},
				},
			});
			stripeMock.subscriptions.retrieve.mockResolvedValue(
				subscription("canceled", 3),
			);

			const { default: handler } = await import(
				"../../pages/api/stripe/webhook"
			);
			const req: any = Object.assign(
				(async function* () {
					yield Buffer.from("{}");
				})(),
				{ headers: { "stripe-signature": "sig" } },
			);
			const res: any = {
				status: () => res,
				send: () => res,
				json: () => res,
			};
			await handler(req, res);

			expect(userUpdates).toEqual([{ serversQuantity: 0 }]);
			expect(serverUpdates).toEqual([{ serverStatus: "inactive" }]);
			if (trialConverted) {
				expect(captureEvent).toHaveBeenCalledExactlyOnceWith({
					distinctId: "user_1",
					uuid: "uuid",
					timestamp: new Date(1000),
					event: "subscription_activated",
					properties: { source: "trial_converted" },
				});
			} else {
				expect(captureEvent).not.toHaveBeenCalled();
			}
		},
	);
});
