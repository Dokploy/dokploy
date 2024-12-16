import { WEBSITE_URL, getStripeItems } from "@/server/utils/stripe";
import {
	IS_CLOUD,
	findAdminById,
	findServersByAdminId,
	updateAdmin,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import Stripe from "stripe";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const stripeRouter = createTRPCRouter({
	getProducts: adminProcedure.query(async ({ ctx }) => {
		const admin = await findAdminById(ctx.user.adminId);
		const stripeCustomerId = admin.stripeCustomerId;

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
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
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
				apiVersion: "2024-09-30.acacia",
			});

			const items = getStripeItems(input.serverQuantity, input.isAnnual);
			const admin = await findAdminById(ctx.user.adminId);

			let stripeCustomerId = admin.stripeCustomerId;

			if (stripeCustomerId) {
				const customer = await stripe.customers.retrieve(stripeCustomerId);

				if (customer.deleted) {
					await updateAdmin(admin.authId, {
						stripeCustomerId: null,
					});
					stripeCustomerId = null;
				}
			}

			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				line_items: items,
				...(stripeCustomerId && {
					customer: stripeCustomerId,
				}),
				metadata: {
					adminId: admin.adminId,
				},
				allow_promotion_codes: true,
				success_url: `${WEBSITE_URL}/dashboard/settings/servers?success=true`,
				cancel_url: `${WEBSITE_URL}/dashboard/settings/billing`,
			});

			return { sessionId: session.id };
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

			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
				apiVersion: "2024-09-30.acacia",
			});

			try {
				const session = await stripe.billingPortal.sessions.create({
					customer: stripeCustomerId,
					return_url: `${WEBSITE_URL}/dashboard/settings/billing`,
				});

				return { url: session.url };
			} catch (error) {
				return {
					url: "",
				};
			}
		},
	),

	canCreateMoreServers: adminProcedure.query(async ({ ctx }) => {
		const admin = await findAdminById(ctx.user.adminId);
		const servers = await findServersByAdminId(admin.adminId);

		if (!IS_CLOUD) {
			return true;
		}

		return servers.length < admin.serversQuantity;
	}),
});
