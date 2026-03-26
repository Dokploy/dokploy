type SubscriptionLike = {
	plan: string;
	status: string;
	cancelAtPeriodEnd: boolean;
} | null;

export type SubscriptionUiStatus = "freeTier" | "active" | "past_due" | "canceled";

export type SubscriptionStatusBadgeVariant =
	| "green"
	| "yellow"
	| "secondary"
	| "outline";

export const effectivePlanKey = (
	subscription: SubscriptionLike,
): "free" | "pro" | "agency" => {
	if (subscription?.plan === "pro") return "pro";
	if (subscription?.plan === "agency") return "agency";
	return "free";
};

export const subscriptionUiStatus = (
	subscription: SubscriptionLike,
): SubscriptionUiStatus => {
	if (!subscription) return "freeTier";
	if (subscription.status === "canceled") return "canceled";
	if (subscription.status === "past_due") return "past_due";
	if (
		subscription.status === "active" &&
		(subscription.plan === "pro" || subscription.plan === "agency")
	) {
		return "active";
	}
	return "freeTier";
};

export const subscriptionStatusBadgeVariant = (
	ui: SubscriptionUiStatus,
): SubscriptionStatusBadgeVariant => {
	if (ui === "active") return "green";
	if (ui === "past_due") return "yellow";
	if (ui === "canceled") return "secondary";
	return "outline";
};

export type PaymentRowStatusBadgeVariant =
	| "yellow"
	| "green"
	| "destructive"
	| "secondary";

export const paymentStatusBadgeVariant = (
	status: string,
): PaymentRowStatusBadgeVariant => {
	if (status === "succeeded") return "green";
	if (status === "pending") return "yellow";
	if (status === "failed") return "destructive";
	return "secondary";
};

export const cancelButtonMode = (
	subscription: SubscriptionLike,
): "cancel" | "scheduled" | "disabled" => {
	if (
		!subscription ||
		subscription.plan === "free" ||
		(subscription.plan !== "pro" && subscription.plan !== "agency")
	) {
		return "disabled";
	}
	if (subscription.cancelAtPeriodEnd) return "scheduled";
	if (subscription.status === "active") return "cancel";
	return "disabled";
};
