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
	getStripeItems,
	PRODUCT_ANNUAL_ID,
	PRODUCT_MONTHLY_ID,
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

		const filteredProducts = products.data.filter((product) => {
			return (
				product.id === PRODUCT_MONTHLY_ID || product.id === PRODUCT_ANNUAL_ID
			);
		});

		if (!stripeCustomerId) {
			return {
				products: filteredProducts,
				subscriptions: [],
			};
		}

		const subscriptions = await stripe.subscriptions.list({
			customer: stripeCustomerId,
			status: "active",
			expand: ["data.items.data.price"],
		});

		return {
			products: filteredProducts,
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
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
				apiVersion: "2024-09-30.acacia",
			});

			const items = getStripeItems(input.serverQuantity, input.isAnnual);
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
