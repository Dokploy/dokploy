export const WEBSITE_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3000"
		: process.env.SITE_URL;

export const BASE_PRICE_MONTHLY_ID = process.env.BASE_PRICE_MONTHLY_ID!;
export const BASE_ANNUAL_MONTHLY_ID = process.env.BASE_ANNUAL_MONTHLY_ID!;
export const PRODUCT_MONTHLY_ID = process.env.PRODUCT_MONTHLY_ID!;
export const PRODUCT_ANNUAL_ID = process.env.PRODUCT_ANNUAL_ID!;

export const LEGACY_PRICE_IDS = [
	process.env.BASE_PRICE_MONTHLY_ID,
	process.env.BASE_ANNUAL_MONTHLY_ID,
].filter(Boolean) as string[];

export const HOBBY_PRODUCT_ID = process.env.HOBBY_PRODUCT_ID ?? "";
export const HOBBY_PRICE_MONTHLY_ID = process.env.HOBBY_PRICE_MONTHLY_ID ?? "";
export const HOBBY_PRICE_ANNUAL_ID = process.env.HOBBY_PRICE_ANNUAL_ID ?? "";

export const STARTUP_PRODUCT_ID = process.env.STARTUP_PRODUCT_ID ?? "";
export const STARTUP_BASE_PRICE_MONTHLY_ID =
	process.env.STARTUP_BASE_PRICE_MONTHLY_ID ?? "";
export const STARTUP_BASE_PRICE_ANNUAL_ID =
	process.env.STARTUP_BASE_PRICE_ANNUAL_ID ?? "";

export type BillingTier = "legacy" | "hobby" | "startup";

/** Statuses where Stripe considers the subscription paid and usable. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

/** Statuses that need the owner to fix payment details before a new Checkout. */
export const BILLING_ISSUE_SUBSCRIPTION_STATUSES = [
	"past_due",
	"unpaid",
	"incomplete",
	"paused",
] as const;

type SubscriptionLike = { id: string; status: string };

export const isActiveSubscription = (subscription: SubscriptionLike) =>
	(ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(
		subscription.status,
	);

export const isBillingIssueStatus = (status: string) =>
	(BILLING_ISSUE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);

/**
 * Only the subscription that owns the account may ask the owner to fix
 * billing. A replaced subscription that is still `past_due` must not hide the
 * controls of the current, paid one.
 */
export const getBillingIssueSubscription = <T extends SubscriptionLike>(
	subscriptions: T[],
	currentSubscriptionId?: string | null,
): T | null => {
	if (currentSubscriptionId) {
		const current = subscriptions.find(
			(subscription) => subscription.id === currentSubscriptionId,
		);
		return current && isBillingIssueStatus(current.status) ? current : null;
	}

	// Without a stored id only a single tracked subscription is unambiguous.
	const soleSubscription = subscriptions.length === 1 ? subscriptions[0] : null;
	return soleSubscription && isBillingIssueStatus(soleSubscription.status)
		? soleSubscription
		: null;
};

export const findSoleActiveSubscription = <T extends SubscriptionLike>(
	subscriptions: T[],
): T | null => {
	const activeSubscriptions = subscriptions.filter(isActiveSubscription);
	return activeSubscriptions.length === 1 ? activeSubscriptions[0]! : null;
};

/** A subscription can only change the account it currently belongs to. */
export const isCurrentSubscription = (
	currentSubscriptionId: string | null,
	eventSubscriptionId: string,
) => currentSubscriptionId === eventSubscriptionId;

/**
 * Checkout would create a second subscription on the same customer, so block
 * it while one is running or waiting for payment. The current subscription is
 * preferred so the message points at the subscription that matters.
 */
export const getSubscriptionPreventingCheckout = <T extends SubscriptionLike>(
	subscriptions: T[],
	currentSubscriptionId?: string | null,
): T | null => {
	const blocksCheckout = (subscription: T) =>
		isActiveSubscription(subscription) ||
		isBillingIssueStatus(subscription.status);

	if (currentSubscriptionId) {
		const current = subscriptions.find(
			(subscription) => subscription.id === currentSubscriptionId,
		);
		if (current && blocksCheckout(current)) {
			return current;
		}
	}

	return subscriptions.find(blocksCheckout) ?? null;
};

export const findCurrentSubscription = <T extends SubscriptionLike>(
	subscriptions: T[],
	currentSubscriptionId?: string | null,
): T | null => {
	if (currentSubscriptionId) {
		return (
			subscriptions.find(
				(subscription) => subscription.id === currentSubscriptionId,
			) ?? null
		);
	}
	return subscriptions.length === 1 ? subscriptions[0]! : null;
};

export const getStripeItems = (
	tier: BillingTier,
	serverQuantity: number,
	isAnnual: boolean,
) => {
	const items: { price: string; quantity: number }[] = [];

	if (tier === "legacy") {
		items.push({
			price: isAnnual ? BASE_ANNUAL_MONTHLY_ID : BASE_PRICE_MONTHLY_ID,
			quantity: serverQuantity,
		});
		return items;
	}
	if (tier === "hobby") {
		const price = isAnnual
			? HOBBY_PRICE_ANNUAL_ID || BASE_ANNUAL_MONTHLY_ID
			: HOBBY_PRICE_MONTHLY_ID || BASE_PRICE_MONTHLY_ID;
		items.push({ price, quantity: serverQuantity });
		return items;
	}

	// Startup: base incluye 3 servidores; del 4º en adelante = precio Hobby ($4.50 c/u)
	if (tier === "startup") {
		const basePrice = isAnnual
			? STARTUP_BASE_PRICE_ANNUAL_ID
			: STARTUP_BASE_PRICE_MONTHLY_ID;
		const extraServerPrice = isAnnual
			? HOBBY_PRICE_ANNUAL_ID || BASE_ANNUAL_MONTHLY_ID
			: HOBBY_PRICE_MONTHLY_ID || BASE_PRICE_MONTHLY_ID;
		if (basePrice) items.push({ price: basePrice, quantity: 1 });
		const extraQty = Math.max(0, serverQuantity - 3);
		if (extraQty > 0)
			items.push({ price: extraServerPrice, quantity: extraQty });
		return items;
	}

	// Fallback legacy
	items.push({
		price: isAnnual ? BASE_ANNUAL_MONTHLY_ID : BASE_PRICE_MONTHLY_ID,
		quantity: serverQuantity,
	});
	return items;
};
