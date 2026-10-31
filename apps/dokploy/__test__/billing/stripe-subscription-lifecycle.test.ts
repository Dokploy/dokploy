import type { NextApiRequest, NextApiResponse } from "next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type FakeServer = {
	serverId: string;
	organizationId: string;
	serverStatus: "active" | "inactive";
};

const mocks = vi.hoisted(() => {
	const userTable = { __table: "user" } as const;
	const organizationTable = { __table: "organization" } as const;
	const serverTable = {
		__table: "server",
		serverId: "server.serverId",
		organizationId: "server.organizationId",
		createdAt: "server.createdAt",
	} as const;

	const state: {
		user: {
			id: string;
			email: string;
			stripeCustomerId: string;
			stripeSubscriptionId: string | null;
			serversQuantity: number;
			isEnterpriseCloud: boolean;
			sendInvoiceNotifications: boolean;
		};
		servers: FakeServer[];
		subscriptions: Map<string, Record<string, unknown>>;
	} = {
		user: {
			id: "user_1",
			email: "owner@example.com",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_A",
			serversQuantity: 1,
			isEnterpriseCloud: false,
			sendInvoiceNotifications: false,
		},
		servers: [],
		subscriptions: new Map(),
	};

	const matchesServer = (
		server: FakeServer,
		condition: { field?: string; value?: unknown; conditions?: unknown[] },
	): boolean => {
		if (!condition) return true;
		if (Array.isArray(condition.conditions)) {
			return condition.conditions.every((nested) =>
				matchesServer(
					server,
					nested as { field?: string; value?: unknown; conditions?: unknown[] },
				),
			);
		}
		if (condition.field === serverTable.serverId) {
			return server.serverId === condition.value;
		}
		if (condition.field === serverTable.organizationId) {
			return server.organizationId === condition.value;
		}
		return true;
	};

	const update = vi.fn((table: unknown) => {
		let values: Record<string, unknown> = {};
		const chain = {
			set: (next: Record<string, unknown>) => {
				values = next;
				return chain;
			},
			where: (condition: {
				field?: string;
				value?: unknown;
				conditions?: unknown[];
			}) => {
				if (table === userTable) {
					Object.assign(state.user, values);
				}
				if (table === serverTable) {
					for (const server of state.servers) {
						if (matchesServer(server, condition)) {
							Object.assign(server, values);
						}
					}
				}
				return chain;
			},
			returning: () => Promise.resolve([state.user]),
		};
		return chain;
	});

	return {
		userTable,
		organizationTable,
		serverTable,
		state,
		update,
		select: vi.fn(),
		transaction: vi.fn(),
		constructEvent: vi.fn(),
		retrieveSubscription: vi.fn(),
		listSubscriptions: vi.fn(),
		sendInvoiceEmail: vi.fn(),
		sendPaymentFailedEmail: vi.fn(),
	};
});

vi.mock("drizzle-orm", () => ({
	eq: (field: unknown, value: unknown) => ({ field, value }),
	and: (...conditions: unknown[]) => ({ conditions }),
	asc: (field: unknown) => ({ field }),
}));

vi.mock("@dokploy/server", () => ({
	findUserById: async () => mocks.state.user,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		update: mocks.update,
		select: mocks.select,
		transaction: mocks.transaction,
		query: {
			user: { findFirst: async () => mocks.state.user },
			organization: {
				findMany: async () => [{ id: "org_1", ownerId: mocks.state.user.id }],
			},
			server: { findMany: async () => mocks.state.servers },
		},
	},
}));

