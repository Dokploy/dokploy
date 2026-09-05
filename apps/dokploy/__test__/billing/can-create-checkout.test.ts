import { describe, expect, it } from "vitest";
import { canCreateCheckout } from "@/components/dashboard/settings/billing/billing-gates";

describe("canCreateCheckout", () => {
	it("is true for a non-enterprise user with no plan, no trial, and no subscriptions (happy path)", () => {
		expect(canCreateCheckout(false, { isOnTrial: false, plan: null }, 0)).toBe(
			true,
		);
	});

	it("is true while billingStatus is still loading (undefined) and there are no subscriptions", () => {
		expect(canCreateCheckout(false, undefined, 0)).toBe(true);
	});

	it("is false for an enterprise cloud user even with no plan/trial/subscriptions", () => {
		expect(canCreateCheckout(true, { isOnTrial: false, plan: null }, 0)).toBe(
			false,
		);
	});

	it("is false when the user is on a free trial (getProducts hides trialing subs, so billingStatus.isOnTrial is the gate that closes the gap)", () => {
		expect(
			canCreateCheckout(false, { isOnTrial: true, plan: "hobby" }, 0),
		).toBe(false);
	});

	it("is false when the user has an active (non-trial) plan", () => {
		expect(
			canCreateCheckout(false, { isOnTrial: false, plan: "startup" }, 0),
		).toBe(false);
	});

	it("is false when there is an active subscription reported by getProducts", () => {
		expect(canCreateCheckout(false, { isOnTrial: false, plan: null }, 1)).toBe(
			false,
		);
	});
});
