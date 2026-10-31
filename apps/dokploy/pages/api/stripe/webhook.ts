import { buffer } from "node:stream/consumers";
import type { Server } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { asc, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { organization, server, user } from "@/server/db/schema";
import {
	findSoleActiveSubscription,
	isActiveSubscription,
	isCurrentSubscription,
} from "@/server/utils/stripe";
import {
	sendInvoiceEmail,
	sendPaymentFailedEmail,
} from "@/server/utils/stripe-notifications";
import { sendTrialExpiringEmail } from "@/server/utils/trial-notifications";

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const STARTUP_BASE_PRICE_IDS = [
	process.env.STARTUP_BASE_PRICE_MONTHLY_ID,
	process.env.STARTUP_BASE_PRICE_ANNUAL_ID,
].filter(Boolean) as string[];

const STARTUP_SERVERS_INCLUDED = 3;

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LockedUser = typeof user.$inferSelect;

/** Anything that can run the queries used by the billing helpers. */
type BillingExecutor = Pick<typeof db, "update" | "select" | "query">;

function getSubscriptionServersQuantity(
	items: Stripe.SubscriptionItem[],
): number {
	return items.reduce((sum, item) => {
		const priceId = (item.price as Stripe.Price).id;
		if (STARTUP_BASE_PRICE_IDS.includes(priceId)) {
			return sum + STARTUP_SERVERS_INCLUDED;
		}
		return sum + (item.quantity ?? 0);
	}, 0);
}

export const config = {
	api: {
		bodyParser: false,
	},
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (!endpointSecret) {
		return res.status(400).send("Webhook Error: Missing Stripe Secret Key");
	}
	const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
		apiVersion: "2024-09-30.acacia",
		maxNetworkRetries: 3,
	});

	const buf = await buffer(req);
	const sig = req.headers["stripe-signature"] as string;

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
	} catch (err) {
		console.error(
			"Webhook signature verification failed.",
			err instanceof Error ? err.message : err,
		);
		return res.status(400).send("Webhook Error: ");
	}

	const webhooksAllowed = [
		"customer.subscription.created",
		"customer.subscription.deleted",
		"customer.subscription.updated",
		"invoice.payment_succeeded",
		"invoice.payment_failed",
		"customer.deleted",
		"checkout.session.completed",
		"customer.subscription.trial_will_end",
	];

	if (!webhooksAllowed.includes(event.type)) {
		return res.status(400).send("Webhook Error: Invalid Event Type");
	}

	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;
			const adminId = session?.metadata?.adminId as string | undefined;
			const subscriptionId =
				typeof session.subscription === "string"
					? session.subscription
					: session.subscription?.id;
			const customerId =
				typeof session.customer === "string"
					? session.customer
					: session.customer?.id;

			if (!adminId || !subscriptionId) {
				break;
			}

			const subscription = await stripe.subscriptions.retrieve(subscriptionId);
			const serversQuantity = getSubscriptionServersQuantity(
				subscription?.items?.data ?? [],
			);

			await withBillingLock(adminId, async (tx, lockedUser) => {
				if (lockedUser.isEnterpriseCloud) {
					return;
				}

				await tx
					.update(user)
					.set({
						stripeCustomerId: customerId ?? (subscription.customer as string),
						stripeSubscriptionId: subscription.id,
						serversQuantity,
					})
					.where(eq(user.id, adminId));

				await updateServersBasedOnQuantity(adminId, serversQuantity, tx);
			});
			break;
		}
		case "customer.subscription.trial_will_end": {
			const trialingSubscription = event.data.object as Stripe.Subscription;

			await sendTrialExpiringEmail(stripe, trialingSubscription, event.created);
			break;
		}
		case "customer.subscription.created": {
			const newSubscription = event.data.object as Stripe.Subscription;
			const customerId = newSubscription.customer as string;
			const admin = await findUserByStripeCustomerId(customerId);

			if (!admin || admin.isEnterpriseCloud) {
				break;
			}

			// A customer can have several subscriptions; only the current one may
			// replace the stored id.
			if (
				admin.stripeSubscriptionId &&
				!isCurrentSubscription(admin.stripeSubscriptionId, newSubscription.id)
			) {
				break;
			}

			// Recovering a cleared id must not adopt a delayed event of a canceled
			// subscription. Only the sole live subscription of the customer counts.
			const canAdopt =
				!admin.stripeSubscriptionId &&
				(await isSoleLiveSubscription(stripe, customerId, newSubscription.id));

			if (!admin.stripeSubscriptionId && !canAdopt) {
				break;
			}

			await withBillingLock(admin.id, async (tx, lockedUser) => {
				if (lockedUser.isEnterpriseCloud) {
					return;
				}
				if (
					lockedUser.stripeSubscriptionId &&
					lockedUser.stripeSubscriptionId !== newSubscription.id
				) {
					return;
				}
				if (!lockedUser.stripeSubscriptionId && !canAdopt) {
					return;
				}

				await tx
					.update(user)
					.set({
						stripeSubscriptionId: newSubscription.id,
						stripeCustomerId: customerId,
					})
					.where(eq(user.id, admin.id));
			});

			break;
		}

		case "customer.subscription.deleted": {
			const deletedSubscription = event.data.object as Stripe.Subscription;

			const admin = await findUserByStripeCustomerId(
				deletedSubscription.customer as string,
			);

			// The account may already be gone when the deletion flow cancelled
			// the subscription; nothing left to disable.
			if (!admin || admin.isEnterpriseCloud) {
				break;
			}

			await withBillingLock(admin.id, async (tx, lockedUser) => {
				if (lockedUser.isEnterpriseCloud) {
					return;
				}

				// Deleting an old, replaced subscription must not clear the plan the
				// owner is currently paying for.
				if (
					!isCurrentSubscription(
						lockedUser.stripeSubscriptionId,
						deletedSubscription.id,
					)
				) {
					return;
				}

				await tx
					.update(user)
					.set({
						stripeSubscriptionId: null,
						serversQuantity: 0,
					})
					.where(eq(user.id, admin.id));

				await disableServers(tx, admin.id);
			});
			break;
		}
		case "customer.subscription.updated": {
			const eventSubscription = event.data.object as Stripe.Subscription;
			const customerId = eventSubscription.customer as string;

			const admin = await findUserByStripeCustomerId(customerId);

			if (!admin) {
				return res.status(400).send("Webhook Error: Admin not found");
			}

			if (admin.isEnterpriseCloud) {
				break;
			}

			// The event payload can be older than Stripe's state, so never trust
			// its status or quantity.
			const subscription = await stripe.subscriptions.retrieve(
				eventSubscription.id,
			);

			// Recover accounts whose stored id was cleared by an older event, but
			// only while the event belongs to the sole live subscription.
			const canAdopt =
				!admin.stripeSubscriptionId &&
				(await isSoleLiveSubscription(stripe, customerId, subscription.id));

			await withBillingLock(admin.id, async (tx, lockedUser) => {
				if (lockedUser.isEnterpriseCloud) {
					return;
				}

				const isCurrent = isCurrentSubscription(
					lockedUser.stripeSubscriptionId,
					subscription.id,
				);
				const isRecovering = !lockedUser.stripeSubscriptionId && canAdopt;

				if (!isCurrent && !isRecovering) {
					return;
				}

				if (isActiveSubscription(subscription)) {
					const serversQuantity = getSubscriptionServersQuantity(
						subscription.items?.data ?? [],
					);
					await tx
						.update(user)
						.set({
							serversQuantity,
							...(isRecovering
								? { stripeSubscriptionId: subscription.id }
								: {}),
						})
						.where(eq(user.id, admin.id));

					await updateServersBasedOnQuantity(admin.id, serversQuantity, tx);
				} else {
					await tx
						.update(user)
						.set({ serversQuantity: 0 })
						.where(eq(user.id, admin.id));

					await disableServers(tx, admin.id);
				}
			});

			break;
		}
		case "invoice.payment_succeeded": {
			const newInvoice = event.data.object as Stripe.Invoice;

			const subscriptionId = getInvoiceSubscriptionId(newInvoice);
			if (!subscriptionId) {
				break;
			}

			const subscription = await stripe.subscriptions.retrieve(subscriptionId);

			if (subscription.status !== "active") {
				console.log(
					`Skipping invoice.payment_succeeded for subscription ${subscription.id} with status ${subscription.status}`,
				);
				break;
			}

			const customerId = subscription.customer as string;
			const admin = await findUserByStripeCustomerId(customerId);

			if (!admin) {
				return res.status(400).send("Webhook Error: Admin not found");
			}

			if (admin.isEnterpriseCloud) {
				break;
			}

			const canAdopt =
				!admin.stripeSubscriptionId &&
				(await isSoleLiveSubscription(stripe, customerId, subscription.id));

			const applied = await withBillingLock(
				admin.id,
				async (tx, lockedUser) => {
					if (lockedUser.isEnterpriseCloud) {
						return false;
					}

					const isCurrent = isCurrentSubscription(
						lockedUser.stripeSubscriptionId,
						subscription.id,
					);
					const isRecovering = !lockedUser.stripeSubscriptionId && canAdopt;

					if (!isCurrent && !isRecovering) {
						return false;
					}

					const serversQuantity = getSubscriptionServersQuantity(
						subscription?.items?.data ?? [],
					);
					await tx
						.update(user)
						.set({
							serversQuantity,
							...(isRecovering
								? { stripeSubscriptionId: subscription.id }
								: {}),
						})
						.where(eq(user.id, admin.id));

					await updateServersBasedOnQuantity(admin.id, serversQuantity, tx);

					return true;
				},
			);

			// Never send mail while the row lock is held.
			if (applied && admin.sendInvoiceNotifications) {
				await sendInvoiceEmail(newInvoice, admin);
			}

			break;
		}
		case "invoice.payment_failed": {
			const newInvoice = event.data.object as Stripe.Invoice;

			const subscriptionId = getInvoiceSubscriptionId(newInvoice);
			if (!subscriptionId) {
				break;
			}

			const subscription = await stripe.subscriptions.retrieve(subscriptionId);
			if (subscription.status !== "active") {
				const admin = await findUserByStripeCustomerId(
					newInvoice.customer as string,
				);

				if (!admin) {
					return res.status(400).send("Webhook Error: Admin not found");
				}

				if (admin.isEnterpriseCloud) {
					break;
				}

				const applied = await withBillingLock(
					admin.id,
					async (tx, lockedUser) => {
						if (lockedUser.isEnterpriseCloud) {
							return false;
						}

						// A failed payment on a replaced subscription must not disable
						// the servers the owner is currently paying for.
						if (
							!isCurrentSubscription(
								lockedUser.stripeSubscriptionId,
								subscription.id,
							)
						) {
							return false;
						}

						await tx
							.update(user)
							.set({
								serversQuantity: 0,
							})
							.where(eq(user.id, admin.id));

						await disableServers(tx, admin.id);

						return true;
					},
				);

				// Never send mail while the row lock is held.
				if (applied && admin.sendInvoiceNotifications) {
					await sendPaymentFailedEmail(newInvoice, admin);
				}
			}

			break;
		}

		case "customer.deleted": {
			const customer = event.data.object as Stripe.Customer;

			const admin = await findUserByStripeCustomerId(customer.id);
			if (!admin || admin.isEnterpriseCloud) {
				break;
			}

			await withBillingLock(admin.id, async (tx, lockedUser) => {
				if (lockedUser.isEnterpriseCloud) {
					return;
				}
				if (lockedUser.stripeCustomerId !== customer.id) {
					return;
				}

				await disableServers(tx, admin.id);
				await tx
					.update(user)
					.set({
						stripeCustomerId: null,
						stripeSubscriptionId: null,
						serversQuantity: 0,
					})
					.where(eq(user.id, admin.id));
			});

			break;
		}
		default:
			console.log(`Unhandled event type: ${event.type}`);
	}

	return res.status(200).json({ received: true });
}

