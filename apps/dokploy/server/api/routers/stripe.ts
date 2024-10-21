import { admins } from "@/server/db/schema";
import { getStripeItems } from "@/server/utils/stripe";
import {
	IS_CLOUD,
	findAdminById,
	findServersByAdminId,
	updateAdmin,
} from "@dokploy/server";
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
			// await updateAdmin(ctx.user.a, {
			// 	stripeCustomerId: null,
			// 	stripeSubscriptionId: null,
			// 	serversQuantity: 0,
			// });
			const items = getStripeItems(input.serverQuantity, input.isAnnual);
			const admin = await findAdminById(ctx.user.adminId);
			const stripeCustomerId = admin.stripeCustomerId;

			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				line_items: items,
				...(stripeCustomerId && {
					customer: stripeCustomerId,
				}),
				metadata: {
					adminId: admin.adminId,
				},
				success_url: "http://localhost:3000/dashboard/settings/billing",
				cancel_url: "http://localhost:3000/dashboard/settings/billing",
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

			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
				apiVersion: "2024-09-30.acacia",
			});

			try {
				const session = await stripe.billingPortal.sessions.create({
					customer: stripeCustomerId,
					return_url: "http://localhost:3000/dashboard/settings/billing",
				});

				return { url: session.url };
			} catch (error) {
				return {
					url: "",
				};
			}
		},
	),
	success: adminProcedure.query(async ({ ctx }) => {
		const sessionId = ctx.req.query.sessionId as string;

		if (!sessionId) {
			throw new Error("No session_id provided");
		}

		// const session = await stripe.checkout.sessions.retrieve(sessionId);

		// if (session.payment_status === "paid") {
		// 	const admin = await findAdminById(ctx.user.adminId);

		// 	// if (admin.stripeSubscriptionId) {
		// 	// 	const subscription = await stripe.subscriptions.retrieve(
		// 	// 		admin.stripeSubscriptionId,
		// 	// 	);
		// 	// 	if (subscription.status === "active") {
		// 	// 		await stripe.subscriptions.update(admin.stripeSubscriptionId, {
		// 	// 			cancel_at_period_end: true,
		// 	// 		});
		// 	// 	}
		// 	// }
		// 	console.log("Payment successful!");

		// 	const stripeCustomerId = session.customer as string;
		// 	console.log("Stripe Customer ID:", stripeCustomerId);

		// 	const stripeSubscriptionId = session.subscription as string;
		// 	const suscription =
		// 		await stripe.subscriptions.retrieve(stripeSubscriptionId);
		// 	console.log("Stripe Subscription ID:", stripeSubscriptionId);

		// 	await db
		// 		?.update(admins)
		// 		.set({
		// 			stripeCustomerId,
		// 			stripeSubscriptionId,
		// 			serversQuantity: suscription?.items?.data?.[0]?.quantity ?? 0,
		// 		})
		// 		.where(eq(admins.adminId, ctx.user.adminId))
		// 		.returning();
		// } else {
		// 	console.log("Payment not completed or failed.");
		// }

		ctx.res.redirect("/dashboard/settings/billing");

		return true;
	}),
	canCreateMoreServers: adminProcedure.query(async ({ ctx }) => {
		const admin = await findAdminById(ctx.user.adminId);
		const servers = await findServersByAdminId(admin.adminId);

		if (!IS_CLOUD) {
			return true;
		}

		return servers.length < admin.serversQuantity;
	}),
});
