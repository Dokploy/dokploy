import type { NextApiRequest, NextApiResponse } from "next";

import { addDays } from "date-fns";
import { PLANS, type PlanKey } from "@dokploy/server/billing/plans";
import { payment as tinkoffPaymentClient } from "@dokploy/server/billing/payment";
import { logger } from "@dokploy/server/lib/logger";
import { db } from "@dokploy/server/db";
import { payment, subscription } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

const PERIOD_DAYS = 30;

type WebhookBody = Record<string, string | undefined>;

const isRecord = (v: unknown): v is Record<string, unknown> => {
	if (!v || typeof v !== "object") return false;
	if (Array.isArray(v)) return false;
	return true;
};

const normalizeBody = (body: unknown): Record<string, string> => {
	if (!isRecord(body)) return {};
	const result: Record<string, string> = {};
	for (const [k, v] of Object.entries(body)) {
		if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
			result[k] = String(v);
		}
	}
	return result;
};

const findPlanKeyByAmount = (amountKopek: number): PlanKey | null => {
	const entries = Object.entries(PLANS) as Array<[PlanKey, (typeof PLANS)[PlanKey]]>;
	const match = entries.find(([, plan]) => plan.price === amountKopek);
	return match?.[0] ?? null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		res.status(405).send("OK");
		return;
	}

	const body = normalizeBody(req.body);

	const tokenOk = tinkoffPaymentClient.verifyWebhook(body);
	if (!tokenOk) {
		logger.warn({ keys: Object.keys(body) }, "Tinkoff webhook invalid token");
		res.status(400).send("OK");
		return;
	}

	const paymentId = body.PaymentId;
	if (!paymentId) {
		res.status(200).send("OK");
		return;
	}

	const current = await db.query.payment.findFirst({
		where: eq(payment.tinkoffPaymentId, paymentId),
	});

	if (!current) {
		logger.warn({ paymentId }, "Tinkoff webhook: payment not found");
		res.status(200).send("OK");
		return;
	}

	if (current.status !== "pending") {
		res.status(200).send("OK");
		return;
	}

	const state = await tinkoffPaymentClient.status(paymentId);
	const status = state.status;

	if (status === "CONFIRMED") {
		const planKey = findPlanKeyByAmount(current.amount);
		const now = new Date();

		await db
			.update(payment)
			.set({ status: "succeeded" })
			.where(eq(payment.id, current.id));

		await db
			.insert(subscription)
			.values({
				userId: current.userId,
				plan: planKey ?? "pro",
				status: "active",
				rebillId: body.RebillId ?? body.RebillID,
				tinkoffCustomerKey: body.CustomerKey,
				currentPeriodEnd: addDays(now, PERIOD_DAYS),
				cancelAtPeriodEnd: false,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: subscription.userId,
				set: {
					plan: planKey ?? "pro",
					status: "active",
					rebillId: body.RebillId ?? body.RebillID,
					tinkoffCustomerKey: body.CustomerKey,
					currentPeriodEnd: addDays(now, PERIOD_DAYS),
					cancelAtPeriodEnd: false,
					updatedAt: now,
				},
			});

		res.status(200).send("OK");
		return;
	}

	if (status === "REJECTED") {
		await db
			.update(payment)
			.set({ status: "failed" })
			.where(eq(payment.id, current.id));

		await db
			.insert(subscription)
			.values({
				userId: current.userId,
				plan: "pro",
				status: "past_due",
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: subscription.userId,
				set: { status: "past_due", updatedAt: new Date() },
			});

		res.status(200).send("OK");
		return;
	}

	if (status === "REFUNDED") {
		await db
			.update(payment)
			.set({ status: "canceled" })
			.where(eq(payment.id, current.id));

		await db
			.update(subscription)
			.set({ status: "canceled", updatedAt: new Date() })
			.where(eq(subscription.userId, current.userId));

		res.status(200).send("OK");
		return;
	}

	res.status(200).send("OK");
}

