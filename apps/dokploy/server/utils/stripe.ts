import Stripe from "stripe";

export const BASE_PRICE_MONTHLY_ID =
	process.env.STRIPE_BASE_PRICE_MONTHLY_ID || ""; // $4.00
export const GROWTH_PRICE_MONTHLY_ID =
	process.env.STRIPE_GROWTH_PRICE_MONTHLY_ID || ""; // $7.99
export const SERVER_ADDITIONAL_PRICE_MONTHLY_ID =
	process.env.STRIPE_SERVER_ADDITIONAL_PRICE_MONTHLY_ID || ""; // $3.50

export const BASE_PRICE_YEARLY_ID =
	process.env.STRIPE_BASE_PRICE_YEARLY_ID || ""; // $40.80
export const GROWTH_PRICE_YEARLY_ID =
	process.env.STRIPE_GROWTH_PRICE_YEARLY_ID || ""; // $81.50
export const ADDITIONAL_PRICE_YEARLY_ID =
	process.env.STRIPE_SERVER_ADDITIONAL_PRICE_YEARLY_ID || ""; // $35.70

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
	apiVersion: "2024-09-30.acacia",
});

export const getStripeItems = (serverQuantity: number, isAnnual: boolean) => {
	const items = [];

	if (isAnnual) {
		if (serverQuantity === 1) {
			items.push({
				price: BASE_PRICE_YEARLY_ID,
				quantity: 1,
			});
		} else if (serverQuantity <= 3) {
			items.push({
				price: GROWTH_PRICE_YEARLY_ID,
				quantity: 1,
			});
		} else {
			items.push({
				price: GROWTH_PRICE_YEARLY_ID,
				quantity: 1,
			});
			items.push({
				price: ADDITIONAL_PRICE_YEARLY_ID,
				quantity: serverQuantity - 3,
			});
		}

		return items;
	}
	if (serverQuantity === 1) {
		items.push({
			price: BASE_PRICE_MONTHLY_ID,
			quantity: 1,
		});
	} else if (serverQuantity <= 3) {
		items.push({
			price: GROWTH_PRICE_MONTHLY_ID,
			quantity: 1,
		});
	} else {
		items.push({
			price: GROWTH_PRICE_MONTHLY_ID,
			quantity: 1,
		});
		items.push({
			price: SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
			quantity: serverQuantity - 3,
		});
	}

	return items;
};

export const getStripeSubscriptionItemsCalculate = async (
	subscriptionId: string,
	serverQuantity: number,
	isAnnual: boolean,
) => {
	const subscription = await stripe.subscriptions.retrieve(subscriptionId);
	const currentItems = subscription.items.data;
	const items = [];

	if (isAnnual) {
		const baseItem = currentItems.find(
			(item) =>
				item.price.id === BASE_PRICE_YEARLY_ID ||
				item.price.id === GROWTH_PRICE_YEARLY_ID,
		);
		const additionalItem = currentItems.find(
			(item) => item.price.id === ADDITIONAL_PRICE_YEARLY_ID,
		);
		if (serverQuantity === 1) {
			if (baseItem) {
				items.push({
					id: baseItem.id,
					price: BASE_PRICE_YEARLY_ID,
					quantity: 1,
				});
			}
		} else if (serverQuantity <= 3) {
			if (baseItem) {
				items.push({
					id: baseItem.id,
					price: GROWTH_PRICE_YEARLY_ID,
					quantity: 1,
				});
			}
		} else {
			if (baseItem) {
				items.push({
					id: baseItem.id,
					price: GROWTH_PRICE_YEARLY_ID,
					quantity: 1,
				});
			}

			if (additionalItem) {
				items.push({
					id: additionalItem.id,
					price: ADDITIONAL_PRICE_YEARLY_ID,
					quantity: serverQuantity - 3,
				});
			} else {
				items.push({
					price: ADDITIONAL_PRICE_YEARLY_ID,
					quantity: serverQuantity - 3,
				});
			}
		}
	} else {
		const baseItem = currentItems.find(
			(item) =>
				item.price.id === BASE_PRICE_MONTHLY_ID ||
				item.price.id === GROWTH_PRICE_MONTHLY_ID,
		);
		const additionalItem = currentItems.find(
			(item) => item.price.id === SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
		);
		if (serverQuantity === 1) {
			if (baseItem) {
				items.push({
					id: baseItem.id,
					price: BASE_PRICE_MONTHLY_ID,
					quantity: 1,
				});
			}
		} else if (serverQuantity <= 3) {
			if (baseItem) {
				items.push({
					id: baseItem.id,
					price: GROWTH_PRICE_MONTHLY_ID,
					quantity: 1,
				});
			}
		} else {
			if (baseItem) {
				items.push({
					id: baseItem.id,
					price: GROWTH_PRICE_MONTHLY_ID,
					quantity: 1,
				});
			}

			if (additionalItem) {
				items.push({
					id: additionalItem.id,
					price: SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
					quantity: serverQuantity - 3,
				});
			} else {
				items.push({
					price: SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
					quantity: serverQuantity - 3,
				});
			}
		}
	}

	return items;
};

export const updateBasePlan = async (
	subscriptionId: string,
	subscriptionItemId: string,
	newPriceId: string,
) => {
	await stripe.subscriptions.update(subscriptionId, {
		items: [
			{
				id: subscriptionItemId,
				price: newPriceId,
				quantity: 1,
			},
		],
		proration_behavior: "always_invoice",
	});
};

export const deleteAdditionalItem = async (subscriptionItemId: string) => {
	await stripe.subscriptionItems.del(subscriptionItemId);
};

export const getStripeSubscriptionItems = async (
	subscriptionId: string,
	isAnual: boolean,
) => {
	const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
		expand: ["items.data.price"],
	});

	if (isAnual) {
		const baseItem = subscription.items.data.find(
			(item) =>
				item.price.id === BASE_PRICE_YEARLY_ID ||
				item.price.id === GROWTH_PRICE_YEARLY_ID,
		);
		const additionalItem = subscription.items.data.find(
			(item) => item.price.id === ADDITIONAL_PRICE_YEARLY_ID,
		);

		return {
			baseItem,
			additionalItem,
		};
	}
	const baseItem = subscription.items.data.find(
		(item) =>
			item.price.id === BASE_PRICE_MONTHLY_ID ||
			item.price.id === GROWTH_PRICE_MONTHLY_ID,
	);
	const additionalItem = subscription.items.data.find(
		(item) => item.price.id === SERVER_ADDITIONAL_PRICE_MONTHLY_ID,
	);

	return {
		baseItem,
		additionalItem,
	};
};

export const getStripePrices = async (isAnual: boolean) => {
	const basePrice = isAnual
		? await stripe.prices.retrieve(BASE_PRICE_YEARLY_ID)
		: await stripe.prices.retrieve(BASE_PRICE_MONTHLY_ID);

	const growthPrice = isAnual
		? await stripe.prices.retrieve(GROWTH_PRICE_YEARLY_ID)
		: await stripe.prices.retrieve(GROWTH_PRICE_MONTHLY_ID);

	const additionalPrice = isAnual
		? await stripe.prices.retrieve(ADDITIONAL_PRICE_YEARLY_ID)
		: await stripe.prices.retrieve(SERVER_ADDITIONAL_PRICE_MONTHLY_ID);

	return {
		basePrice,
		growthPrice,
		additionalPrice,
	};
};
