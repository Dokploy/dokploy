import { PLANS, type PlanKey } from "@dokploy/server/billing/plans";
import { payment } from "@dokploy/server/billing/payment";
import { db } from "@dokploy/server/db";
import { subscription as subscriptionTable } from "@dokploy/server/db/schema";
import { payment as paymentTable } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { addDays } from "date-fns";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const PERIOD_DAYS = 30;

const findPlanByAmount = (amountKopek: number): PlanKey => {
	if (amountKopek === PLANS.agency.price) return "agency";
	if (amountKopek === PLANS.pro.price) return "pro";
	return "pro";
};

export const billingRouter = createTRPCRouter({
	getPlans: protectedProcedure.query(() => {
		return PLANS;
	}),

	getSubscription: protectedProcedure.query(async ({ ctx }) => {
		const row = await db.query.subscription.findFirst({
			where: eq(subscriptionTable.userId, ctx.user.ownerId),
		});
		// TanStack Query v5: данные запроса не могут быть undefined
		return row ?? null;
	}),

	getPayments: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.payment.findMany({
			where: eq(paymentTable.userId, ctx.user.ownerId),
			orderBy: desc(paymentTable.createdAt),
			limit: 50,
		});
	}),

	createCheckout: protectedProcedure
		.input(
			z.object({
				plan: z.enum(["free", "pro", "agency"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const planKey: PlanKey = input.plan;
			const plan = PLANS[planKey];

			if (!plan) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });
			}

			if (planKey === "free") {
				return { paymentUrl: "" };
			}

			const orderId = createId();
			const amountRub = plan.priceMonthly;

			const { paymentUrl, paymentId } = await payment.init({
				amount: amountRub,
				orderId,
				description: `DeployBox ${plan.name}`,
				userId: ctx.user.ownerId,
				// recurrent: true,
			});

			await db.insert(paymentTable).values({
				userId: ctx.user.ownerId,
				tinkoffPaymentId: paymentId,
				orderId,
				amount: plan.price,
				currency: "RUB",
				status: "pending",
				description: `DeployBox ${plan.name}`,
			});

			return { paymentUrl };
		}),

	syncCheckoutStatus: protectedProcedure.mutation(async ({ ctx }) => {
		const latestPending = await db.query.payment.findFirst({
			where: eq(paymentTable.userId, ctx.user.ownerId),
			orderBy: desc(paymentTable.createdAt),
		});

		if (!latestPending || latestPending.status !== "pending") {
			return { status: "idle" as const };
		}

		const paymentId = latestPending.tinkoffPaymentId;
		if (!paymentId) {
			return { status: "pending" as const };
		}

		const state = await payment.status(paymentId);	
		const now = new Date();

		if (state.status === "AUTHORIZED" || state.status === "CONFIRMED") {
			if (state.status === "AUTHORIZED") {
				await payment.confirm(paymentId);
			}

			const plan = findPlanByAmount(latestPending.amount);

			await db
				.update(paymentTable)
				.set({ status: "succeeded" })
				.where(eq(paymentTable.id, latestPending.id));

			await db
				.insert(subscriptionTable)
				.values({
					userId: latestPending.userId,
					plan,
					status: "active",
					tinkoffCustomerKey: latestPending.userId,
					currentPeriodEnd: addDays(now, PERIOD_DAYS),
					cancelAtPeriodEnd: false,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: subscriptionTable.userId,
					set: {
						plan,
						status: "active",
						currentPeriodEnd: addDays(now, PERIOD_DAYS),
						cancelAtPeriodEnd: false,
						updatedAt: now,
					},
				});

			return { status: "confirmed" as const };
		}

		if (state.status === "REJECTED" || state.status === "CANCELED") {
			await db
				.update(paymentTable)
				.set({ status: "failed" })
				.where(eq(paymentTable.id, latestPending.id));

			return { status: "failed" as const };
		}

		return { status: "pending" as const };
	}),

	cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
		const existing = await db.query.subscription.findFirst({
			where: eq(subscriptionTable.userId, ctx.user.ownerId),
		});

		if (!existing) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Subscription not found",
			});
		}

		await db
			.update(subscriptionTable)
			.set({ cancelAtPeriodEnd: true })
			.where(eq(subscriptionTable.userId, ctx.user.ownerId));

		return { ok: true };
	}),
});