vi.mock("@/server/db/schema", () => ({
	user: mocks.userTable,
	organization: mocks.organizationTable,
	server: mocks.serverTable,
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

const CUSTOMER_ID = "cus_1";

type Handler = typeof import("@/pages/api/stripe/webhook").default;
let handler: Handler;

const subscription = (id: string, status: string, quantity: number) => ({
	id,
	status,
	customer: CUSTOMER_ID,
	items: { data: [{ price: { id: "price_other" }, quantity }] },
});

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

const invoke = async (event: unknown) => {
	mocks.constructEvent.mockReturnValue(event);
	const req = {
		headers: { "stripe-signature": "sig" },
	} as unknown as NextApiRequest;
	const res = createResponse();
	await handler(req, res);
	return res;
};

const allServersInactive = () =>
	mocks.state.servers.every((server) => server.serverStatus === "inactive");

const allServersActive = () =>
	mocks.state.servers.every((server) => server.serverStatus === "active");

beforeAll(async () => {
	process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
	process.env.STRIPE_SECRET_KEY = "sk_test";
	handler = (await import("@/pages/api/stripe/webhook")).default;
});

beforeEach(() => {
	vi.clearAllMocks();

	mocks.state.user.stripeSubscriptionId = "sub_A";
	mocks.state.user.serversQuantity = 1;
	mocks.state.user.sendInvoiceNotifications = false;
	mocks.state.servers = [
		{ serverId: "srv_1", organizationId: "org_1", serverStatus: "active" },
		{ serverId: "srv_2", organizationId: "org_1", serverStatus: "active" },
	];
	mocks.state.subscriptions.clear();
	mocks.state.subscriptions.set("sub_A", subscription("sub_A", "past_due", 1));
	mocks.state.subscriptions.set("sub_B", subscription("sub_B", "active", 2));
	mocks.retrieveSubscription.mockImplementation(async (id: string) => {
		const found = mocks.state.subscriptions.get(id);
		if (!found) throw new Error(`Unknown subscription ${id}`);
		return found;
	});
	mocks.listSubscriptions.mockImplementation(async () => ({
		data: [...mocks.state.subscriptions.values()],
	}));

	const tx = {
		update: mocks.update,
		select: mocks.select,
		query: {
			organization: {
				findMany: async () => [{ id: "org_1", ownerId: mocks.state.user.id }],
			},
			server: { findMany: async () => mocks.state.servers },
		},
	};

	mocks.select.mockReturnValue({
		from: () => ({
			where: () => ({
				for: async () => [mocks.state.user],
			}),
		}),
	});
	mocks.transaction.mockImplementation(async (callback) => callback(tx));
});

describe("billing lifecycle with a replaced subscription", () => {
	it("keeps the new subscription active while the old one keeps retrying", async () => {
		await invoke({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_A" },
			},
		});
		expect(mocks.state.user.serversQuantity).toBe(0);
		expect(allServersInactive()).toBe(true);

		await invoke({
			type: "checkout.session.completed",
			data: {
				object: {
					customer: CUSTOMER_ID,
					subscription: "sub_B",
					metadata: { adminId: "user_1" },
				},
			},
		});
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);
		expect(allServersActive()).toBe(true);

		await invoke({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_A" },
			},
		});
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);
		expect(allServersActive()).toBe(true);

		mocks.state.subscriptions.set("sub_A", subscription("sub_A", "active", 5));
		await invoke({
			type: "invoice.payment_succeeded",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_A" },
			},
		});
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);
		expect(allServersActive()).toBe(true);
		expect(mocks.sendInvoiceEmail).not.toHaveBeenCalled();

		await invoke({
			type: "customer.subscription.deleted",
			data: {
				object: { id: "sub_A", customer: CUSTOMER_ID },
			},
		});
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);
		expect(allServersActive()).toBe(true);

		mocks.state.subscriptions.set(
			"sub_A",
			subscription("sub_A", "past_due", 5),
		);
		await invoke({
			type: "customer.subscription.updated",
			data: {
				object: mocks.state.subscriptions.get("sub_A"),
			},
		});
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);
		expect(allServersActive()).toBe(true);

		mocks.state.subscriptions.set(
			"sub_B",
			subscription("sub_B", "past_due", 2),
		);
		await invoke({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_B" },
			},
		});
		expect(mocks.state.user.serversQuantity).toBe(0);
		expect(allServersInactive()).toBe(true);
	});

	it("serializes a delayed payment_failed handler with the new checkout", async () => {
		mocks.state.user.sendInvoiceNotifications = true;

		let releaseEmail: () => void = () => {};
		const emailGate = new Promise<void>((resolve) => {
			releaseEmail = resolve;
		});
		mocks.sendPaymentFailedEmail.mockReturnValue(emailGate);

		const failing = invoke({
			type: "invoice.payment_failed",
			data: {
				object: { customer: CUSTOMER_ID, subscription: "sub_A" },
			},
		});

		// The failing handler has already committed its mutation and is now
		// suspended while sending the email.
		await vi.waitFor(() => {
			expect(mocks.sendPaymentFailedEmail).toHaveBeenCalled();
		});
		expect(mocks.state.user.serversQuantity).toBe(0);

		// The owner pays for B while A's handler is still suspended.
		await invoke({
			type: "checkout.session.completed",
			data: {
				object: {
					customer: CUSTOMER_ID,
					subscription: "sub_B",
					metadata: { adminId: "user_1" },
				},
			},
		});
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);

		releaseEmail();
		await failing;

		// The resumed old handler must not touch B.
		expect(mocks.state.user.stripeSubscriptionId).toBe("sub_B");
		expect(mocks.state.user.serversQuantity).toBe(2);
		expect(allServersActive()).toBe(true);
	});
});
