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
	getBillingStatus,
	getCurrentPlan as getCurrentPlanForOrganization,
	getStripeClient,
	TRIAL_DURATION_DAYS,
	TRIAL_SERVER_LIMIT,
} from "@/server/utils/billing";
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
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "../trpc";

export const stripeRouter = createTRPCRouter({
	/** Returns the current billing plan for the user's organization. Used to gate features like chat (Startup only). */
	getCurrentPlan: protectedProcedure.query(async ({ ctx }) => {
		return getCurrentPlanForOrganization(ctx.session.activeOrganizationId);
	}),

	getBillingStatus: protectedProcedure.query(async ({ ctx }) => {
		return getBillingStatus(ctx.user.ownerId);
	}),

	startFreeTrial: adminProcedure.mutation(async ({ ctx }) => {
		if (!IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "This feature is only available in Dokploy Cloud",
			});
		}

		if (!HOBBY_PRICE_MONTHLY_ID) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Trials are not configured",
			});
		}

		const owner = await findUserById(ctx.user.ownerId);
		const billingStatus = await getBillingStatus(owner.id);

		if (billingStatus.hasActiveAccess) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "You already have an active plan or trial",
			});
		}

		if (billingStatus.hasUsedTrial) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "You have already used your free trial",
			});
		}

		const stripe = getStripeClient();

		let stripeCustomerId = owner.stripeCustomerId;
		if (stripeCustomerId) {
			const customer = await stripe.customers.retrieve(stripeCustomerId);
			if (customer.deleted) {
				stripeCustomerId = null;
			}
		}
		if (!stripeCustomerId) {
			const customer = await stripe.customers.create({ email: owner.email });
			stripeCustomerId = customer.id;
		}

		const subscription = await stripe.subscriptions.create({
			customer: stripeCustomerId,
			items: [{ price: HOBBY_PRICE_MONTHLY_ID, quantity: 1 }],
			trial_period_days: TRIAL_DURATION_DAYS,
			trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
			metadata: { source: "onboarding_trial", adminId: owner.id },
		});

		await updateUser(owner.id, {
			stripeCustomerId,
			stripeSubscriptionId: subscription.id,
			serversQuantity: TRIAL_SERVER_LIMIT,
		});

		return {
			trialEndsAt: subscription.trial_end
				? new Date(subscription.trial_end * 1000)
				: null,
		};
	}),

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
		if (subscriptions.data.length > 0) {
			const matchedSub = subscriptions.data.find((sub) =>
				sub.items.data.some(
					(item) =>
						(item.price as Stripe.Price).id === STARTUP_BASE_PRICE_MONTHLY_ID ||
						(item.price as Stripe.Price).id === STARTUP_BASE_PRICE_ANNUAL_ID,
				),
			);
			const hobbySub = subscriptions.data.find((sub) =>
				sub.items.data.some(
					(item) =>
						(item.price as Stripe.Price).id === HOBBY_PRICE_MONTHLY_ID ||
						(item.price as Stripe.Price).id === HOBBY_PRICE_ANNUAL_ID,
				),
			);
			const legacySub = subscriptions.data.find((sub) =>
				sub.items.data.some((item) =>
					LEGACY_PRICE_IDS.includes((item.price as Stripe.Price).id),
				),
			);

			const activeSub = matchedSub ?? hobbySub ?? legacySub;
			if (matchedSub) {
				currentPlan = "startup";
			} else if (hobbySub) {
				currentPlan = "hobby";
			} else if (legacySub) {
				currentPlan = "legacy";
			}

			const firstPrice = activeSub?.items.data[0]?.price as
				| Stripe.Price
				| undefined;
			isAnnualCurrent = firstPrice?.recurring?.interval === "year";

			const totalCents = (activeSub?.items.data ?? []).reduce((sum, item) => {
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
					? {
							customer: stripeCustomerId,
							customer_update: { name: "auto", address: "auto" },
						}
					: { customer_email: owner.email }),
				metadata: {
					adminId: owner.id,
				},
				billing_address_collection: "required",
				tax_id_collection: { enabled: true },
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

			if (
				subscription.status !== "active" &&
				subscription.status !== "trialing"
			) {
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

	canCreateMoreServers: withPermission("server", "create").query(
		async ({ ctx }) => {
			const user = await findUserById(ctx.user.ownerId);
			const servers = await findServersByUserId(user.id);

			if (!IS_CLOUD) {
				return true;
			}

			return servers.length < user.serversQuantity;
		},
	),

	updateInvoiceNotifications: adminProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			if (!IS_CLOUD) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This feature is only available in Dokploy Cloud",
				});
			}
			const owner = await findUserById(ctx.user.ownerId);
			await updateUser(owner.id, {
				sendInvoiceNotifications: input.enabled,
			});
			return { ok: true };
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
