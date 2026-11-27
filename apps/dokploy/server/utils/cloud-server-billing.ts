import {
	findOrganizationById,
	findUserById,
	updateUser,
} from "@dokploy/server";
import {
	buildCloudServerHostname,
	type CloudServer,
	claimCloudServerForUpgrade,
	claimCloudServerPaymentReminder,
	createCloudServer,
	findCloudServerById,
	findCloudServerBySubscriptionId,
	findCloudServersProvisioningBefore,
	findReadyCloudServers,
	findSuspendedCloudServersBefore,
	powerOnCloudServerVm,
	provisionCloudServer,
	recordCloudServerBandwidth,
	recordCloudServersBandwidth,
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
	EXTRA_BANDWIDTH_CENTS_PER_GB,
	getCloudServerTag,
	getDigitalOceanRegions,
} from "@dokploy/server/utils/digitalocean";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { scheduleJob } from "node-schedule";
import Stripe from "stripe";
import {
	CLOUD_SERVER_METADATA_TYPE,
	getStripeClient,
	isCloudServerSubscription,
} from "@/server/utils/billing";
import {
	sendCloudServerBandwidthEmail,
	sendCloudServerDeletedEmail,
	sendCloudServerPaymentFailedEmail,
	sendCloudServerReactivatedEmail,
	sendCloudServerRenewalEmail,
} from "@/server/utils/cloud-server-notifications";
import { WEBSITE_URL } from "@/server/utils/stripe";

