import { db } from "@dokploy/server/db";
import TrialExpiringEmail from "@dokploy/server/emails/emails/trial-expiring";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { render } from "@react-email/components";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { user } from "@/server/db/schema";
import { planFromPriceIds } from "@/server/utils/billing";
import { WEBSITE_URL } from "@/server/utils/stripe";

const PLAN_LABELS: Record<string, string> = {
	hobby: "Hobby",
	startup: "Startup",
	legacy: "Legacy",
};

const customerIdOf = (subscription: Stripe.Subscription) =>
	typeof subscription.customer === "string"
		? subscription.customer
		: subscription.customer.id;

const hasPaymentMethod = async (
	stripe: Stripe,
	subscription: Stripe.Subscription,
) => {
	if (subscription.default_payment_method) return true;

	const customer = await stripe.customers.retrieve(customerIdOf(subscription));
	if (customer.deleted) return true;
	return !!customer.invoice_settings?.default_payment_method;
};

export const sendTrialExpiringEmail = async (
	stripe: Stripe,
	subscription: Stripe.Subscription,
	// Stripe retries a failing webhook for days, so the countdown is measured
	// from when Stripe emitted the event rather than from the current time.
	notifiedAtSeconds: number,
) => {
	if (!subscription.trial_end) return false;
	if (await hasPaymentMethod(stripe, subscription)) return false;

	const owner = await db.query.user.findFirst({
		where: eq(user.stripeCustomerId, customerIdOf(subscription)),
	});
	if (!owner || owner.isEnterpriseCloud) return false;

	const trialEndsAt = new Date(subscription.trial_end * 1000);
	const daysRemaining = Math.max(
		1,
		Math.ceil((subscription.trial_end - notifiedAtSeconds) / (60 * 60 * 24)),
	);
	const plan = planFromPriceIds(
		subscription.items.data.map((item) => (item.price as Stripe.Price).id),
	);

	const htmlContent = await render(
		TrialExpiringEmail({
			userName: owner.firstName || "User",
			planName: plan ? (PLAN_LABELS[plan] ?? plan) : "Trial",
			daysRemaining,
			endsOn: format(trialEndsAt, "MMM dd, yyyy"),
			billingUrl: `${WEBSITE_URL}/dashboard/settings/billing`,
		}),
	);

	await sendEmail({
		email: owner.email,
		subject:
			daysRemaining === 1
				? "Your Dokploy trial ends tomorrow"
				: `Your Dokploy trial ends in ${daysRemaining} days`,
		text: htmlContent,
	});

	return true;
};
