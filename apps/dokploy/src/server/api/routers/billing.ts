import { PLANS, type PlanKey } from "@dokploy/server/billing/plans";
import { payment } from "@dokploy/server/billing/payment";
import { db } from "@dokploy/server/db";
import { subscription as subscriptionTable } from "@dokploy/server/db/schema";
import { payment as paymentTable } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../trpc";

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
				recurrent: true,
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

