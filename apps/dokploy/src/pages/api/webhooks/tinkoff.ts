import type { NextApiRequest, NextApiResponse } from "next";

import { addDays } from "date-fns";
import { PLANS, type PlanKey } from "@dokploy/server/billing/plans";
import { payment as tinkoffPaymentClient } from "@dokploy/server/billing/payment";
import { db } from "@dokploy/server/db";
import { payment, subscription, user } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

const PERIOD_DAYS = 30;
const BASE_SERVERS_QUANTITY = 1 as const;
const SERVERS_QUANTITY_BY_PLAN: Record<PlanKey, number> = {
  free: BASE_SERVERS_QUANTITY,
  pro: 10,
  agency: 50,
};

const getServersQuantityByPlan = (planKey: PlanKey): number => {
  return SERVERS_QUANTITY_BY_PLAN[planKey];
};

const updateUserServersQuantityByPlan = async (
  userId: string,
  planKey: PlanKey,
) => {
  const serversQuantity = getServersQuantityByPlan(planKey);

  await db.update(user).set({ serversQuantity }).where(eq(user.id, userId));
};

type CurrentPayment = NonNullable<
  Awaited<ReturnType<typeof db.query.payment.findFirst>>
>;

const getRebillId = (body: Record<string, string>): string | null => {
  return body.RebillId ?? body.RebillID ?? null;
};

const handleSubscriptionPayment = async (
  current: CurrentPayment,
  status: string,
  body: Record<string, string>,
) => {
  if (status === "AUTHORIZED") {
    const paymentId = current.tinkoffPaymentId;
    if (!paymentId) return;
    const isConfirmed = await tinkoffPaymentClient.confirm(paymentId);
    if (!isConfirmed) return;
  }

  if (status === "AUTHORIZED" || status === "CONFIRMED") {
    const currentSubscription = await db.query.subscription.findFirst({
      where: eq(subscription.id, current.subscriptionId ?? ""),
    });

    if (!currentSubscription) {
      throw new Error("Subscription not found for payment");
    }
    const now = new Date();

    await db
      .update(payment)
      .set({ status: "succeeded" })
      .where(eq(payment.id, current.id));

    await db
      .insert(subscription)
      .values({
        userId: current.userId,
        plan: currentSubscription.plan,
        status: "active",
        rebillId: getRebillId(body),
        tinkoffCustomerKey: body.CustomerKey,
        currentPeriodEnd: addDays(now, PERIOD_DAYS),
        cancelAtPeriodEnd: false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscription.userId,
        set: {
          plan: currentSubscription.plan,
          status: "active",
          rebillId: getRebillId(body),
          tinkoffCustomerKey: body.CustomerKey,
          currentPeriodEnd: addDays(now, PERIOD_DAYS),
          cancelAtPeriodEnd: false,
          updatedAt: now,
        },
      });

    await updateUserServersQuantityByPlan(
      current.userId,
      currentSubscription.plan,
    );

    return;
  }

  if (status === "REJECTED") {
    await db
      .update(payment)
      .set({ status: "failed" })
      .where(eq(payment.id, current.id));

    await db
      .update(subscription)
      .set({
        status: "past_due",
      })
      .where(eq(subscription.userId, current.userId));
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

    await db
      .update(user)
      .set({ serversQuantity: BASE_SERVERS_QUANTITY })
      .where(eq(user.id, current.userId));
  }
};

const handleOneTimePayment = async (
  current: CurrentPayment,
  status: string,
) => {
  if (status === "AUTHORIZED") {
    const paymentId = current.tinkoffPaymentId;
    if (!paymentId) return;
    const isConfirmed = await tinkoffPaymentClient.confirm(paymentId);
    if (!isConfirmed) return;
    await db
      .update(payment)
      .set({ status: "succeeded" })
      .where(eq(payment.id, current.id));
    return;
  }

  if (status === "CONFIRMED") {
    await db
      .update(payment)
      .set({ status: "succeeded" })
      .where(eq(payment.id, current.id));
    return;
  }

  if (status === "REJECTED") {
    await db
      .update(payment)
      .set({ status: "failed" })
      .where(eq(payment.id, current.id));
    return;
  }

  if (status === "REFUNDED") {
    await db
      .update(payment)
      .set({ status: "canceled" })
      .where(eq(payment.id, current.id));
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log(req.body, req.method);

  if (req.method !== "POST") {
    res.status(405).send("OK");
    return;
  }

  const body = req.body;

  const tokenOk = tinkoffPaymentClient.verifyWebhook(body);
  if (!tokenOk) {
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
    res.status(200).send("OK");
    return;
  }

  if (current.status !== "pending") {
    res.status(200).send("OK");
    return;
  }

  const state = await tinkoffPaymentClient.status(paymentId);
  const status = state.status;

  if (current.type === "one_time") {
    await handleOneTimePayment(current, status);
  } else {
    await handleSubscriptionPayment(current, status, body);
  }

  res.status(200).send("OK");
}