const DAY_MS = 24 * 60 * 60 * 1000;
const SUSPENSION_GRACE_DAYS = 2;
const RENEWAL_REMINDER_DAYS = [1, 3, 7];
const BANDWIDTH_WARNING_PERCENTS = [100, 80];
const CHECKOUT_EXPIRATION_MINUTES = 30;
const MINIMUM_BILLED_SECONDS = 60 * 60;
const PROVISIONING_TIMEOUT_MINUTES = 30;

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
	organizationId: string;
	plan: DokployPlan;
	zone: string;
	regionName: string;
}) => {
	const stripe = getStripeClient();
	const customer = await getOrCreateStripeCustomer(params.ownerId, stripe);
	const { plan } = params;
	// The order only lives here until it is paid, the server record is created from it afterwards.
	const metadata = {
		type: CLOUD_SERVER_METADATA_TYPE,
		cloudServerId: nanoid(),
		organizationId: params.organizationId,
		plan: plan.id,
		zone: params.zone,
	};

	return stripe.checkout.sessions.create({
		mode: "subscription",
		// Bank debits complete the checkout before the money arrives, and the server would start unpaid.
		payment_method_types: ["card", "link"],
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

export const cancelCloudServerSubscription = async (
	subscriptionId: string,
	options: { creditUnusedTime?: boolean } = {},
) => {
	const stripe = getStripeClient();
	const subscription = await stripe.subscriptions
		.retrieve(subscriptionId, { expand: ["latest_invoice"] })
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
	// A period that was never paid must not turn into credit.
	const credit =
		!!options.creditUnusedTime &&
		(subscription.latest_invoice as Stripe.Invoice | null)?.status === "paid";
	const cancelled = await stripe.subscriptions.cancel(subscriptionId, {
		invoice_now: credit,
		prorate: credit,
		expand: ["latest_invoice"],
	});
	if (!credit) return;

	const invoice = cancelled.latest_invoice as Stripe.Invoice;
	const priceCents = subscription.items.data[0]?.price.unit_amount;
	const missingSeconds =
		MINIMUM_BILLED_SECONDS - (Date.now() / 1000 - subscription.start_date);
	// A server deleted after a few minutes rounds to $0.00, while DigitalOcean still bills us for it.
	if (priceCents && missingSeconds > 0) {
		await stripe.invoiceItems.create(
			{
				customer: invoice.customer as string,
				invoice: invoice.id,
				amount: Math.ceil(
					(priceCents * missingSeconds) /
						(subscription.current_period_end -
							subscription.current_period_start),
				),
				currency: invoice.currency,
				description: "Minimum charge: first hour",
			},
			{ idempotencyKey: `cloud-server-minimum-${invoice.id}` },
		);
	}
	await chargeExtraBandwidth(stripe, invoice);
	// Stripe keeps this invoice in draft for an hour, and the credit only reaches the balance once it is finalized.
	await stripe.invoices.finalizeInvoice(invoice.id);
};

const refundInvoice = async (
	stripe: Stripe,
	invoice: Stripe.Invoice | string | null,
) => {
	if (!invoice || typeof invoice === "string" || !invoice.paid) return;

	if (invoice.payment_intent) {
		await stripe.refunds.create({
			payment_intent: invoice.payment_intent as string,
		});
	} else if (invoice.charge) {
		await stripe.refunds.create({ charge: invoice.charge as string });
	}

	// The part paid with credit never reached a card, so it goes back to the balance.
	const fromBalance = (invoice.ending_balance ?? 0) - invoice.starting_balance;
	if (fromBalance > 0) {
		await stripe.customers.createBalanceTransaction(
			invoice.customer as string,
			{
				amount: -fromBalance,
				currency: invoice.currency,
				description: "Credit returned for a cloud server order that failed",
			},
		);
	}
};

const refundAndCancelSubscription = async (
	stripe: Stripe,
	subscriptionId: string,
) => {
	const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
		expand: ["latest_invoice"],
	});
	await cancelCloudServerSubscription(subscriptionId);
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
	session: Stripe.Checkout.Session,
) => {
	const subscriptionId = session.subscription as string;
	const { cloudServerId, organizationId, zone } = session.metadata ?? {};
	const plan = DOKPLOY_PLANS.find((p) => p.id === session.metadata?.plan);

	if (
		!cloudServerId ||
		!organizationId ||
		!zone ||
		!plan ||
		!(await findOrganizationById(organizationId))
	) {
		// Paid for an order that can no longer be fulfilled, there is nothing to provision.
		await refundAndCancelSubscription(stripe, subscriptionId);
		return;
	}

	const record = await createCloudServer({
		cloudServerId,
		organizationId,
		plan: plan.id,
		zone,
		hostname: buildCloudServerHostname(organizationId),
		status: "provisioning",
		stripeSubscriptionId: subscriptionId,
		stripeCheckoutSessionId: session.id,
	});
	if (!record) return;

	// Provisioning takes minutes, far longer than Stripe waits for a webhook response.
	void provisionCloudServer({
		cloudServerId: record.cloudServerId,
		organizationId: record.organizationId,
		doSize: plan.doSize,
		swapGb: Math.min(plan.memoryGb, 4),
		zone: record.zone,
		hostname: record.hostname!,
	}).catch((err) => handleProvisioningFailure(stripe, record, err));
};

const logEmailError = (record: CloudServer) => (err: unknown) =>
	console.error(
		`[cloud-server] failed to send an email about ${record.cloudServerId}:`,
		err,
	);

const reactivateCloudServer = async (record: CloudServer) => {
	if (record.status !== "suspended") return;
	await resumeCloudServer(record);
	await sendCloudServerReactivatedEmail(record).catch(logEmailError(record));
};

const handleSubscriptionUpdated = async (subscription: Stripe.Subscription) => {
	const record = await findCloudServerBySubscriptionId(subscription.id);
	if (!record) return;

	if (subscription.status === "past_due" || subscription.status === "unpaid") {
		if (record.status !== "ready") return;
		await suspendCloudServer(record);
		await sendCloudServerPaymentFailedEmail(
			record,
			new Date(Date.now() + SUSPENSION_GRACE_DAYS * DAY_MS),
		).catch(logEmailError(record));
	} else if (subscription.status === "active") {
		await reactivateCloudServer(record);
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
	await sendCloudServerDeletedEmail(record).catch(logEmailError(record));
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

// Stripe keeps a renewal invoice in draft for about an hour, the only moment a line can still be added to it.
const chargeExtraBandwidth = async (
	stripe: Stripe,
	invoice: Stripe.Invoice,
) => {
	const stored = await findCloudServerBySubscriptionId(
		invoice.subscription as string,
	);
	const plan = DOKPLOY_PLANS.find((p) => p.id === stored?.plan);
	if (!stored || !plan) return;

	// The daily measurement can be a day old, and this invoice is the last chance to bill that traffic.
	const measured = stored.providerVmId
		? await recordCloudServerBandwidth(stored).catch(() => undefined)
		: undefined;
	const record = measured ?? stored;

	const extraGb =
		Math.floor(record.bandwidthBytes / 1024 ** 3) - plan.transferTb * 1000;
	if (extraGb > 0) {
		await stripe.invoiceItems.create(
			{
				customer: invoice.customer as string,
				invoice: invoice.id,
				amount: extraGb * EXTRA_BANDWIDTH_CENTS_PER_GB,
				currency: invoice.currency,
				description: `Extra bandwidth: ${extraGb} GB`,
			},
			{ idempotencyKey: `cloud-server-bandwidth-${invoice.id}` },
		);
	}
	await updateCloudServer(record.cloudServerId, { bandwidthBytes: 0 });
};

/** Returns true when the event belongs to a cloud server and was handled here. */
export const handleCloudServerEvent = async (
	stripe: Stripe,
	event: Stripe.Event,
): Promise<boolean> => {
	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object;
			if (!getCloudServerId(session.metadata)) return false;
			await handleCheckoutCompleted(stripe, session);
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
		case "invoice.created": {
			const invoice = event.data.object;
			if (!getCloudServerId(invoice.subscription_details?.metadata)) {
				return false;
			}
			if (invoice.billing_reason === "subscription_cycle") {
				await chargeExtraBandwidth(stripe, invoice);
			}
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

const hasValidPaymentMethod = (subscription: Stripe.Subscription) => {
	const customer = subscription.customer as Stripe.Customer;
	const method = (subscription.default_payment_method ??
		customer.invoice_settings
			?.default_payment_method) as Stripe.PaymentMethod | null;
	if (!method) return false;
	if (!method.card) return true;
	// A card works until the end of its expiry month, which Date.UTC reaches because its months start at 0.
	return (
		Date.UTC(method.card.exp_year, method.card.exp_month) >
		subscription.current_period_end * 1000
	);
};

const sendRenewalReminder = async (stripe: Stripe, record: CloudServer) => {
	const subscription = await stripe.subscriptions.retrieve(
		record.stripeSubscriptionId!,
		{
			expand: [
				"default_payment_method",
				"customer.invoice_settings.default_payment_method",
			],
		},
	);
	if (subscription.status !== "active" || subscription.cancel_at_period_end) {
		return;
	}

	const renewsAt = subscription.current_period_end * 1000;
	const days = RENEWAL_REMINDER_DAYS.find(
		(d) => Date.now() >= renewsAt - d * DAY_MS,
	);
	if (!days || hasValidPaymentMethod(subscription)) return;

	const claimed = await claimCloudServerPaymentReminder(
		record.cloudServerId,
		new Date(renewsAt - days * DAY_MS),
	);
	if (!claimed) return;

	try {
		await sendCloudServerRenewalEmail(record, new Date(renewsAt));
	} catch (err) {
		await updateCloudServer(record.cloudServerId, {
			paymentReminderAt: record.paymentReminderAt,
		});
		throw err;
	}
};

export const sendCloudServerPaymentReminders = async () => {
	const stripe = getStripeClient();
	for (const record of await findReadyCloudServers()) {
		try {
			await sendRenewalReminder(stripe, record);
		} catch (err) {
			console.error(
				`[cloud-server] failed to send the payment reminder of ${record.cloudServerId}:`,
				err,
			);
		}
	}
};

export const recordBandwidthAndWarn = async () => {
	for (const { previous, current } of await recordCloudServersBandwidth()) {
		const plan = DOKPLOY_PLANS.find((p) => p.id === current.plan);
		if (!plan) continue;

		const allowance = plan.transferTb * 1000 * 1024 ** 3;
		const percent = BANDWIDTH_WARNING_PERCENTS.find(
			(p) =>
				previous.bandwidthBytes < (allowance * p) / 100 &&
				current.bandwidthBytes >= (allowance * p) / 100,
		);
		if (percent) {
			await sendCloudServerBandwidthEmail(
				current,
				percent,
				plan.transferTb,
			).catch(logEmailError(current));
		}
	}
};

// Returns true when the server must be kept: it is already paid, or one last charge went through.
const collectUnpaidInvoice = async (stripe: Stripe, record: CloudServer) => {
	const subscription = await stripe.subscriptions.retrieve(
		record.stripeSubscriptionId!,
		{ expand: ["latest_invoice", "customer"] },
	);
	if (subscription.status === "active") {
		// The webhook that resumes the server never arrived.
		await reactivateCloudServer(record);
		return true;
	}

	const invoice = subscription.latest_invoice as Stripe.Invoice | null;
	if (subscription.status === "canceled" || invoice?.status !== "open") {
		return false;
	}

	// Checkout keeps the card on the subscription, so one the customer added later is only their account default.
	const card = (subscription.customer as Stripe.Customer).invoice_settings
		?.default_payment_method;
	if (card) {
		await stripe.subscriptions.update(subscription.id, {
			default_payment_method: card as string,
		});
	}

	try {
		// Paying moves the subscription back to active, and that webhook resumes the server.
		return (await stripe.invoices.pay(invoice.id)).status === "paid";
	} catch (err) {
		if (err instanceof Stripe.errors.StripeCardError) return false;
		throw err;
	}
};

export const removeUnpaidCloudServers = async () => {
	const stripe = getStripeClient();
	const cutoff = new Date(Date.now() - SUSPENSION_GRACE_DAYS * DAY_MS);

	for (const record of await findSuspendedCloudServersBefore(cutoff)) {
		try {
			if (
				record.stripeSubscriptionId &&
				(await collectUnpaidInvoice(stripe, record))
			) {
				continue;
			}
			await updateCloudServer(record.cloudServerId, {
				status: "terminating",
			});
			if (record.stripeSubscriptionId) {
				await cancelCloudServerSubscription(record.stripeSubscriptionId);
			}
			await terminateCloudServer(record.cloudServerId);
			await sendCloudServerDeletedEmail(record).catch(logEmailError(record));
		} catch (err) {
			console.error(
				`[cloud-server] failed to remove suspended server ${record.cloudServerId}:`,
				err,
			);
			// Only suspended servers are picked up by the next run.
			await updateCloudServer(record.cloudServerId, { status: "suspended" });
		}
	}
};

// Provisioning runs in memory, so a restart in the middle leaves the server half built and the customer charged.
export const failInterruptedProvisioning = async () => {
	const stripe = getStripeClient();
	const cutoff = new Date(Date.now() - PROVISIONING_TIMEOUT_MINUTES * 60_000);

	for (const record of await findCloudServersProvisioningBefore(cutoff)) {
		await handleProvisioningFailure(
			stripe,
			record,
			new Error("Provisioning was interrupted"),
		);
	}
};

export const getCloudServerCreditCents = async (ownerId: string) => {
	const owner = await findUserById(ownerId);
	if (!owner.stripeCustomerId) return 0;

	const customer = await getStripeClient().customers.retrieve(
		owner.stripeCustomerId,
	);
	// Stripe stores credit as a negative balance.
	return customer.deleted ? 0 : Math.max(0, -customer.balance);
};

export const initCloudServerCrons = () => {
	scheduleJob("cloud-server-payment-reminders", "0 2 * * *", () =>
		sendCloudServerPaymentReminders().catch((err) =>
			console.error("[cloud-server] failed to send payment reminders:", err),
		),
	);

	scheduleJob("cloud-server-bandwidth", "0 1 * * *", () =>
		recordBandwidthAndWarn().catch((err) =>
			console.error("[cloud-server] failed to record bandwidth:", err),
		),
	);

	scheduleJob("cloud-server-suspension-cleanup", "0 * * * *", () =>
		removeUnpaidCloudServers().catch((err) =>
			console.error("[cloud-server] failed to remove unpaid servers:", err),
		),
	);

	scheduleJob("cloud-server-interrupted-provisioning", "*/10 * * * *", () =>
		failInterruptedProvisioning().catch((err) =>
			console.error("[cloud-server] failed to close provisioning:", err),
		),
	);
};
