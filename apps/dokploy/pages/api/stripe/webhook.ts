import { db } from "@/server/db";
import { admins, github } from "@/server/db/schema";
import { eq } from "drizzle-orm";

import { buffer } from "node:stream/consumers";
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
	apiVersion: "2024-09-30.acacia",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export const config = {
	api: {
		bodyParser: false, // Deshabilitar el body parser de Next.js
	},
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const buf = await buffer(req); // Leer el raw body como un Buffer
	const sig = req.headers["stripe-signature"] as string;

	let event: Stripe.Event;

	try {
		// Verificar el evento usando el raw body (buf)
		event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
		const newSubscription = event.data.object as Stripe.Subscription;
		console.log(event.type);
		switch (event.type) {
			case "customer.subscription.created":
				await db
					.update(admins)
					.set({
						stripeSubscriptionId: newSubscription.id,
						stripeSubscriptionStatus: newSubscription.status,
					})
					.where(
						eq(
							admins.stripeCustomerId,
							typeof newSubscription.customer === "string"
								? newSubscription.customer
								: "",
						),
					)
					.returning();

				break;

			case "customer.subscription.deleted":
				await db
					.update(admins)
					.set({
						stripeSubscriptionStatus: "canceled",
					})
					.where(
						eq(
							admins.stripeCustomerId,
							typeof newSubscription.customer === "string"
								? newSubscription.customer
								: "",
						),
					);
				break;
			case "customer.subscription.updated":
				console.log(newSubscription.status);
				// Suscripción actualizada (upgrade, downgrade, cambios)
				await db
					.update(admins)
					.set({
						stripeSubscriptionStatus: newSubscription.status,
					})
					.where(
						eq(
							admins.stripeCustomerId,
							typeof newSubscription.customer === "string"
								? newSubscription.customer
								: "",
						),
					);
				break;
			case "invoice.payment_succeeded":
				console.log(newSubscription.customer);
				await db
					.update(admins)
					.set({
						stripeSubscriptionStatus: "active",
					})
					.where(
						eq(
							admins.stripeCustomerId,
							typeof newSubscription.customer === "string"
								? newSubscription.customer
								: "",
						),
					);
				break;
			case "invoice.payment_failed":
				// Pago fallido
				await db
					.update(admins)
					.set({
						stripeSubscriptionStatus: "payment_failed",
					})
					.where(
						eq(
							admins.stripeCustomerId,
							typeof newSubscription.customer === "string"
								? newSubscription.customer
								: "",
						),
					);
				break;

			default:
				console.log(`Unhandled event type: ${event.type}`);
		}

		res.status(200).json({ received: true });
	} catch (err) {
		console.error("Webhook signature verification failed.", err.message);
		return res.status(400).send("Webhook Error: ");
	}
}
