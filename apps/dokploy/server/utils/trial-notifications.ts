import { IS_CLOUD } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import TrialExpiringEmail from "@dokploy/server/emails/emails/trial-expiring";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { render } from "@react-email/components";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import type Stripe from "stripe";
import { user } from "@/server/db/schema";
import { getStripeClient, planFromPriceIds } from "@/server/utils/billing";
import { WEBSITE_URL } from "@/server/utils/stripe";

const REMINDER_THRESHOLDS = [
	{ days: 3, metadataKey: "trialReminder3Sent" },
	{ days: 1, metadataKey: "trialReminder1Sent" },
] as const;

const PLAN_LABELS: Record<string, string> = {
	hobby: "Hobby",
	startup: "Startup",
	legacy: "Legacy",
};

const daysUntil = (timestamp: number) =>
	Math.ceil((timestamp * 1000 - Date.now()) / (1000 * 60 * 60 * 24));

const sendTrialExpiringEmail = async ({
	email,
	firstName,
	planName,
	daysRemaining,
	trialEndsAt,
}: {
	email: string;
	firstName: string;
	planName: string;
	daysRemaining: number;
	trialEndsAt: Date;
}) => {
	const htmlContent = await render(
		TrialExpiringEmail({
			userName: firstName || "User",
			planName,
			daysRemaining,
			endsOn: format(trialEndsAt, "MMM dd, yyyy"),
			billingUrl: `${WEBSITE_URL}/dashboard/settings/billing`,
		}),
	);

	await sendEmail({
		email,
		subject:
			daysRemaining === 1
				? "Your Dokploy trial ends tomorrow"
				: `Your Dokploy trial ends in ${daysRemaining} days`,
		text: htmlContent,
	});
};

const hasPaymentMethod = (subscription: Stripe.Subscription) => {
	if (subscription.default_payment_method) return true;
	const customer = subscription.customer as Stripe.Customer | string;
	if (typeof customer === "string") return false;
	return !!customer.invoice_settings?.default_payment_method;
};

const processSubscription = async (
	stripe: Stripe,
	subscription: Stripe.Subscription,
) => {
	if (!subscription.trial_end || hasPaymentMethod(subscription)) return false;

	const daysRemaining = daysUntil(subscription.trial_end);
	const threshold = REMINDER_THRESHOLDS.find(
		(candidate) =>
			daysRemaining <= candidate.days &&
			!subscription.metadata?.[candidate.metadataKey],
	);
	if (!threshold) return false;

	const customerId =
		typeof subscription.customer === "string"
			? subscription.customer
			: subscription.customer.id;

	const owner = await db.query.user.findFirst({
		where: eq(user.stripeCustomerId, customerId),
	});
	if (!owner || owner.isEnterpriseCloud) return false;

	const priceIds = subscription.items.data.map(
		(item) => (item.price as Stripe.Price).id,
	);
	const plan = planFromPriceIds(priceIds);

	// Claim the reminder before sending so concurrent replicas don't double-send.
	await stripe.subscriptions.update(subscription.id, {
		metadata: { ...subscription.metadata, [threshold.metadataKey]: "sent" },
	});

	try {
		await sendTrialExpiringEmail({
			email: owner.email,
			firstName: owner.firstName,
			planName: plan ? (PLAN_LABELS[plan] ?? plan) : "Trial",
			daysRemaining: Math.max(daysRemaining, 1),
			trialEndsAt: new Date(subscription.trial_end * 1000),
		});
	} catch (error) {
		await stripe.subscriptions.update(subscription.id, {
			metadata: { ...subscription.metadata, [threshold.metadataKey]: "" },
		});
		throw error;
	}

	return true;
};

export const processTrialExpirations = async () => {
	const stripe = getStripeClient();
	let sent = 0;
	let scanned = 0;

	for await (const subscription of stripe.subscriptions.list({
		status: "trialing",
		limit: 100,
		expand: ["data.customer", "data.items.data.price"],
	})) {
		scanned += 1;
		try {
			if (await processSubscription(stripe, subscription)) sent += 1;
		} catch (error) {
			console.error(
				`Trial reminder failed for subscription ${subscription.id}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	return { scanned, sent };
};

export const initTrialNotificationsCronJob = () => {
	if (!IS_CLOUD) return;

	scheduleJob("trial-expiration-reminders", "0 14 * * *", async () => {
		try {
			await processTrialExpirations();
		} catch (error) {
			console.error(
				"Trial reminder job failed:",
				error instanceof Error ? error.message : error,
			);
		}
	});
};
