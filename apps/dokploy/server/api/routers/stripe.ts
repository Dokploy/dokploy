import {
	findServersByUserId,
	findUserById,
	IS_CLOUD,
	updateUser,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import Stripe from "stripe";
import { z } from "zod";
import {
	type BillingTier,
	getStripeItems,
	HOBBY_PRICE_ANNUAL_ID,
	HOBBY_PRICE_MONTHLY_ID,
	HOBBY_PRODUCT_ID,
	LEGACY_PRICE_IDS,
	PRODUCT_ANNUAL_ID,
	PRODUCT_MONTHLY_ID,
	STARTUP_BASE_PRICE_ANNUAL_ID,
	STARTUP_BASE_PRICE_MONTHLY_ID,
	STARTUP_PRODUCT_ID,
	WEBSITE_URL,
} from "@/server/utils/stripe";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const stripeRouter = createTRPCRouter({
	getProducts: adminProcedure.query(async ({ ctx }) => {
		const user = await findUserById(ctx.user.ownerId);
		const stripeCustomerId = user.stripeCustomerId;

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
			apiVersion: "2024-09-30.acacia",
		});

		const products = await stripe.products.list({
			expand: ["data.default_price"],
			active: true,
		});

		const productIds = [
			PRODUCT_MONTHLY_ID,
			PRODUCT_ANNUAL_ID,
			HOBBY_PRODUCT_ID,
			STARTUP_PRODUCT_ID,
		].filter(Boolean);
		const filteredProducts = products.data.filter((product) =>
			productIds.includes(product.id),
		);

		if (!stripeCustomerId) {
			return {
				products: filteredProducts,
				subscriptions: [],
				hobbyProductId: HOBBY_PRODUCT_ID || undefined,
				startupProductId: STARTUP_PRODUCT_ID || undefined,
				currentPlan: null as "legacy" | "hobby" | "startup" | null,
				isAnnualCurrent: false,
				currentPriceAmount: null,
			};
		}

		const subscriptions = await stripe.subscriptions.list({
			customer: stripeCustomerId,
			status: "active",
			expand: ["data.items.data.price"],
		});

		type CurrentPlan = "legacy" | "hobby" | "startup";
		let currentPlan: CurrentPlan = "legacy";
		let isAnnualCurrent = false;
		let currentPriceAmount: number | null = null;
		const activeSub = subscriptions.data[0];
		if (activeSub) {
			const priceIds = activeSub.items.data.map(
				(item) => (item.price as Stripe.Price).id,
			);
			if (
				priceIds.some(
					(id) =>
						id === STARTUP_BASE_PRICE_MONTHLY_ID ||
						id === STARTUP_BASE_PRICE_ANNUAL_ID,
				)
			) {
				currentPlan = "startup";
			} else if (
				priceIds.some(
					(id) => id === HOBBY_PRICE_MONTHLY_ID || id === HOBBY_PRICE_ANNUAL_ID,
				)
			) {
				currentPlan = "hobby";
			} else if (priceIds.some((id) => LEGACY_PRICE_IDS.includes(id))) {
				currentPlan = "legacy";
			}
			const firstPrice = activeSub.items.data[0]?.price as
				| Stripe.Price
				| undefined;
			isAnnualCurrent = firstPrice?.recurring?.interval === "year";
			const totalCents = activeSub.items.data.reduce((sum, item) => {
				const price = item.price as Stripe.Price;
				const amount = price.unit_amount ?? 0;
				const qty = item.quantity ?? 1;
				return sum + amount * qty;
			}, 0);
			currentPriceAmount = totalCents / 100;
		}

		return {
			products: filteredProducts,
			subscriptions: subscriptions.data,
			hobbyProductId: HOBBY_PRODUCT_ID || undefined,
			startupProductId: STARTUP_PRODUCT_ID || undefined,
			currentPlan: currentPlan as "legacy" | "hobby" | "startup" | null,
			isAnnualCurrent,
			currentPriceAmount,
		};
	}),
	createCheckoutSession: adminProcedure
		.input(
			z
				.object({
					tier: z.enum(["legacy", "hobby", "startup"]),
					productId: z.string(),
					serverQuantity: z.number().min(1),
					isAnnual: z.boolean(),
				})
				.refine((data) => data.tier !== "startup" || data.serverQuantity >= 3, {
					message: "Startup plan requires at least 3 servers",
					path: ["serverQuantity"],
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
				apiVersion: "2024-09-30.acacia",
			});

			const items = getStripeItems(
				input.tier as BillingTier,
				input.serverQuantity,
				input.isAnnual,
			);
			// Always operate on the organization owner's Stripe customer
			const owner = await findUserById(ctx.user.ownerId);

			let stripeCustomerId = owner.stripeCustomerId;

			if (stripeCustomerId) {
				const customer = await stripe.customers.retrieve(stripeCustomerId);

				if (customer.deleted) {
					await updateUser(owner.id, {
						stripeCustomerId: null,
					});
					stripeCustomerId = null;
				}
			}

			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				line_items: items,
				...(stripeCustomerId
					? { customer: stripeCustomerId }
					: { customer_email: owner.email }),
				metadata: {
					adminId: owner.id,
				},
				allow_promotion_codes: true,
				success_url: `${WEBSITE_URL}/dashboard/settings/servers?success=true`,
				cancel_url: `${WEBSITE_URL}/dashboard/settings/billing`,
			});

			return { sessionId: session.id };
		}),
	createCustomerPortalSession: adminProcedure.mutation(async ({ ctx }) => {
		// Use the organization's owner account for billing portal
		const owner = await findUserById(ctx.user.ownerId);

		if (!owner.stripeCustomerId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Stripe Customer ID not found",
			});
		}
		const stripeCustomerId = owner.stripeCustomerId;

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
			apiVersion: "2024-09-30.acacia",
		});

		try {
			const session = await stripe.billingPortal.sessions.create({
				customer: stripeCustomerId,
				return_url: `${WEBSITE_URL}/dashboard/settings/billing`,
			});

			return { url: session.url };
		} catch (_) {
			return {
				url: "",
			};
		}
	}),

	upgradeSubscription: adminProcedure
		.input(
			z
				.object({
					tier: z.enum(["hobby", "startup"]),
					serverQuantity: z.number().min(1),
					isAnnual: z.boolean(),
				})
				.refine((data) => data.tier !== "startup" || data.serverQuantity >= 3, {
					message: "Startup plan requires at least 3 servers",
					path: ["serverQuantity"],
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
				apiVersion: "2024-09-30.acacia",
			});
			const owner = await findUserById(ctx.user.ownerId);

			if (!owner.stripeSubscriptionId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active subscription found",
				});
			}

			const subscription = await stripe.subscriptions.retrieve(
				owner.stripeSubscriptionId,
				{ expand: ["items.data.price"] },
			);

			if (subscription.status !== "active") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Subscription is not active",
				});
			}

			const newItems = getStripeItems(
				input.tier as BillingTier,
				input.serverQuantity,
				input.isAnnual,
			);
			const currentItems = subscription.items.data;

			const updateItems: Stripe.SubscriptionUpdateParams["items"] =
				currentItems.map((item, i) => {
					if (i < newItems.length) {
						return {
							id: item.id,
							price: newItems[i]!.price,
							quantity: newItems[i]!.quantity,
						};
					}
					return { id: item.id, deleted: true };
				});

			for (let i = currentItems.length; i < newItems.length; i++) {
				updateItems.push({
					price: newItems[i]!.price,
					quantity: newItems[i]!.quantity,
				});
			}

			await stripe.subscriptions.update(owner.stripeSubscriptionId, {
				items: updateItems,
				proration_behavior: "create_prorations",
			});

			return { ok: true };
		}),

	canCreateMoreServers: adminProcedure.query(async ({ ctx }) => {
		const user = await findUserById(ctx.user.ownerId);
		const servers = await findServersByUserId(user.id);

		if (!IS_CLOUD) {
			return true;
		}

		return servers.length < user.serversQuantity;
	}),

	getInvoices: adminProcedure.query(async ({ ctx }) => {
		const user = await findUserById(ctx.user.ownerId);
		const stripeCustomerId = user.stripeCustomerId;

		if (!stripeCustomerId) {
			return [];
		}

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
			apiVersion: "2024-09-30.acacia",
		});

		try {
			const invoices = await stripe.invoices.list({
				customer: stripeCustomerId,
				limit: 100,
			});

			return invoices.data.map((invoice) => ({
				id: invoice.id,
				number: invoice.number,
				status: invoice.status,
				amountDue: invoice.amount_due,
				amountPaid: invoice.amount_paid,
				currency: invoice.currency,
				created: invoice.created,
				dueDate: invoice.due_date,
				hostedInvoiceUrl: invoice.hosted_invoice_url,
				invoicePdf: invoice.invoice_pdf,
			}));
		} catch (_) {
			return [];
		}
	}),
});
