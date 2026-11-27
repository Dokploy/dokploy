import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	record: null as Record<string, unknown> | null,
	updateCloudServer: vi.fn(),
	createInvoiceItem: vi.fn(),
	measure: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({}));
vi.mock("@dokploy/server/services/cloud-server", () => ({
	findCloudServerBySubscriptionId: async () => mocks.record,
	recordCloudServerBandwidth: mocks.measure,
	updateCloudServer: mocks.updateCloudServer,
}));
vi.mock("@/server/utils/billing", () => ({
	CLOUD_SERVER_METADATA_TYPE: "cloud_server",
}));
vi.mock("@/server/utils/stripe", () => ({}));

const { handleCloudServerEvent } = await import(
	"@/server/utils/cloud-server-billing"
);

const GB = 1024 ** 3;
const stripe = {
	invoiceItems: { create: mocks.createInvoiceItem },
} as unknown as Stripe;

const invoiceCreated = (overrides: Record<string, unknown> = {}) =>
	({
		type: "invoice.created",
		data: {
			object: {
				id: "in_1",
				customer: "cus_1",
				subscription: "sub_1",
				currency: "usd",
				billing_reason: "subscription_cycle",
				subscription_details: {
					metadata: { type: "cloud_server", cloudServerId: "cs-1" },
				},
				...overrides,
			},
		},
	}) as unknown as Stripe.Event;

describe("cloud server extra bandwidth", () => {
	beforeEach(() => {
		mocks.updateCloudServer.mockReset();
		mocks.createInvoiceItem.mockReset();
		mocks.measure.mockReset();
		mocks.record = {
			cloudServerId: "cs-1",
			plan: "starter",
			bandwidthBytes: 4120 * GB,
		};
	});

	it("adds the traffic over the plan allowance to the renewal invoice", async () => {
		const handled = await handleCloudServerEvent(stripe, invoiceCreated());

		expect(handled).toBe(true);
		expect(mocks.createInvoiceItem).toHaveBeenCalledWith(
			{
				customer: "cus_1",
				invoice: "in_1",
				amount: 360,
				currency: "usd",
				description: "Extra bandwidth: 120 GB",
			},
			{ idempotencyKey: "cloud-server-bandwidth-in_1" },
		);
		expect(mocks.updateCloudServer).toHaveBeenCalledWith("cs-1", {
			bandwidthBytes: 0,
		});
	});

	it("starts a new period without a charge when the allowance was enough", async () => {
		mocks.record = { ...mocks.record, bandwidthBytes: 4000 * GB };

		await handleCloudServerEvent(stripe, invoiceCreated());

		expect(mocks.createInvoiceItem).not.toHaveBeenCalled();
		expect(mocks.updateCloudServer).toHaveBeenCalledWith("cs-1", {
			bandwidthBytes: 0,
		});
	});

	it("bills the traffic used since the last daily measurement", async () => {
		mocks.record = {
			...mocks.record,
			providerVmId: "123",
			bandwidthBytes: 4000 * GB,
		};
		mocks.measure.mockResolvedValue({
			...mocks.record,
			bandwidthBytes: 4120 * GB,
		});

		await handleCloudServerEvent(stripe, invoiceCreated());

		expect(mocks.measure).toHaveBeenCalledWith(mocks.record);
		expect(mocks.createInvoiceItem).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 360 }),
			{ idempotencyKey: "cloud-server-bandwidth-in_1" },
		);
	});

	it("bills what was already measured when DigitalOcean cannot be read", async () => {
		mocks.record = { ...mocks.record, providerVmId: "123" };
		mocks.measure.mockRejectedValue(new Error("DigitalOcean is down"));

		await handleCloudServerEvent(stripe, invoiceCreated());

		expect(mocks.createInvoiceItem).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 360 }),
			{ idempotencyKey: "cloud-server-bandwidth-in_1" },
		);
	});

	it("leaves upgrade invoices alone", async () => {
		const handled = await handleCloudServerEvent(
			stripe,
			invoiceCreated({ billing_reason: "subscription_update" }),
		);

		expect(handled).toBe(true);
		expect(mocks.createInvoiceItem).not.toHaveBeenCalled();
		expect(mocks.updateCloudServer).not.toHaveBeenCalled();
	});

	it("ignores invoices of other subscriptions", async () => {
		const handled = await handleCloudServerEvent(
			stripe,
			invoiceCreated({ subscription_details: { metadata: {} } }),
		);

		expect(handled).toBe(false);
		expect(mocks.createInvoiceItem).not.toHaveBeenCalled();
	});
});
