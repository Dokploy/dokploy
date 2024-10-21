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
		items.push({
			price: "price_1QC7XwF3cxQuHeOz68CpnIUZ",
			quantity: serverQuantity,
		});

		return items;
	}
	items.push({
		price: "price_1QC7X5F3cxQuHeOz1859ljDP",
		quantity: serverQuantity,
	});

	return items;
};
