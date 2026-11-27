import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	ready: [] as Record<string, unknown>[],
	found: null as Record<string, unknown> | null,
	claim: vi.fn(),
	updateCloudServer: vi.fn(),
	suspendCloudServer: vi.fn(),
	sendRenewal: vi.fn(),
	sendFailed: vi.fn(),
	retrieve: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({}));
vi.mock("@dokploy/server/services/cloud-server", () => ({
	findReadyCloudServers: async () => mocks.ready,
	findCloudServerBySubscriptionId: async () => mocks.found,
	claimCloudServerPaymentReminder: mocks.claim,
	updateCloudServer: mocks.updateCloudServer,
	suspendCloudServer: mocks.suspendCloudServer,
}));
vi.mock("@/server/utils/cloud-server-notifications", () => ({
	sendCloudServerRenewalEmail: mocks.sendRenewal,
	sendCloudServerPaymentFailedEmail: mocks.sendFailed,
}));
vi.mock("@/server/utils/billing", () => ({
	getStripeClient: () => stripe,
	CLOUD_SERVER_METADATA_TYPE: "cloud_server",
	isCloudServerSubscription: () => true,
}));
vi.mock("@/server/utils/stripe", () => ({}));

const { handleCloudServerEvent, sendCloudServerPaymentReminders } =
	await import("@/server/utils/cloud-server-billing");

const NOW = "2026-11-24T10:00:00.000Z";
const stripe = {
	subscriptions: { retrieve: mocks.retrieve },
} as unknown as Stripe;

const server = (overrides: Record<string, unknown> = {}) => ({
	cloudServerId: "cs-1",
	status: "ready",
	stripeSubscriptionId: "sub_1",
	suspendedAt: null,
	paymentReminderAt: null,
	...overrides,
});

const subscription = (
	renewsAt: string,
	card: { exp_month: number; exp_year: number } | null,
) => ({
	status: "active",
	cancel_at_period_end: false,
	current_period_end: Date.parse(renewsAt) / 1000,
	default_payment_method: card && { card },
	customer: { invoice_settings: { default_payment_method: null } },
});

describe("cloud server payment reminders", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW));
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.ready = [server()];
		mocks.found = null;
		mocks.claim.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("warns 7 days before the renewal when the card expires first", async () => {
		mocks.retrieve.mockResolvedValue(
			subscription("2026-12-01T09:00:00.000Z", {
				exp_month: 11,
				exp_year: 2026,
			}),
		);

		await sendCloudServerPaymentReminders();

		expect(mocks.claim).toHaveBeenCalledWith(
			"cs-1",
			new Date("2026-11-24T09:00:00.000Z"),
		);
		expect(mocks.sendRenewal).toHaveBeenCalledWith(
			mocks.ready[0],
			new Date("2026-12-01T09:00:00.000Z"),
		);
	});

	it("moves to the 3 and 1 day steps as the renewal gets closer", async () => {
		mocks.retrieve.mockResolvedValue(
			subscription("2026-11-26T12:00:00.000Z", null),
		);
		await sendCloudServerPaymentReminders();
		expect(mocks.claim).toHaveBeenLastCalledWith(
			"cs-1",
			new Date("2026-11-23T12:00:00.000Z"),
		);

		mocks.retrieve.mockResolvedValue(
			subscription("2026-11-25T08:00:00.000Z", null),
		);
		await sendCloudServerPaymentReminders();
		expect(mocks.claim).toHaveBeenLastCalledWith(
			"cs-1",
			new Date("2026-11-24T08:00:00.000Z"),
		);
	});

	it("stays quiet when the card is still valid on the renewal date", async () => {
		mocks.retrieve.mockResolvedValue(
			subscription("2026-11-30T23:00:00.000Z", {
				exp_month: 11,
				exp_year: 2026,
			}),
		);

		await sendCloudServerPaymentReminders();

		expect(mocks.claim).not.toHaveBeenCalled();
		expect(mocks.sendRenewal).not.toHaveBeenCalled();
	});

	it("stays quiet more than 7 days before the renewal", async () => {
		mocks.retrieve.mockResolvedValue(
			subscription("2026-12-02T10:00:00.000Z", null),
		);

		await sendCloudServerPaymentReminders();

		expect(mocks.claim).not.toHaveBeenCalled();
	});

	it("does not send a step another instance already claimed", async () => {
		mocks.retrieve.mockResolvedValue(
			subscription("2026-11-27T10:00:00.000Z", null),
		);
		mocks.claim.mockResolvedValue(false);

		await sendCloudServerPaymentReminders();

		expect(mocks.sendRenewal).not.toHaveBeenCalled();
	});

	it("releases the step when the email could not be sent", async () => {
		mocks.ready = [server({ paymentReminderAt: "2026-11-17T02:00:00.000Z" })];
		mocks.retrieve.mockResolvedValue(
			subscription("2026-11-27T10:00:00.000Z", null),
		);
		mocks.sendRenewal.mockRejectedValue(new Error("smtp down"));

		await sendCloudServerPaymentReminders();

		expect(mocks.updateCloudServer).toHaveBeenCalledWith("cs-1", {
			paymentReminderAt: "2026-11-17T02:00:00.000Z",
		});
	});

	it("emails the day the payment fails with the deletion date, once", async () => {
		const pastDue = {
			type: "customer.subscription.updated",
			data: { object: { id: "sub_1", status: "past_due" } },
		} as unknown as Stripe.Event;
		mocks.sendFailed.mockResolvedValue(undefined);

		mocks.found = server();
		await handleCloudServerEvent(stripe, pastDue);
		expect(mocks.suspendCloudServer).toHaveBeenCalledTimes(1);
		expect(mocks.sendFailed).toHaveBeenCalledWith(
			mocks.found,
			new Date("2026-11-26T10:00:00.000Z"),
		);

		mocks.found = server({ status: "suspended" });
		await handleCloudServerEvent(stripe, pastDue);
		expect(mocks.suspendCloudServer).toHaveBeenCalledTimes(1);
		expect(mocks.sendFailed).toHaveBeenCalledTimes(1);
	});
});
