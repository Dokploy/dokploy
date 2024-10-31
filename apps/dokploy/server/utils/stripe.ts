export const WEBSITE_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3000"
		: process.env.SITE_URL;

const BASE_PRICE_MONTHLY_ID = process.env.BASE_PRICE_MONTHLY_ID!; // $4.00

const BASE_ANNUAL_MONTHLY_ID = process.env.BASE_ANNUAL_MONTHLY_ID!; // $7.99

export const getStripeItems = (serverQuantity: number, isAnnual: boolean) => {
	const items = [];

	if (isAnnual) {
		items.push({
			price: BASE_ANNUAL_MONTHLY_ID,
			quantity: serverQuantity,
		});

		return items;
	}
	items.push({
		price: BASE_PRICE_MONTHLY_ID,
		quantity: serverQuantity,
	});

	return items;
};
