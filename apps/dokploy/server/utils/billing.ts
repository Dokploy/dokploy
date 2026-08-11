import { findUserById, IS_CLOUD } from "@dokploy/server";
import { getOrganizationOwnerId } from "@dokploy/server/services/proprietary/sso";
import Stripe from "stripe";
import {
	HOBBY_PRICE_ANNUAL_ID,
	HOBBY_PRICE_MONTHLY_ID,
	LEGACY_PRICE_IDS,
	STARTUP_BASE_PRICE_ANNUAL_ID,
	STARTUP_BASE_PRICE_MONTHLY_ID,
} from "@/server/utils/stripe";

export type BillingPlan = "legacy" | "hobby" | "startup";

export const getCurrentPlanForUser = async (
	userId: string,
): Promise<BillingPlan | null> => {
	if (!IS_CLOUD) return null;

	const owner = await findUserById(userId);
	if (!owner?.stripeCustomerId) return null;

	const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
		apiVersion: "2024-09-30.acacia",
	});
	const subscriptions = await stripe.subscriptions.list({
		customer: owner.stripeCustomerId,
		status: "active",
		expand: ["data.items.data.price"],
	});
	const activeSub = subscriptions.data[0];
	if (!activeSub) return null;

	const priceIds = activeSub.items.data.map(
		(item) => (item.price as Stripe.Price).id,
	);

	if (
		priceIds.some(
			(id) =>
				id === STARTUP_BASE_PRICE_MONTHLY_ID ||
				id === STARTUP_BASE_PRICE_ANNUAL_ID,
		)
	) {
		return "startup";
	}
	if (
		priceIds.some(
			(id) => id === HOBBY_PRICE_MONTHLY_ID || id === HOBBY_PRICE_ANNUAL_ID,
		)
	) {
		return "hobby";
	}
	if (priceIds.some((id) => LEGACY_PRICE_IDS.includes(id))) {
		return "legacy";
	}

	return null;
};

export const getCurrentPlan = async (
	organizationId: string,
): Promise<BillingPlan | null> => {
	if (!IS_CLOUD) return null;

	const ownerId = await getOrganizationOwnerId(organizationId);
	if (!ownerId) return null;

	return getCurrentPlanForUser(ownerId);
};
