import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	record: null as Record<string, unknown> | null,
	updateCloudServer: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({}));
vi.mock("@dokploy/server/services/cloud-server", () => ({
	findCloudServerBySubscriptionId: async () => mocks.record,
	updateCloudServer: mocks.updateCloudServer,
}));
vi.mock("@/server/utils/cloud-server-notifications", () => ({}));
vi.mock("@/server/utils/billing", () => ({
	getStripeClient: () => stripe,
}));
vi.mock("@/server/utils/stripe", () => ({}));

const { cancelCloudServerSubscription } = await import(
	"@/server/utils/cloud-server-billing"
);

const GB = 1024 ** 3;
const retrieve = vi.fn();
const cancel = vi.fn();
const createInvoiceItem = vi.fn();
const finalizeInvoice = vi.fn();
const stripe = {
	subscriptions: { retrieve, cancel },
	invoiceItems: { create: createInvoiceItem },
	invoices: { finalizeInvoice },
} as unknown as Stripe;

const NOW = "2026-11-24T10:00:00.000Z";
const paid = (startedAt: string) => ({
	status: "active",
	latest_invoice: { status: "paid" },
	start_date: Date.parse(startedAt) / 1000,
	current_period_start: Date.parse("2026-11-24T00:00:00.000Z") / 1000,
	current_period_end: Date.parse("2026-12-24T00:00:00.000Z") / 1000,
	items: { data: [{ price: { unit_amount: 1999 } }] },
});

describe("cloud server cancellation credit", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(NOW));
		for (const mock of [retrieve, cancel, createInvoiceItem, finalizeInvoice]) {
			mock.mockReset();
		}
		mocks.updateCloudServer.mockReset();
		mocks.record = { cloudServerId: "cs-1", plan: "hobby", bandwidthBytes: 0 };
		retrieve.mockResolvedValue(paid("2026-11-10T10:00:00.000Z"));
		cancel.mockResolvedValue({
			latest_invoice: {
				id: "in_final",
				subscription: "sub_1",
				customer: "cus_1",
				currency: "usd",
			},
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("charges a full hour for a server deleted 5 minutes after it was bought", async () => {
		retrieve.mockResolvedValue(paid("2026-11-24T09:55:00.000Z"));

		await cancelCloudServerSubscription("sub_1", {
			creditUnusedTime: true,
		});

		expect(createInvoiceItem).toHaveBeenCalledWith(
			expect.objectContaining({ invoice: "in_final", amount: 3 }),
			{ idempotencyKey: "cloud-server-minimum-in_final" },
		);
	});

	it("credits the unused time right away when the customer deletes a paid server", async () => {
		await cancelCloudServerSubscription("sub_1", {
			creditUnusedTime: true,
		});

		expect(cancel).toHaveBeenCalledWith("sub_1", {
			invoice_now: true,
			prorate: true,
			expand: ["latest_invoice"],
		});
		expect(createInvoiceItem).not.toHaveBeenCalled();
		expect(finalizeInvoice).toHaveBeenCalledWith("in_final");
	});

	it("takes the extra bandwidth out of the credit", async () => {
		mocks.record = {
			cloudServerId: "cs-1",
			plan: "starter",
			bandwidthBytes: 4050 * GB,
		};

		await cancelCloudServerSubscription("sub_1", {
			creditUnusedTime: true,
		});

		expect(createInvoiceItem).toHaveBeenCalledWith(
			expect.objectContaining({ invoice: "in_final", amount: 150 }),
			{ idempotencyKey: "cloud-server-bandwidth-in_final" },
		);
		expect(createInvoiceItem.mock.invocationCallOrder[0]).toBeLessThan(
			finalizeInvoice.mock.invocationCallOrder[0] as number,
		);
	});

	it("gives no credit for a period that was never paid", async () => {
		retrieve.mockResolvedValue({
			status: "past_due",
			latest_invoice: { status: "open" },
		});

		await cancelCloudServerSubscription("sub_1", {
			creditUnusedTime: true,
		});

		expect(cancel).toHaveBeenCalledWith("sub_1", {
			invoice_now: false,
			prorate: false,
			expand: ["latest_invoice"],
		});
		expect(finalizeInvoice).not.toHaveBeenCalled();
	});

	it("gives no credit when Dokploy removes the server for non-payment", async () => {
		await cancelCloudServerSubscription("sub_1");

		expect(cancel).toHaveBeenCalledWith("sub_1", {
			invoice_now: false,
			prorate: false,
			expand: ["latest_invoice"],
		});
		expect(finalizeInvoice).not.toHaveBeenCalled();
	});
});
