import Stripe from "stripe";

export const WEBSITE_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3000"
		: "https://app.dokploy.com";

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
