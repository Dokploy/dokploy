import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	suspended: [] as Record<string, unknown>[],
	found: null as Record<string, unknown> | null,
	measured: [] as { previous: unknown; current: unknown }[],
	updateCloudServer: vi.fn(),
	terminateCloudServer: vi.fn(),
	resumeCloudServer: vi.fn(),
	sendDeleted: vi.fn(),
	sendReactivated: vi.fn(),
	sendBandwidth: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({}));
vi.mock("@dokploy/server/services/cloud-server", () => ({
	findSuspendedCloudServersBefore: async () => mocks.suspended,
	findCloudServerBySubscriptionId: async () => mocks.found,
	recordCloudServersBandwidth: async () => mocks.measured,
	updateCloudServer: mocks.updateCloudServer,
	terminateCloudServer: mocks.terminateCloudServer,
	resumeCloudServer: mocks.resumeCloudServer,
}));
vi.mock("@/server/utils/cloud-server-notifications", () => ({
	sendCloudServerDeletedEmail: mocks.sendDeleted,
	sendCloudServerReactivatedEmail: mocks.sendReactivated,
	sendCloudServerBandwidthEmail: mocks.sendBandwidth,
}));
vi.mock("@/server/utils/billing", () => ({
	getStripeClient: () => stripe,
	CLOUD_SERVER_METADATA_TYPE: "cloud_server",
	isCloudServerSubscription: () => true,
}));
vi.mock("@/server/utils/stripe", () => ({}));

const {
	handleCloudServerEvent,
	recordBandwidthAndWarn,
	removeUnpaidCloudServers,
} = await import("@/server/utils/cloud-server-billing");

const NOW = "2026-11-24T10:00:00.000Z";
const GB = 1024 ** 3;
const retrieve = vi.fn();
const update = vi.fn();
const cancel = vi.fn();
const pay = vi.fn();
const stripe = {
	subscriptions: { retrieve, update, cancel },
	invoices: { pay },
} as unknown as Stripe;

const server = (overrides: Record<string, unknown> = {}) => ({
	cloudServerId: "cs-1",
	status: "suspended",
	plan: "hobby",
	stripeSubscriptionId: "sub_1",
	providerVmId: "101",
	suspendedAt: "2026-11-22T09:00:00.000Z",
	bandwidthBytes: 0,
	...overrides,
});

const unpaid = (customerCard: string | null = null) => ({
	id: "sub_1",
	status: "past_due",
	latest_invoice: { id: "in_1", status: "open" },
	customer: { invoice_settings: { default_payment_method: customerCard } },
});

describe("cloud server non-payment", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW));
		for (const mock of [retrieve, update, cancel, pay]) {
			mock.mockReset();
		}
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.suspended = [server()];
		mocks.found = null;
		mocks.measured = [];
		mocks.sendDeleted.mockResolvedValue(undefined);
		mocks.sendReactivated.mockResolvedValue(undefined);
		mocks.sendBandwidth.mockResolvedValue(undefined);
		cancel.mockResolvedValue({});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("deletes the server and tells the customer when the last charge is declined", async () => {
		retrieve.mockResolvedValue(unpaid());
		pay.mockRejectedValue(
			new Stripe.errors.StripeCardError({
				type: "card_error",
				message: "Your card was declined.",
			}),
		);

		await removeUnpaidCloudServers();

		expect(pay).toHaveBeenCalledWith("in_1");
		expect(cancel).toHaveBeenCalledWith("sub_1", expect.anything());
		expect(mocks.terminateCloudServer).toHaveBeenCalledWith("cs-1");
		expect(mocks.sendDeleted).toHaveBeenCalledWith(mocks.suspended[0]);
	});

	it("keeps the server when the last charge goes through with the card the customer added", async () => {
		retrieve.mockResolvedValue(unpaid("pm_new"));
		pay.mockResolvedValue({ status: "paid" });

		await removeUnpaidCloudServers();

		expect(update).toHaveBeenCalledWith("sub_1", {
			default_payment_method: "pm_new",
		});
		expect(mocks.terminateCloudServer).not.toHaveBeenCalled();
		expect(cancel).not.toHaveBeenCalled();
	});

	it("resumes a paid server whose webhook was missed instead of deleting it", async () => {
		retrieve.mockResolvedValue({ ...unpaid(), status: "active" });

		await removeUnpaidCloudServers();

		expect(pay).not.toHaveBeenCalled();
		expect(mocks.resumeCloudServer).toHaveBeenCalledWith(mocks.suspended[0]);
		expect(mocks.sendReactivated).toHaveBeenCalled();
		expect(mocks.terminateCloudServer).not.toHaveBeenCalled();
	});

	it("does not delete anything while Stripe is failing", async () => {
		retrieve.mockResolvedValue(unpaid());
		pay.mockRejectedValue(new Error("Stripe is down"));

		await removeUnpaidCloudServers();

		expect(mocks.terminateCloudServer).not.toHaveBeenCalled();
		expect(cancel).not.toHaveBeenCalled();
	});

	it("powers the server back on and emails when the payment arrives", async () => {
		mocks.found = server();

		await handleCloudServerEvent(stripe, {
			type: "customer.subscription.updated",
			data: { object: { id: "sub_1", status: "active" } },
		} as unknown as Stripe.Event);

		expect(mocks.resumeCloudServer).toHaveBeenCalledWith(mocks.found);
		expect(mocks.sendReactivated).toHaveBeenCalledWith(mocks.found);
	});

	it("does not email on updates of a server that was never suspended", async () => {
		mocks.found = server({ status: "ready" });

		await handleCloudServerEvent(stripe, {
			type: "customer.subscription.updated",
			data: { object: { id: "sub_1", status: "active" } },
		} as unknown as Stripe.Event);

		expect(mocks.resumeCloudServer).not.toHaveBeenCalled();
		expect(mocks.sendReactivated).not.toHaveBeenCalled();
	});

	it("warns once when the transfer crosses 80% and again at 100%", async () => {
		const at = (gb: number) => server({ bandwidthBytes: gb * GB });
		mocks.measured = [{ previous: at(1500), current: at(1650) }];
		await recordBandwidthAndWarn();
		expect(mocks.sendBandwidth).toHaveBeenLastCalledWith(at(1650), 80, 2);

		mocks.measured = [{ previous: at(1650), current: at(1900) }];
		await recordBandwidthAndWarn();
		expect(mocks.sendBandwidth).toHaveBeenCalledTimes(1);

		mocks.measured = [{ previous: at(1900), current: at(2100) }];
		await recordBandwidthAndWarn();
		expect(mocks.sendBandwidth).toHaveBeenLastCalledWith(at(2100), 100, 2);
	});
});
