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

export const getStripeClient = () =>
	new Stripe(process.env.STRIPE_SECRET_KEY!, {
		apiVersion: "2024-09-30.acacia",
	});

const planFromPriceIds = (priceIds: string[]): BillingPlan | null => {
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

export const getCurrentPlanForUser = async (
	userId: string,
): Promise<BillingPlan | null> => {
	if (!IS_CLOUD) return null;

	const owner = await findUserById(userId);
	if (!owner?.stripeCustomerId) return null;

	const stripe = getStripeClient();
	const subscriptions = await stripe.subscriptions.list({
		customer: owner.stripeCustomerId,
		status: "all",
		expand: ["data.items.data.price"],
	});

	const relevantSubs = subscriptions.data.filter(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	if (relevantSubs.length === 0) return null;

	const priceIds = relevantSubs.flatMap((sub) =>
		sub.items.data.map((item) => (item.price as Stripe.Price).id),
	);

	return planFromPriceIds(priceIds);
};

export const getCurrentPlan = async (
	organizationId: string,
): Promise<BillingPlan | null> => {
	if (!IS_CLOUD) return null;

	const ownerId = await getOrganizationOwnerId(organizationId);
	if (!ownerId) return null;

	return getCurrentPlanForUser(ownerId);
};

export const TRIAL_DURATION_DAYS = 14;
export const TRIAL_SERVER_LIMIT = 1;

export interface BillingStatus {
	plan: BillingPlan | null;
	isOnTrial: boolean;
	trialEndsAt: Date | null;
	trialDaysRemaining: number | null;
	hasUsedTrial: boolean;
	hasActiveAccess: boolean;
}

export const getBillingStatus = async (
	userId: string,
): Promise<BillingStatus> => {
	if (!IS_CLOUD) {
		return {
			plan: null,
			isOnTrial: false,
			trialEndsAt: null,
			trialDaysRemaining: null,
			hasUsedTrial: false,
			hasActiveAccess: true,
		};
	}

	const owner = await findUserById(userId);
	if (!owner?.stripeCustomerId) {
		return {
			plan: null,
			isOnTrial: false,
			trialEndsAt: null,
			trialDaysRemaining: null,
			hasUsedTrial: false,
			hasActiveAccess: false,
		};
	}

	const stripe = getStripeClient();
	const subscriptions = await stripe.subscriptions.list({
		customer: owner.stripeCustomerId,
		status: "all",
		expand: ["data.items.data.price"],
	});

	const relevantSubs = subscriptions.data.filter(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	const priceIds = relevantSubs.flatMap((sub) =>
		sub.items.data.map((item) => (item.price as Stripe.Price).id),
	);
	const plan = planFromPriceIds(priceIds);

	const trialingSub = subscriptions.data.find(
		(sub) => sub.status === "trialing",
	);
	const trialEndsAt = trialingSub?.trial_end
		? new Date(trialingSub.trial_end * 1000)
		: null;
	const trialDaysRemaining = trialEndsAt
		? Math.max(
				0,
				Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
			)
		: null;

	return {
		plan,
		isOnTrial: !!trialingSub,
		trialEndsAt,
		trialDaysRemaining,
		hasUsedTrial: subscriptions.data.length > 0,
		hasActiveAccess: plan !== null || !!trialingSub,
	};
};
