import { IS_CLOUD } from "@dokploy/server";
import { db, dbUrl } from "@dokploy/server/db";
import TrialExpiringEmail from "@dokploy/server/emails/emails/trial-expiring";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { render } from "@react-email/components";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import postgres from "postgres";
import type Stripe from "stripe";
import { user } from "@/server/db/schema";
import { getStripeClient, planFromPriceIds } from "@/server/utils/billing";
import { WEBSITE_URL } from "@/server/utils/stripe";

const REMINDER_THRESHOLDS = [
	{ days: 1, metadataKey: "trialReminder1Sent" },
] as const;

// Cloud runs several replicas and node-schedule fires on each one, so without
// this every trial user would get one email per replica. Advisory locks live
// in the connection rather than the schema, so no migration is needed.
const ADVISORY_LOCK_KEY = 4820260918;

const withAdvisoryLock = async <T>(run: () => Promise<T>) => {
	const sql = postgres(dbUrl, { max: 1 });
	try {
		const [row] =
			await sql`select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as locked`;
		if (!row?.locked) return null;
		try {
			return await run();
		} finally {
			await sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
		}
	} finally {
		await sql.end({ timeout: 5 });
	}
};

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

	// Marked before sending so a crash mid-send cannot resend on the next run.
	// Stripe merges metadata, so only the claimed key travels; spreading the
	// snapshot read at list time would rewrite concurrent changes.
	await stripe.subscriptions.update(subscription.id, {
		metadata: { [threshold.metadataKey]: "sent" },
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
			metadata: { [threshold.metadataKey]: "" },
		});
		throw error;
	}

	return true;
};

const processTrialExpirations = async () => {
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
			const result = await withAdvisoryLock(processTrialExpirations);
			if (!result) {
				console.log("Trial reminders: another replica holds the lock");
				return;
			}
			console.log(
				`Trial reminders: scanned ${result.scanned}, sent ${result.sent}`,
			);
		} catch (error) {
			console.error(
				"Trial reminder job failed:",
				error instanceof Error ? error.message : error,
			);
		}
	});
};
