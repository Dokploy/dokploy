import { admins } from "@/server/db/schema";
import {
	ADDITIONAL_PRICE_YEARLY_ID,
	BASE_PRICE_MONTHLY_ID,
	BASE_PRICE_YEARLY_ID,
	GROWTH_PRICE_MONTHLY_ID,
	GROWTH_PRICE_YEARLY_ID,
	SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
	getStripeItems,
	getStripePrices,
	getStripeSubscriptionItems,
	getStripeSubscriptionItemsCalculate,
	updateBasePlan,
} from "@/server/utils/stripe";
import { findAdminById } from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const stripeRouter = createTRPCRouter({
	getProducts: adminProcedure.query(async ({ ctx }) => {
		const admin = await findAdminById(ctx.user.adminId);
		const stripeCustomerId = admin.stripeCustomerId;

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
			apiVersion: "2024-09-30.acacia",
		});

		const products = await stripe.products.list({
			expand: ["data.default_price"],
			active: true,
		});

		if (!stripeCustomerId) {
			return {
				products: products.data,
				subscriptions: [],
			};
		}

		const subscriptions = await stripe.subscriptions.list({
			customer: stripeCustomerId,
			status: "active",
			expand: ["data.items.data.price"],
		});

		return {
			products: products.data,
			subscriptions: subscriptions.data,
		};
	}),
	createCheckoutSession: adminProcedure
		.input(
			z.object({
				productId: z.string(),
				serverQuantity: z.number().min(1),
				isAnnual: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
				apiVersion: "2024-09-30.acacia",
			});

			const items = getStripeItems(input.serverQuantity, input.isAnnual);

			const session = await stripe.checkout.sessions.create({
				// payment_method_types: ["card"],
				mode: "subscription",
				line_items: items,
				// subscription_data: {
				// 	trial_period_days: 0,
				// },
				subscription_data: {
					metadata: {
						serverQuantity: input.serverQuantity,
					},
				},
				success_url:
					"http://localhost:3000/api/stripe.success?sessionId={CHECKOUT_SESSION_ID}",
				cancel_url: "http://localhost:3000/dashboard/settings/billing",
			});

			return { sessionId: session.id };
		}),

	upgradeSubscriptionMonthly: adminProcedure
		.input(
			z.object({
				subscriptionId: z.string(),
				serverQuantity: z.number().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
				apiVersion: "2024-09-30.acacia",
			});

			const { subscriptionId, serverQuantity } = input;
			const admin = await findAdminById(ctx.user.adminId);
			const suscription = await stripe.subscriptions.retrieve(subscriptionId);
			const currentItems = suscription.items.data;
			// If have a monthly plan, we need to create a new subscription
			const haveMonthlyPlan = currentItems.find(
				(item) =>
					item.price.id === BASE_PRICE_YEARLY_ID ||
					item.price.id === GROWTH_PRICE_YEARLY_ID ||
					item.price.id === ADDITIONAL_PRICE_YEARLY_ID,
			);

			if (haveMonthlyPlan) {
				const items = getStripeItems(serverQuantity, false);
				const session = await stripe.checkout.sessions.create({
					line_items: items,
					mode: "subscription",
					...(admin.stripeCustomerId && {
						customer: admin.stripeCustomerId,
					}),
					subscription_data: {
						metadata: {
							serverQuantity: input.serverQuantity,
						},
					},
					success_url:
						"http://localhost:3000/api/stripe.success?sessionId={CHECKOUT_SESSION_ID}",
					cancel_url: "http://localhost:3000/dashboard/settings/billing",
				});

				return {
					type: "new",
					success: true,
					sessionId: session.id,
				};
			}

			const basePriceId = BASE_PRICE_MONTHLY_ID;
			const growthPriceId = GROWTH_PRICE_MONTHLY_ID;
			const additionalPriceId = SERVER_ADDITIONAL_PRICE_MONTHLY_ID;

			// Obtener suscripción actual
			const { baseItem, additionalItem } = await getStripeSubscriptionItems(
				subscriptionId,
				false,
			);

			const deleteAdditionalItem = async () => {
				if (additionalItem) {
					await stripe.subscriptionItems.del(additionalItem.id);
				}
			};

			const updateOrCreateAdditionalItem = async (
				additionalServers: number,
			) => {
				if (additionalItem) {
					await stripe.subscriptionItems.update(additionalItem.id, {
						quantity: additionalServers,
					});
				} else {
					await stripe.subscriptions.update(subscriptionId, {
						items: [
							{
								price: additionalPriceId,
								quantity: additionalServers,
							},
						],
						proration_behavior: "always_invoice",
					});
				}
			};

			if (serverQuantity === 1) {
				await deleteAdditionalItem();
				if (baseItem?.price.id !== basePriceId && baseItem?.price.id) {
					await updateBasePlan(subscriptionId, baseItem?.id, basePriceId);
				}
			} else if (serverQuantity >= 2 && serverQuantity <= 3) {
				await deleteAdditionalItem();
				if (baseItem?.price.id !== growthPriceId && baseItem?.price.id) {
					await updateBasePlan(subscriptionId, baseItem?.id, growthPriceId);
				}
			} else if (serverQuantity > 3) {
				if (baseItem?.price.id !== growthPriceId && baseItem?.price.id) {
					await updateBasePlan(subscriptionId, baseItem?.id, growthPriceId);
				}
				const additionalServers = serverQuantity - 3;
				await updateOrCreateAdditionalItem(additionalServers);
			}

			await stripe.subscriptions.update(subscriptionId, {
				metadata: {
					serverQuantity: serverQuantity.toString(),
				},
			});

			return { success: true };
		}),
	upgradeSubscriptionAnnual: adminProcedure
		.input(
			z.object({
				subscriptionId: z.string(),
				serverQuantity: z.number().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
				apiVersion: "2024-09-30.acacia",
			});

			const { subscriptionId, serverQuantity } = input;

			const currentSubscription =
				await stripe.subscriptions.retrieve(subscriptionId);

			if (!currentSubscription) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Subscription not found",
				});
			}
			const admin = await findAdminById(ctx.user.adminId);
			const currentItems = currentSubscription.items.data;
			// If have a monthly plan, we need to create a new subscription
			const haveMonthlyPlan = currentItems.find(
				(item) =>
					item.price.id === BASE_PRICE_MONTHLY_ID ||
					item.price.id === GROWTH_PRICE_MONTHLY_ID ||
					item.price.id === SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
			);

			if (haveMonthlyPlan) {
				const items = getStripeItems(serverQuantity, true);
				const session = await stripe.checkout.sessions.create({
					line_items: items,
					mode: "subscription",
					...(admin.stripeCustomerId && {
						customer: admin.stripeCustomerId,
					}),
					subscription_data: {
						metadata: {
							serverQuantity: input.serverQuantity,
						},
					},
					success_url:
						"http://localhost:3000/api/stripe.success?sessionId={CHECKOUT_SESSION_ID}",
					cancel_url: "http://localhost:3000/dashboard/settings/billing",
				});

				return {
					type: "new",
					success: true,
					sessionId: session.id,
				};
			}

			const basePriceId = BASE_PRICE_YEARLY_ID;
			const growthPriceId = GROWTH_PRICE_YEARLY_ID;
			const additionalPriceId = ADDITIONAL_PRICE_YEARLY_ID;

			// Obtener suscripción actual
			const { baseItem, additionalItem } = await getStripeSubscriptionItems(
				subscriptionId,
				true,
			);

			const deleteAdditionalItem = async () => {
				if (additionalItem) {
					await stripe.subscriptionItems.del(additionalItem.id);
				}
			};

			const updateOrCreateAdditionalItem = async (
				additionalServers: number,
			) => {
				if (additionalItem) {
					await stripe.subscriptionItems.update(additionalItem.id, {
						quantity: additionalServers,
					});
				} else {
					await stripe.subscriptions.update(subscriptionId, {
						items: [
							{
								price: additionalPriceId,
								quantity: additionalServers,
							},
						],
						proration_behavior: "always_invoice",
					});
				}
			};

			if (serverQuantity === 1) {
				await deleteAdditionalItem();
				if (baseItem?.price.id !== basePriceId && baseItem?.price.id) {
					await updateBasePlan(subscriptionId, baseItem?.id, basePriceId);
				}
			} else if (serverQuantity >= 2 && serverQuantity <= 3) {
				await deleteAdditionalItem();
				if (baseItem?.price.id !== growthPriceId && baseItem?.price.id) {
					await updateBasePlan(subscriptionId, baseItem?.id, growthPriceId);
				}
			} else if (serverQuantity > 3) {
				if (baseItem?.price.id !== growthPriceId && baseItem?.price.id) {
					await updateBasePlan(subscriptionId, baseItem?.id, growthPriceId);
				}
				const additionalServers = serverQuantity - 3;
				await updateOrCreateAdditionalItem(additionalServers);
			}

			await stripe.subscriptions.update(subscriptionId, {
				metadata: {
					serverQuantity: serverQuantity.toString(),
				},
			});

			return { success: true };
		}),
	createCustomerPortalSession: adminProcedure.mutation(
		async ({ ctx, input }) => {
			const admin = await findAdminById(ctx.user.adminId);

			if (!admin.stripeCustomerId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Stripe Customer ID not found",
				});
			}
			const stripeCustomerId = admin.stripeCustomerId;

			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
				apiVersion: "2024-09-30.acacia",
			});

			const session = await stripe.billingPortal.sessions.create({
				customer: stripeCustomerId,
				return_url: "http://localhost:3000/dashboard/settings/billing",
			});

			return { url: session.url };
		},
	),
	success: adminProcedure.query(async ({ ctx }) => {
		const sessionId = ctx.req.query.sessionId as string;

		if (!sessionId) {
			throw new Error("No session_id provided");
		}

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
			apiVersion: "2024-09-30.acacia",
		});

		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (session.payment_status === "paid") {
			const admin = await findAdminById(ctx.user.adminId);

			if (admin.stripeSubscriptionId) {
				const subscription = await stripe.subscriptions.retrieve(
					admin.stripeSubscriptionId,
				);
				if (subscription.status === "active") {
					await stripe.subscriptions.update(admin.stripeSubscriptionId, {
						cancel_at_period_end: true,
					});
				}
			}
			console.log("Payment successful!");

			const stripeCustomerId = session.customer as string;
			console.log("Stripe Customer ID:", stripeCustomerId);

			const stripeSubscriptionId = session.subscription as string;
			console.log("Stripe Subscription ID:", stripeSubscriptionId);

			await db
				?.update(admins)
				.set({
					stripeCustomerId,
					stripeSubscriptionId,
				})
				.where(eq(admins.adminId, ctx.user.adminId))
				.returning();
		} else {
			console.log("Payment not completed or failed.");
		}

		ctx.res.redirect("/dashboard/settings/billing");

		return true;
	}),

	getBillingSubscription: adminProcedure.query(async ({ ctx }) => {
		const admin = await findAdminById(ctx.user.adminId);

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
			apiVersion: "2024-09-30.acacia",
		});

		const stripeSubscriptionId = admin.stripeSubscriptionId;
		const subscription =
			await stripe.subscriptions.retrieve(stripeSubscriptionId);

		let billingInterval: Stripe.Price.Recurring.Interval | undefined;

		const totalServers = subscription.metadata.serverQuantity;
		let totalAmount = 0;

		for (const item of subscription.items.data) {
			const quantity = item.quantity || 1;
			const amountPerUnit = item.price.unit_amount / 100;

			totalAmount += quantity * amountPerUnit;
			billingInterval = item.price.recurring?.interval;
		}

		return {
			nextPaymentDate: new Date(subscription.current_period_end * 1000),
			monthlyAmount: totalAmount.toFixed(2),
			totalServers,
			billingInterval,
		};
	}),

	calculateUpgradeCost: adminProcedure
		.input(
			z.object({
				serverQuantity: z.number().min(1),
				isAnnual: z.boolean(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const admin = await findAdminById(ctx.user.adminId);
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
				apiVersion: "2024-09-30.acacia",
			});

			if (!admin.stripeSubscriptionId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Subscription not found",
				});
			}

			const subscriptionId = admin.stripeSubscriptionId;
			if (!subscriptionId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Subscription not found",
				});
			}

			const items = await getStripeSubscriptionItemsCalculate(
				subscriptionId,
				input.serverQuantity,
				input.isAnnual,
			);

			const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
				subscription: subscriptionId,
				subscription_items: items,
				subscription_proration_behavior: "always_invoice",
			});

			const totalAmount = upcomingInvoice.total / 100;
			return totalAmount;
		}),
	calculateNewMonthlyCost: adminProcedure
		.input(
			z.object({
				serverQuantity: z.number().min(1),
				isAnnual: z.boolean(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const serverCount = input.serverQuantity;

			const prices = await getStripePrices(input.isAnnual);
			let monthlyCost = 0;
			if (serverCount === 1) {
				monthlyCost = prices?.basePrice?.unit_amount / 100;
			} else if (serverCount >= 2 && serverCount <= 3) {
				monthlyCost = prices?.growthPrice?.unit_amount / 100;
			} else if (serverCount > 3) {
				monthlyCost =
					prices?.growthPrice?.unit_amount / 100 +
					(serverCount - 3) * (prices?.additionalPrice?.unit_amount / 100);
			}

			return monthlyCost.toFixed(2);
		}),
});
// {
// 	"Parallelism": 1,
// 	"Delay": 10000000000,
// 	"FailureAction": "rollback",
// 	"Order": "start-first"
//   }
