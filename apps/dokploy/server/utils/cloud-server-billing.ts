import { findUserById, updateUser } from "@dokploy/server";
import {
	type CloudServer,
	claimCloudServerForProvisioning,
	claimCloudServerForUpgrade,
	deletePendingCloudServer,
	findCloudServerById,
	findCloudServerBySubscriptionId,
	findSuspendedCloudServersBefore,
	powerOnCloudServerVm,
	provisionCloudServer,
	releaseProviderResources,
	resizeCloudServerVm,
	resumeCloudServer,
	suspendCloudServer,
	terminateCloudServer,
	updateCloudServer,
} from "@dokploy/server/services/cloud-server";
import {
	DOKPLOY_PLANS,
	type DokployPlan,
	deleteDigitalOceanDropletsByTag,
	getCloudServerTag,
	getDigitalOceanRegions,
} from "@dokploy/server/utils/digitalocean";
import { TRPCError } from "@trpc/server";
import { scheduleJob } from "node-schedule";
import Stripe from "stripe";
import {
	CLOUD_SERVER_METADATA_TYPE,
	getStripeClient,
	isCloudServerSubscription,
} from "@/server/utils/billing";
import { WEBSITE_URL } from "@/server/utils/stripe";

const SUSPENSION_GRACE_DAYS = 7;
const CHECKOUT_EXPIRATION_MINUTES = 30;

const getCloudServerId = (metadata?: Stripe.Metadata | null) =>
	metadata?.type === CLOUD_SERVER_METADATA_TYPE
		? (metadata.cloudServerId ?? null)
		: null;

const getOrCreateStripeCustomer = async (ownerId: string, stripe: Stripe) => {
	const owner = await findUserById(ownerId);

	if (owner.stripeCustomerId) {
		const customer = await stripe.customers.retrieve(owner.stripeCustomerId);
		if (!customer.deleted) return owner.stripeCustomerId;
	}

	const customer = await stripe.customers.create({
		email: owner.email,
		metadata: { adminId: owner.id },
	});
	await updateUser(owner.id, { stripeCustomerId: customer.id });
	return customer.id;
};

const PLAN_PRODUCT_ENV: Record<string, string> = {
	hobby: "CLOUD_SERVER_HOBBY_PRODUCT_ID",
	starter: "CLOUD_SERVER_STARTER_PRODUCT_ID",
	pro: "CLOUD_SERVER_PRO_PRODUCT_ID",
	business: "CLOUD_SERVER_BUSINESS_PRODUCT_ID",
};

const getPlanProductId = (plan: DokployPlan) => {
	const envName = PLAN_PRODUCT_ENV[plan.id];
	const productId = envName ? process.env[envName] : undefined;
	if (!productId) throw new Error(`${envName ?? plan.id} is not set`);
	return productId;
};

export const createCloudServerCheckout = async (params: {
	ownerId: string;
	cloudServerId: string;
	plan: DokployPlan;
	regionName: string;
}) => {
	const stripe = getStripeClient();
	const customer = await getOrCreateStripeCustomer(params.ownerId, stripe);
	const { plan } = params;
	const metadata = {
		type: CLOUD_SERVER_METADATA_TYPE,
		cloudServerId: params.cloudServerId,
	};

	return stripe.checkout.sessions.create({
		mode: "subscription",
		customer,
		customer_update: { name: "auto", address: "auto" },
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: "usd",
					unit_amount: plan.priceCents,
					recurring: { interval: "month" },
					product: getPlanProductId(plan),
				},
			},
		],
		metadata,
		subscription_data: { metadata, description: params.regionName },
		billing_address_collection: "required",
		tax_id_collection: { enabled: true },
		expires_at:
			Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRATION_MINUTES * 60,
		success_url: `${WEBSITE_URL}/dashboard/settings/cloud-servers?checkout=success`,
		cancel_url: `${WEBSITE_URL}/dashboard/settings/cloud-servers?checkout=cancelled`,
	});
};

export const expireCloudServerCheckout = async (sessionId: string) => {
	await getStripeClient()
		.checkout.sessions.expire(sessionId)
		.catch((err) =>
			console.error("[cloud-server] failed to expire checkout:", err),
		);
};

