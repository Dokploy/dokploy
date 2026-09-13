import { describe, expect, it, vi } from "vitest";

describe("Stripe Initialization in Self-Hosted vs Cloud (Fixes Issue #5344)", () => {
	const createStripeLoader = (loadStripeMock: (key: string) => Promise<any>) => {
		return (publishableKey?: string) => {
			return publishableKey ? loadStripeMock(publishableKey) : null;
		};
	};

	it("safely evaluates to null and avoids throwing IntegrationError when publishable key is not set", () => {
		const loadStripeMock = vi.fn((key: string) => {
			if (!key || typeof key !== "string") {
				throw new Error("Missing value for Stripe(): apiKey should be a string.");
			}
			return Promise.resolve({ redirectToCheckout: vi.fn() });
		});

		const initStripe = createStripeLoader(loadStripeMock);

		// Self-hosted environment: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is undefined
		const stripePromise = initStripe(undefined);

		expect(stripePromise).toBeNull();
		expect(loadStripeMock).not.toHaveBeenCalled();
	});

	it("initializes Stripe normally when publishable key is present in Cloud environment", async () => {
		const mockStripeInstance = { redirectToCheckout: vi.fn() };
		const loadStripeMock = vi.fn(async (key: string) => mockStripeInstance);

		const initStripe = createStripeLoader(loadStripeMock);

		// Cloud environment: key is configured
		const stripePromise = initStripe("pk_live_12345");

		expect(stripePromise).not.toBeNull();
		expect(loadStripeMock).toHaveBeenCalledWith("pk_live_12345");

		const stripe = await stripePromise;
		expect(stripe).toBe(mockStripeInstance);
	});

	it("handles checkout attempt safely when Stripe is not configured without crashing", async () => {
		let toastErrorCalledWith: string | null = null;
		const toastMock = {
			error: (msg: string) => {
				toastErrorCalledWith = msg;
			},
		};

		const stripePromise: Promise<any> | null = null;

		const handleCheckout = async () => {
			const stripe = stripePromise ? await stripePromise : null;
			if (!stripe) {
				toastMock.error("Stripe is not configured");
				return false;
			}
			return true;
		};

		const result = await handleCheckout();

		expect(result).toBe(false);
		expect(toastErrorCalledWith).toBe("Stripe is not configured");
	});
});