/**
 * Serializes every account mutation caused by a Stripe webhook for one owner.
 * A delayed event of a replaced subscription can no longer pass the
 * subscription check and then overwrite a newer subscription's state.
 */
const withBillingLock = async <T>(
	userId: string,
	run: (tx: BillingTransaction, lockedUser: LockedUser) => Promise<T>,
): Promise<T | null> =>
	db.transaction(async (tx) => {
		const [lockedUser] = await tx
			.select()
			.from(user)
			.where(eq(user.id, userId))
			.for("update");

		if (!lockedUser) {
			return null;
		}

		return run(tx, lockedUser);
	});

const listSubscriptions = async (stripe: Stripe, customerId: string) => {
	const subscriptions = await stripe.subscriptions.list({
		customer: customerId,
		status: "all",
		limit: 100,
	});
	return subscriptions.data;
};

/**
 * A cleared stored id may only be recovered when Stripe currently reports
 * exactly one live subscription and it is the one the event refers to.
 */
const isSoleLiveSubscription = async (
	stripe: Stripe,
	customerId: string,
	subscriptionId: string,
) => {
	const subscriptions = await listSubscriptions(stripe, customerId);
	const soleActiveSubscription = findSoleActiveSubscription(subscriptions);
	return soleActiveSubscription?.id === subscriptionId;
};

