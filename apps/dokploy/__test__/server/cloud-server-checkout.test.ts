import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	organization: { id: "org-1" } as { id: string } | undefined,
	createCloudServer: vi.fn(),
	provisionCloudServer: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	findOrganizationById: async () => mocks.organization,
}));
vi.mock("@dokploy/server/services/cloud-server", () => ({
	buildCloudServerHostname: () => "acme-x7k2p9",
	createCloudServer: mocks.createCloudServer,
	provisionCloudServer: mocks.provisionCloudServer,
}));
vi.mock("@/server/utils/cloud-server-notifications", () => ({}));
vi.mock("@/server/utils/billing", () => ({
	getStripeClient: () => stripe,
	CLOUD_SERVER_METADATA_TYPE: "cloud_server",
}));
vi.mock("@/server/utils/stripe", () => ({}));

const { handleCloudServerEvent } = await import(
	"@/server/utils/cloud-server-billing"
);

const retrieve = vi.fn();
const cancel = vi.fn();
const refund = vi.fn();
const stripe = {
	subscriptions: { retrieve, cancel },
	refunds: { create: refund },
} as unknown as Stripe;

const checkoutCompleted = (metadata: Record<string, string>) =>
	({
		type: "checkout.session.completed",
		data: {
			object: { id: "cs_1", subscription: "sub_1", metadata },
		},
	}) as unknown as Stripe.Event;

const order = {
	type: "cloud_server",
	cloudServerId: "cs-1",
	organizationId: "org-1",
	plan: "starter",
	zone: "nyc1",
};

describe("cloud server checkout", () => {
	beforeEach(() => {
		for (const mock of [retrieve, cancel, refund]) mock.mockReset();
		mocks.createCloudServer.mockReset();
		mocks.provisionCloudServer.mockReset();
		mocks.provisionCloudServer.mockResolvedValue(undefined);
		mocks.organization = { id: "org-1" };
		retrieve.mockResolvedValue({
			status: "active",
			latest_invoice: { paid: true, amount_paid: 3999, payment_intent: "pi_1" },
		});
		cancel.mockResolvedValue({});
	});

	it("creates the server from the paid order and provisions it", async () => {
		mocks.createCloudServer.mockImplementation(async (input) => input);

		const handled = await handleCloudServerEvent(
			stripe,
			checkoutCompleted(order),
		);

		expect(handled).toBe(true);
		expect(mocks.createCloudServer).toHaveBeenCalledWith({
			cloudServerId: "cs-1",
			organizationId: "org-1",
			plan: "starter",
			zone: "nyc1",
			hostname: "acme-x7k2p9",
			status: "provisioning",
			stripeSubscriptionId: "sub_1",
			stripeCheckoutSessionId: "cs_1",
		});
		expect(mocks.provisionCloudServer).toHaveBeenCalledWith(
			expect.objectContaining({
				cloudServerId: "cs-1",
				zone: "nyc1",
				hostname: "acme-x7k2p9",
			}),
		);
	});

	it("provisions once when Stripe delivers the webhook twice", async () => {
		mocks.createCloudServer.mockResolvedValue(undefined);

		await handleCloudServerEvent(stripe, checkoutCompleted(order));

		expect(mocks.provisionCloudServer).not.toHaveBeenCalled();
		expect(refund).not.toHaveBeenCalled();
	});

	it("refunds a payment whose organization no longer exists", async () => {
		mocks.organization = undefined;

		await handleCloudServerEvent(stripe, checkoutCompleted(order));

		expect(mocks.createCloudServer).not.toHaveBeenCalled();
		expect(cancel).toHaveBeenCalledWith("sub_1", expect.anything());
		expect(refund).toHaveBeenCalledWith({ payment_intent: "pi_1" });
	});

	it("leaves other checkouts to the plan logic", async () => {
		const handled = await handleCloudServerEvent(
			stripe,
			checkoutCompleted({ adminId: "user-1" }),
		);

		expect(handled).toBe(false);
		expect(mocks.createCloudServer).not.toHaveBeenCalled();
	});
});