export const cancelCloudServerSubscription = async (
	subscriptionId: string,
	stripe: Stripe = getStripeClient(),
) => {
	const subscription = await stripe.subscriptions
		.retrieve(subscriptionId)
		.catch((err: unknown) => {
			if (
				err instanceof Stripe.errors.StripeError &&
				err.code === "resource_missing"
			) {
				return null;
			}
			throw err;
		});
	if (
		!subscription ||
		subscription.status === "canceled" ||
		subscription.status === "incomplete_expired"
	) {
		return;
	}
	await stripe.subscriptions.cancel(subscriptionId, {
		invoice_now: false,
		prorate: false,
	});
};

const refundInvoice = async (
	stripe: Stripe,
	invoice: Stripe.Invoice | string | null,
) => {
	if (!invoice || typeof invoice === "string") return;
	if (!invoice.paid || invoice.amount_paid === 0) return;

	if (invoice.payment_intent) {
		await stripe.refunds.create({
			payment_intent: invoice.payment_intent as string,
		});
	} else if (invoice.charge) {
		await stripe.refunds.create({ charge: invoice.charge as string });
	}
};

const refundAndCancelSubscription = async (
	stripe: Stripe,
	subscriptionId: string,
) => {
	const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
		expand: ["latest_invoice"],
	});
	await cancelCloudServerSubscription(subscriptionId, stripe);
	await refundInvoice(stripe, subscription.latest_invoice);
};

const handleProvisioningFailure = async (
	stripe: Stripe,
	record: CloudServer,
	err: unknown,
) => {
	const reason = err instanceof Error ? err.message : String(err);
	console.error("[cloud-server] provisioning failed:", reason);

	// Mark as error before cancelling so the subscription.deleted webhook leaves the record for the user to see.
	await updateCloudServer(record.cloudServerId, {
		status: "error",
		errorMessage: reason,
	});

	const latest = await findCloudServerById(record.cloudServerId);
	await releaseProviderResources(latest).catch((cleanupErr) =>
		console.error("[cloud-server] cleanup failed:", cleanupErr),
	);

	if (!latest.stripeSubscriptionId) return;
	try {
		await refundAndCancelSubscription(stripe, latest.stripeSubscriptionId);
		await updateCloudServer(record.cloudServerId, {
			errorMessage: `${reason}. The payment has been refunded.`,
		});
	} catch (refundErr) {
		console.error("[cloud-server] refund failed:", refundErr);
	}
};

const handleCheckoutCompleted = async (
	stripe: Stripe,
	cloudServerId: string,
	subscriptionId: string,
) => {
	const record = await claimCloudServerForProvisioning(
		cloudServerId,
		subscriptionId,
	);

	if (!record) {
		const existing = await findCloudServerById(cloudServerId).catch(() => null);
		if (existing?.stripeSubscriptionId === subscriptionId) return;
		// Paid after the order was removed, there is nothing to provision.
		await refundAndCancelSubscription(stripe, subscriptionId);
		return;
	}

	const plan = DOKPLOY_PLANS.find((p) => p.id === record.plan);
	if (!plan || !record.hostname) {
		await handleProvisioningFailure(
			stripe,
			record,
			new Error(`Invalid order for plan "${record.plan}"`),
		);
		return;
	}

	// Provisioning takes minutes, far longer than Stripe waits for a webhook response.
	void provisionCloudServer({
		cloudServerId: record.cloudServerId,
		organizationId: record.organizationId,
		doSize: plan.doSize,
		swapGb: Math.min(plan.memoryGb, 4),
		zone: record.zone,
		hostname: record.hostname,
	}).catch((err) => handleProvisioningFailure(stripe, record, err));
};

const handleSubscriptionUpdated = async (subscription: Stripe.Subscription) => {
	const record = await findCloudServerBySubscriptionId(subscription.id);
	if (!record) return;

	if (subscription.status === "past_due" || subscription.status === "unpaid") {
		await suspendCloudServer(record);
	} else if (subscription.status === "active") {
		await resumeCloudServer(record);
	}
};

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
	const record = await findCloudServerBySubscriptionId(subscription.id);

	if (!record) {
		// The record is gone when the account was deleted, but the droplet would keep running.
		const cloudServerId = getCloudServerId(subscription.metadata);
		if (cloudServerId) {
			await deleteDigitalOceanDropletsByTag(getCloudServerTag(cloudServerId));
		}
		return;
	}

	if (record.status === "error" || record.status === "terminating") return;

	await updateCloudServer(record.cloudServerId, { status: "terminating" });
	await terminateCloudServer(record.cloudServerId);
};