const disableServers = async (tx: BillingExecutor, userId: string) => {
	const organizations = await tx.query.organization.findMany({
		where: eq(organization.ownerId, userId),
	});

	for (const org of organizations) {
		await tx
			.update(server)
			.set({
				serverStatus: "inactive",
			})
			.where(eq(server.organizationId, org.id));
	}
};

const findUserByStripeCustomerId = async (stripeCustomerId: string) => {
	const userResult = await db.query.user.findFirst({
		where: eq(user.stripeCustomerId, stripeCustomerId),
	});
	return userResult;
};

const getInvoiceSubscriptionId = (invoice: Stripe.Invoice): string | null => {
	const subscription = invoice.subscription;
	if (typeof subscription === "string") return subscription;
	return subscription?.id ?? null;
};

const activateServer = async (serverId: string, tx: BillingExecutor) => {
	await tx
		.update(server)
		.set({ serverStatus: "active" })
		.where(eq(server.serverId, serverId));
};

const deactivateServer = async (serverId: string, tx: BillingExecutor) => {
	await tx
		.update(server)
		.set({ serverStatus: "inactive" })
		.where(eq(server.serverId, serverId));
};

export const findServersByUserIdSorted = async (
	userId: string,
	tx: BillingExecutor = db,
) => {
	const organizations = await tx.query.organization.findMany({
		where: eq(organization.ownerId, userId),
	});

	const servers: Server[] = [];
	for (const org of organizations) {
		const serversByOrg = await tx.query.server.findMany({
			where: eq(server.organizationId, org.id),
			orderBy: asc(server.createdAt),
		});
		servers.push(...serversByOrg);
	}

	return servers;
};
export const updateServersBasedOnQuantity = async (
	userId: string,
	newServersQuantity: number,
	tx: BillingExecutor = db,
) => {
	const servers = await findServersByUserIdSorted(userId, tx);

	if (servers.length > newServersQuantity) {
		for (const [index, server] of servers.entries()) {
			if (index < newServersQuantity) {
				await activateServer(server.serverId, tx);
			} else {
				await deactivateServer(server.serverId, tx);
			}
		}
	} else {
		for (const server of servers) {
			await activateServer(server.serverId, tx);
		}
	}
};
