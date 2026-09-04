/**
 * Pure predicates that gate the billing-pricing checkout CTAs.
 *
 * Kept in a standalone, import-light module (no React / Next / Stripe client
 * deps) so they can be unit-tested directly — mirroring the convention used by
 * `server/utils/billing.ts` and `server/utils/stripe.ts`.
 */

/**
 * Decides whether a pricing-card checkout CTA (Hobby "Get Started", Startup
 * "Get Started", Legacy "Subscribe") may be rendered.
 *
 * `getProducts` lists subscriptions with `status: "active"` only, so a
 * `trialing` subscription is invisible to `data.subscriptions` — relying solely
 * on `subscriptionsLength === 0` would leave the CTA enabled during a free
 * trial, letting a trialing user start a second, paid Stripe subscription.
 * The `billingStatus` fields (`isOnTrial`, `plan`) close that gap. Plan/active
 * and trial state come from `getBillingStatus`, which lists `status: "all"`
 * and considers both `active` and `trialing` subscriptions.
 */
export const canCreateCheckout = (
	isEnterpriseCloud: boolean,
	billingStatus: { isOnTrial: boolean | null; plan: string | null } | undefined,
	subscriptionsLength: number,
): boolean =>
	!isEnterpriseCloud &&
	!billingStatus?.isOnTrial &&
	!billingStatus?.plan &&
	subscriptionsLength === 0;