const PRORATION_DATE_MAX_AGE_SECONDS = 15 * 60;

const getPlan = (planId: string) => {
	const plan = DOKPLOY_PLANS.find((p) => p.id === planId);
	if (!plan)
		throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });
	return plan;
};

export const getUpgradeOptions = async (record: CloudServer) => {
	if (record.status !== "ready" || !record.stripeSubscriptionId) return [];
	const currentIndex = DOKPLOY_PLANS.findIndex((p) => p.id === record.plan);
	const region = (await getDigitalOceanRegions()).find(
		(r) => r.id === record.zone,
	);
	return DOKPLOY_PLANS.filter(
		(plan, index) => index > currentIndex && region?.plans.includes(plan.id),
	);
};

const assertUpgradeAllowed = async (record: CloudServer, planId: string) => {
	const target = getPlan(planId);
	const options = await getUpgradeOptions(record);
	if (!options.some((p) => p.id === target.id)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This upgrade is not available for this server",
		});
	}
	return { current: getPlan(record.plan), target };
};

const getSubscriptionItem = async (stripe: Stripe, subscriptionId: string) => {
	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const item = subscription.items.data[0];
	if (!item) throw new Error("Subscription has no items");

	return { subscription, item };
};

const getPriceDataForPlan = (
	item: Stripe.SubscriptionItem,
	current: DokployPlan,
	target: DokployPlan,
) => ({
	currency: item.price.currency,
	product: getPlanProductId(target),
	unit_amount:
		item.price.currency === "usd"
			? target.priceCents
			: // Customers who paid in a local currency keep the exchange rate Stripe locked in at checkout.
				Math.round(
					((item.price.unit_amount ?? current.priceCents) /
						current.priceCents) *
						target.priceCents,
				),
	recurring: { interval: "month" as const },
});

const getCurrentPriceData = (
	item: Stripe.SubscriptionItem,
	current: DokployPlan,
) => ({
	currency: item.price.currency,
	product: getPlanProductId(current),
	unit_amount: item.price.unit_amount ?? current.priceCents,
	recurring: { interval: "month" as const },
});

export const previewCloudServerUpgrade = async (
	record: CloudServer,
	planId: string,
) => {
	const { current, target } = await assertUpgradeAllowed(record, planId);
	const stripe = getStripeClient();
	const { subscription, item } = await getSubscriptionItem(
		stripe,
		record.stripeSubscriptionId!,
	);
	const priceData = getPriceDataForPlan(item, current, target);
	const prorationDate = Math.floor(Date.now() / 1000);

	const invoice = await stripe.invoices.retrieveUpcoming({
		customer: subscription.customer as string,
		subscription: subscription.id,
		subscription_items: [{ id: item.id, price_data: priceData }],
		subscription_proration_behavior: "always_invoice",
		subscription_proration_date: prorationDate,
	});
	const amountDue = invoice.lines.data
		.filter((line) => line.proration)
		.reduce((sum, line) => sum + line.amount, 0);

	return {
		amountDue: Math.max(0, amountDue),
		newMonthlyAmount: priceData.unit_amount,
		currency: priceData.currency,
		prorationDate,
	};
};

