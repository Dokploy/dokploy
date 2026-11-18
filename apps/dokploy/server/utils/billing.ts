import { findUserById, IS_CLOUD, updateUser } from "@dokploy/server";
import { getOrganizationOwnerId } from "@dokploy/server/services/proprietary/sso";
import { TRPCError } from "@trpc/server";
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

export const planFromPriceIds = (priceIds: string[]): BillingPlan | null => {
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

export const TRIAL_DURATION_DAYS = 7;
export type TrialTier = "hobby" | "startup";
export const TRIAL_SERVER_LIMITS: Record<TrialTier, number> = {
	hobby: 1,
	startup: 3,
};

export interface BillingStatus {
	plan: BillingPlan | null;
	isOnTrial: boolean;
	trialEndsAt: Date | null;
	trialDaysRemaining: number | null;
	hasUsedTrial: boolean;
	hasActiveAccess: boolean;
	hasPaymentMethod: boolean;
	isAnnual: boolean;
	isEnterpriseCloud: boolean;
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
			hasPaymentMethod: true,
			isAnnual: false,
			isEnterpriseCloud: false,
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
			hasPaymentMethod: false,
			isAnnual: false,
			isEnterpriseCloud: owner?.isEnterpriseCloud ?? false,
		};
	}

	const stripe = getStripeClient();
	const subscriptions = await stripe.subscriptions.list({
		customer: owner.stripeCustomerId,
		status: "all",
		expand: ["data.items.data.price", "data.customer"],
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

	const currentSub = trialingSub ?? relevantSubs[0];
	const customer = currentSub?.customer as Stripe.Customer | undefined;
	const hasPaymentMethod =
		!!currentSub?.default_payment_method ||
		!!customer?.invoice_settings?.default_payment_method;
	const isAnnual =
		(currentSub?.items.data[0]?.price as Stripe.Price | undefined)?.recurring
			?.interval === "year";
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
		hasPaymentMethod,
		hasUsedTrial: subscriptions.data.length > 0,
		hasActiveAccess: plan !== null || !!trialingSub,
		isAnnual,
		isEnterpriseCloud: owner.isEnterpriseCloud,
	};
};

export const startTrial = async (ownerId: string, tier: TrialTier) => {
	const trialPriceId =
		tier === "startup" ? STARTUP_BASE_PRICE_MONTHLY_ID : HOBBY_PRICE_MONTHLY_ID;
	if (!trialPriceId) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Trials are not configured",
		});
	}

	const owner = await findUserById(ownerId);
	const billingStatus = await getBillingStatus(owner.id);

	if (billingStatus.hasActiveAccess) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "You already have an active plan or trial",
		});
	}

	if (billingStatus.hasUsedTrial) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "You have already used your free trial",
		});
	}

	const stripe = getStripeClient();

	let stripeCustomerId = owner.stripeCustomerId;
	if (stripeCustomerId) {
		const customer = await stripe.customers.retrieve(stripeCustomerId);
		if (customer.deleted) {
			stripeCustomerId = null;
		}
	}
	if (!stripeCustomerId) {
		const customer = await stripe.customers.create({ email: owner.email });
		stripeCustomerId = customer.id;
	}

	const subscription = await stripe.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: trialPriceId, quantity: 1 }],
		trial_period_days: TRIAL_DURATION_DAYS,
		trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
		metadata: {
			source: "onboarding_trial",
			adminId: owner.id,
			tier,
		},
	});

	await updateUser(owner.id, {
		stripeCustomerId,
		stripeSubscriptionId: subscription.id,
		serversQuantity: TRIAL_SERVER_LIMITS[tier],
	});

	return {
		owner,
		trialEndsAt: subscription.trial_end
			? new Date(subscription.trial_end * 1000)
			: null,
	};
};

const isMissingResource = (error: unknown) =>
	error instanceof Stripe.errors.StripeError &&
	error.code === "resource_missing";

export const cancelStripeSubscriptions = async (
	stripeCustomerId: string,
	stripe: Stripe = getStripeClient(),
) => {
	const subscriptions = await stripe.subscriptions
		.list({ customer: stripeCustomerId, status: "all", limit: 100 })
		.catch((error: unknown) => {
			if (isMissingResource(error)) return null;
			throw error;
		});

	const cancelledSubscriptions: string[] = [];
	for (const subscription of subscriptions?.data ?? []) {
		if (
			subscription.status === "canceled" ||
			subscription.status === "incomplete_expired"
		) {
			continue;
		}
		await stripe.subscriptions.cancel(subscription.id, {
			invoice_now: false,
			prorate: false,
		});
		cancelledSubscriptions.push(subscription.id);
	}

	return { cancelledSubscriptions };
};
