import {
	checkDeletionCode,
	generateDeletionCode,
	serializeDeletionCode,
} from "@dokploy/server/services/account-deletion";
import { deleteHubSpotContactByEmail } from "@dokploy/server/utils/tracking/hubspot";
import Stripe from "stripe";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cancelStripeSubscriptions } from "@/server/utils/billing";

const makeStripe = (
	subscriptions: Array<{ id: string; status: string }>,
	listError?: Error,
) => {
	const stripe = {
		subscriptions: {
			list: vi.fn(() =>
				listError
					? Promise.reject(listError)
					: Promise.resolve({ data: subscriptions }),
			),
			cancel: vi.fn(() => Promise.resolve({})),
		},
	};
	return stripe as unknown as Stripe & typeof stripe;
};

describe("cancelStripeSubscriptions", () => {
	test("cancels every non-terminal subscription without invoicing", async () => {
		const stripe = makeStripe([
			{ id: "sub_active", status: "active" },
			{ id: "sub_trial", status: "trialing" },
			{ id: "sub_past_due", status: "past_due" },
			{ id: "sub_canceled", status: "canceled" },
			{ id: "sub_expired", status: "incomplete_expired" },
		]);

		const result = await cancelStripeSubscriptions("cus_1", stripe);

		expect(stripe.subscriptions.list).toHaveBeenCalledWith({
			customer: "cus_1",
			status: "all",
			limit: 100,
		});
		expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(3);
		expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_active", {
			invoice_now: false,
			prorate: false,
		});
		expect(result).toEqual({
			cancelledSubscriptions: ["sub_active", "sub_trial", "sub_past_due"],
		});
	});

	test("treats a missing customer as having nothing to cancel", async () => {
		const missing = new Stripe.errors.StripeInvalidRequestError({
			type: "invalid_request_error",
			code: "resource_missing",
			message: "No such customer",
		});
		const stripe = makeStripe([], missing);

		const result = await cancelStripeSubscriptions("cus_missing", stripe);

		expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
		expect(result).toEqual({ cancelledSubscriptions: [] });
	});

	test("propagates unexpected Stripe errors", async () => {
		const failure = new Stripe.errors.StripeAPIError({
			type: "api_error",
			message: "boom",
		});
		const stripe = makeStripe([], failure);

		await expect(cancelStripeSubscriptions("cus_1", stripe)).rejects.toBe(
			failure,
		);
	});
});

describe("deleteHubSpotContactByEmail", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("is skipped when no access token is configured", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		expect(await deleteHubSpotContactByEmail("a@b.com", undefined)).toBe(
			"skipped",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("calls the GDPR delete endpoint with the email as id", async () => {
		const fetchMock = vi.fn(() =>
			Promise.resolve(new Response(null, { status: 204 })),
		);
		vi.stubGlobal("fetch", fetchMock);

		expect(await deleteHubSpotContactByEmail("a@b.com", "token")).toBe(
			"deleted",
		);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(
			"https://api.hubapi.com/crm/v3/objects/contacts/gdpr-delete",
		);
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer token",
		);
		expect(JSON.parse(init.body as string)).toEqual({
			idProperty: "email",
			objectId: "a@b.com",
		});
	});

	test("maps 404 to not_found and other errors to failed", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
		);
		expect(await deleteHubSpotContactByEmail("a@b.com", "token")).toBe(
			"not_found",
		);

		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
		);
		expect(await deleteHubSpotContactByEmail("a@b.com", "token")).toBe(
			"failed",
		);
	});
});

describe("account deletion codes", () => {
	test("generates six-digit numeric codes", () => {
		for (let i = 0; i < 50; i++) {
			expect(generateDeletionCode()).toMatch(/^\d{6}$/);
		}
	});

	test("accepts the right code, ignoring surrounding whitespace", () => {
		const value = serializeDeletionCode("482913");

		expect(checkDeletionCode(value, "482913")).toEqual({
			valid: true,
			attempts: 0,
		});
		expect(checkDeletionCode(value, " 482913 ").valid).toBe(true);
	});

	test("counts failed attempts without revealing the hash", () => {
		const value = serializeDeletionCode("482913");

		const first = checkDeletionCode(value, "000000");
		expect(first.valid).toBe(false);
		if (first.valid) throw new Error("unreachable");
		expect(first.attempts).toBe(1);
		expect(JSON.parse(first.nextValue)).toEqual({
			...JSON.parse(value),
			attempts: 1,
		});

		const second = checkDeletionCode(first.nextValue, "999999");
		expect(second.valid).toBe(false);
		if (second.valid) throw new Error("unreachable");
		expect(second.attempts).toBe(2);

		expect(checkDeletionCode(second.nextValue, "482913")).toEqual({
			valid: true,
			attempts: 2,
		});
		expect(value).not.toContain("482913");
	});
});