const runUpgrade = async (params: {
	stripe: Stripe;
	record: CloudServer;
	current: DokployPlan;
	target: DokployPlan;
	item: Stripe.SubscriptionItem;
	upgradeInvoice: Stripe.Invoice | string | null;
}) => {
	const { stripe, record, current, target, item, upgradeInvoice } = params;

	try {
		await resizeCloudServerVm(
			record,
			target.doSize,
			Math.min(target.memoryGb, 4),
		);
		await updateCloudServer(record.cloudServerId, {
			plan: target.id,
			status: "ready",
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		console.error("[cloud-server] upgrade failed:", reason);
		await powerOnCloudServerVm(record).catch((powerErr) =>
			console.error("[cloud-server] power on after failed upgrade:", powerErr),
		);

		let errorMessage = `Upgrade failed: ${reason}`;
		try {
			await stripe.subscriptions.update(record.stripeSubscriptionId!, {
				items: [
					{
						id: item.id,
						price_data: getCurrentPriceData(item, current),
					},
				],
				proration_behavior: "none",
			});
			await refundInvoice(stripe, upgradeInvoice);
			errorMessage += ". The charge has been refunded.";
		} catch (revertErr) {
			console.error(
				"[cloud-server] failed to revert upgrade billing:",
				revertErr,
			);
		}

		await updateCloudServer(record.cloudServerId, {
			status: "ready",
			errorMessage,
		});
	}
};

export const upgradeCloudServer = async (
	record: CloudServer,
	planId: string,
	prorationDate: number,
) => {
	const now = Math.floor(Date.now() / 1000);
	if (
		prorationDate > now ||
		now - prorationDate > PRORATION_DATE_MAX_AGE_SECONDS
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The price quote expired, please review the upgrade again",
		});
	}

	const { current, target } = await assertUpgradeAllowed(record, planId);
	const claimed = await claimCloudServerForUpgrade(record.cloudServerId);
	if (!claimed) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is not ready",
		});
	}

	const stripe = getStripeClient();
	let item: Stripe.SubscriptionItem;
	let upgradeInvoice: Stripe.Invoice | string | null;
	try {
		({ item } = await getSubscriptionItem(
			stripe,
			claimed.stripeSubscriptionId!,
		));
		const updated = await stripe.subscriptions.update(
			claimed.stripeSubscriptionId!,
			{
				items: [
					{
						id: item.id,
						price_data: getPriceDataForPlan(item, current, target),
					},
				],
				proration_behavior: "always_invoice",
				proration_date: prorationDate,
				payment_behavior: "error_if_incomplete",
				expand: ["latest_invoice"],
			},
		);
		upgradeInvoice = updated.latest_invoice;
	} catch (err) {
		await updateCloudServer(record.cloudServerId, { status: "ready" });
		if (err instanceof Stripe.errors.StripeCardError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
		}
		throw err;
	}

	// Resizing powers the VM off and on, which takes several minutes.
	void runUpgrade({
		stripe,
		record: claimed,
		current,
		target,
		item,
		upgradeInvoice,
	});
};

/** Returns true when the event belongs to a cloud server and was handled here. */
export const handleCloudServerEvent = async (
	stripe: Stripe,
	event: Stripe.Event,
): Promise<boolean> => {
	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object;
			const cloudServerId = getCloudServerId(session.metadata);
			if (!cloudServerId) return false;
			await handleCheckoutCompleted(
				stripe,
				cloudServerId,
				session.subscription as string,
			);
			return true;
		}
		case "checkout.session.expired": {
			const cloudServerId = getCloudServerId(event.data.object.metadata);
			if (!cloudServerId) return false;
			await deletePendingCloudServer(cloudServerId);
			return true;
		}
		case "customer.subscription.created":
		case "customer.subscription.trial_will_end":
			return isCloudServerSubscription(event.data.object);
		case "customer.subscription.updated": {
			if (!isCloudServerSubscription(event.data.object)) return false;
			await handleSubscriptionUpdated(event.data.object);
			return true;
		}
		case "customer.subscription.deleted": {
			if (!isCloudServerSubscription(event.data.object)) return false;
			await handleSubscriptionDeleted(event.data.object);
			return true;
		}
		case "invoice.payment_succeeded":
		case "invoice.payment_failed":
			// Suspension and resume follow the subscription status, invoices only need to stay away from the plan logic.
			return !!getCloudServerId(
				event.data.object.subscription_details?.metadata,
			);
		default:
			return false;
	}
};

export const initCloudServerCrons = () => {
	scheduleJob("cloud-server-suspension-cleanup", "0 * * * *", async () => {
		const cutoff = new Date(
			Date.now() - SUSPENSION_GRACE_DAYS * 24 * 60 * 60 * 1000,
		);
		const expired = await findSuspendedCloudServersBefore(cutoff);

		for (const record of expired) {
			try {
				await updateCloudServer(record.cloudServerId, {
					status: "terminating",
				});
				if (record.stripeSubscriptionId) {
					await cancelCloudServerSubscription(record.stripeSubscriptionId);
				}
				await terminateCloudServer(record.cloudServerId);
			} catch (err) {
				console.error(
					`[cloud-server] failed to remove suspended server ${record.cloudServerId}:`,
					err,
				);
			}
		}
	});
};
