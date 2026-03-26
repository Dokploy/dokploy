import { RecurrenceRule, scheduleJob } from "node-schedule";

import { addDays, addHours } from "date-fns";
import { createId } from "@paralleldrive/cuid2";
import { logger } from "../lib/logger";
import { db } from "../db";
import { payment as paymentClient } from "../billing/payment";
import { PLANS } from "../billing/plans";
import { payment, subscription } from "../db/schema/billing";
import { eq, and, isNotNull, lte } from "drizzle-orm";

const PERIOD_DAYS = 30;
const RETRY_WINDOW_HOURS = 24;

const toRub = (amountKopek: number): number => amountKopek / 100;

const getPlanAmountKopek = (plan: string): number | null => {
	if (plan === "free") return PLANS.free.price;
	if (plan === "pro") return PLANS.pro.price;
	if (plan === "agency") return PLANS.agency.price;
	return null;
};

export const initChargeSubscriptionsCronJobs = async () => {
	const rule = new RecurrenceRule();
	rule.tz = "Etc/UTC";
	rule.hour = 10;
	rule.minute = 0;

	scheduleJob("charge-subscriptions", rule, async () => {
		const now = new Date();
		const threshold = addHours(now, RETRY_WINDOW_HOURS);

		const dueSubscriptions = await db.query.subscription.findMany({
			where: and(
				eq(subscription.status, "active"),
				eq(subscription.cancelAtPeriodEnd, false),
				isNotNull(subscription.rebillId),
				isNotNull(subscription.currentPeriodEnd),
				lte(subscription.currentPeriodEnd, threshold),
			),
		});

		for (const sub of dueSubscriptions) {
			const amountKopek = getPlanAmountKopek(sub.plan);
			if (!amountKopek) {
				logger.warn({ subscriptionId: sub.id, plan: sub.plan }, "Unknown plan");
				continue;
			}

			const orderId = createId();
			try {
				const result = await paymentClient.charge({
					userId: sub.userId,
					amount: toRub(amountKopek),
					description: `DeployBox ${sub.plan}`,
					rebillId: sub.rebillId ?? "",
				});

				if (result.success) {
					await db.insert(payment).values({
						userId: sub.userId,
						tinkoffPaymentId: result.paymentId,
						orderId,
						amount: amountKopek,
						currency: "RUB",
						status: "succeeded",
						description: `DeployBox ${sub.plan}`,
					});

					const nextEnd = addDays(sub.currentPeriodEnd ?? now, PERIOD_DAYS);
					await db
						.update(subscription)
						.set({
							status: "active",
							currentPeriodEnd: nextEnd,
							updatedAt: now,
						})
						.where(eq(subscription.id, sub.id));

					continue;
				}

				await db.insert(payment).values({
					userId: sub.userId,
					tinkoffPaymentId: result.paymentId,
					orderId,
					amount: amountKopek,
					currency: "RUB",
					status: result.failureKind === "REJECTED" ? "failed" : "pending",
					description: `DeployBox ${sub.plan}`,
				});

				if (result.failureKind === "REJECTED") {
					await db
						.update(subscription)
						.set({ status: "past_due", updatedAt: now })
						.where(eq(subscription.id, sub.id));

					logger.warn(
						{ subscriptionId: sub.id, userId: sub.userId },
						"Subscription moved to past_due",
					);
					continue;
				}

				// UNKNOWN: temporary failure, retry later
				logger.warn(
					{ subscriptionId: sub.id, userId: sub.userId },
					"Temporary charge failure, will retry",
				);
			} catch (error) {
				logger.error({ subscriptionId: sub.id, error }, "Charge subscriptions job failed");
			}
		}
	});
};

