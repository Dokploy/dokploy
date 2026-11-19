import { db } from "@dokploy/server/db";
import OnboardingReturnEmail from "@dokploy/server/emails/emails/onboarding-return";
import { sendEmail } from "@dokploy/server/verification/send-verification-email";
import { render } from "@react-email/components";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import type Stripe from "stripe";
import { SERVER_PROVIDERS } from "@/lib/onboarding";
import { user } from "@/server/db/schema";
import { getStripeClient } from "@/server/utils/billing";
import { WEBSITE_URL } from "@/server/utils/stripe";
import { sendTrialExpiringEmail } from "@/server/utils/trial-notifications";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RETURN_EMAIL_DELAYS_MS = [HOUR_MS, DAY_MS, 3 * DAY_MS];
const PLAN_PROMPT_DAYS_LEFT = 2;

export const sendOnboardingReturnEmails = async (now = new Date()) => {
	let sent = 0;
	for (const [stage, delay] of [
		...RETURN_EMAIL_DELAYS_MS.entries(),
	].reverse()) {
		const dueBefore = new Date(now.getTime() - delay);
		const dueAfter = new Date(dueBefore.getTime() - DAY_MS);

		const claimed = await db
			.update(user)
			.set({ onboardingReturnEmails: stage + 1 })
			.where(
				and(
					lte(user.onboardingReturnEmails, stage),
					lte(user.createdAt, dueBefore),
					gte(user.createdAt, dueAfter),
					eq(user.emailVerified, true),
					eq(user.isEnterpriseCloud, false),
					sql`${user.stripeSubscriptionId} is null`,
					sql`exists (select 1 from "organization" o where o."owner_id" = ${user.id})`,
					sql`not exists (select 1 from "server" s inner join "organization" o on o."id" = s."organizationId" where o."owner_id" = ${user.id})`,
				),
			)
			.returning({
				id: user.id,
				email: user.email,
				firstName: user.firstName,
			});

		for (const recipient of claimed) {
			try {
				const html = await render(
					OnboardingReturnEmail({
						userName: recipient.firstName || "User",
						returnUrl: `${WEBSITE_URL}/dashboard/home?onboarding=resume`,
						providers: SERVER_PROVIDERS.map(({ name, url, offer }) => ({
							name,
							url,
							offer,
						})),
					}),
				);
				await sendEmail({
					email: recipient.email,
					subject: "Your Dokploy setup is one step away",
					text: html,
				});
				sent += 1;
			} catch (error) {
				console.error("Failed to send the onboarding return email:", error);
				await db
					.update(user)
					.set({ onboardingReturnEmails: stage })
					.where(
						and(
							eq(user.id, recipient.id),
							eq(user.onboardingReturnEmails, stage + 1),
						),
					);
			}
		}
	}
	return sent;
};

export const sendTrialPlanPrompts = async (now = new Date()) => {
	const stripe = getStripeClient();
	const nowSeconds = Math.floor(now.getTime() / 1000);
	const threshold = nowSeconds + PLAN_PROMPT_DAYS_LEFT * 24 * 60 * 60;
	let sent = 0;

	const trials = stripe.subscriptions.list({ status: "trialing", limit: 100 });
	for await (const subscription of trials) {
		if (!subscription.trial_end || subscription.trial_end > threshold) continue;
		if (subscription.trial_end <= nowSeconds) continue;

		const customerId =
			typeof subscription.customer === "string"
				? subscription.customer
				: subscription.customer.id;
		const [claimed] = await db
			.update(user)
			.set({ trialPlanPromptSubscriptionId: subscription.id })
			.where(
				and(
					eq(user.stripeCustomerId, customerId),
					sql`${user.trialPlanPromptSubscriptionId} is distinct from ${subscription.id}`,
				),
			)
			.returning({ id: user.id });
		if (!claimed) continue;

		try {
			const expanded = (await stripe.subscriptions.retrieve(subscription.id, {
				expand: ["items.data.price"],
			})) as Stripe.Subscription;
			if (await sendTrialExpiringEmail(stripe, expanded, nowSeconds)) {
				sent += 1;
			}
		} catch (error) {
			console.error("Failed to send the trial plan prompt:", error);
			await db
				.update(user)
				.set({ trialPlanPromptSubscriptionId: null })
				.where(
					and(
						eq(user.id, claimed.id),
						eq(user.trialPlanPromptSubscriptionId, subscription.id),
					),
				);
		}
	}
	return sent;
};

export const initOnboardingEmailJobs = () => {
	scheduleJob("onboarding-return-emails", "*/10 * * * *", async () => {
		await sendOnboardingReturnEmails().catch((error) => {
			console.error("Onboarding return emails failed:", error);
		});
	});
	scheduleJob("trial-plan-prompts", "5 * * * *", async () => {
		await sendTrialPlanPrompts().catch((error) => {
			console.error("Trial plan prompts failed:", error);
		});
	});
};
