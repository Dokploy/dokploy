export const WEBSITE_URL =
	process.env.NODE_ENV === "development"
		? "http://localhost:3000"
		: process.env.SITE_URL;

export const BASE_PRICE_MONTHLY_ID = process.env.BASE_PRICE_MONTHLY_ID!;
export const BASE_ANNUAL_MONTHLY_ID = process.env.BASE_ANNUAL_MONTHLY_ID!;
export const PRODUCT_MONTHLY_ID = process.env.PRODUCT_MONTHLY_ID!;
export const PRODUCT_ANNUAL_ID = process.env.PRODUCT_ANNUAL_ID!;

export const LEGACY_PRICE_IDS = [
	process.env.BASE_PRICE_MONTHLY_ID,
	process.env.BASE_ANNUAL_MONTHLY_ID,
].filter(Boolean) as string[];

export const HOBBY_PRODUCT_ID = process.env.HOBBY_PRODUCT_ID ?? "";
export const HOBBY_PRICE_MONTHLY_ID = process.env.HOBBY_PRICE_MONTHLY_ID ?? "";
export const HOBBY_PRICE_ANNUAL_ID = process.env.HOBBY_PRICE_ANNUAL_ID ?? "";

export const STARTUP_PRODUCT_ID = process.env.STARTUP_PRODUCT_ID ?? "";
export const STARTUP_BASE_PRICE_MONTHLY_ID =
	process.env.STARTUP_BASE_PRICE_MONTHLY_ID ?? "";
export const STARTUP_BASE_PRICE_ANNUAL_ID =
	process.env.STARTUP_BASE_PRICE_ANNUAL_ID ?? "";

export type BillingTier = "legacy" | "hobby" | "startup";

export const getStripeItems = (
	tier: BillingTier,
	serverQuantity: number,
	isAnnual: boolean,
) => {
	const items: { price: string; quantity: number }[] = [];

	if (tier === "legacy") {
		items.push({
			price: isAnnual ? BASE_ANNUAL_MONTHLY_ID : BASE_PRICE_MONTHLY_ID,
			quantity: serverQuantity,
		});
		return items;
	}
	if (tier === "hobby") {
		const price = isAnnual
			? HOBBY_PRICE_ANNUAL_ID || BASE_ANNUAL_MONTHLY_ID
			: HOBBY_PRICE_MONTHLY_ID || BASE_PRICE_MONTHLY_ID;
		items.push({ price, quantity: serverQuantity });
		return items;
	}

	// Startup: base incluye 3 servidores; del 4º en adelante = precio Hobby ($4.50 c/u)
	if (tier === "startup") {
		const basePrice = isAnnual
			? STARTUP_BASE_PRICE_ANNUAL_ID
			: STARTUP_BASE_PRICE_MONTHLY_ID;
		const extraServerPrice = isAnnual
			? HOBBY_PRICE_ANNUAL_ID || BASE_ANNUAL_MONTHLY_ID
			: HOBBY_PRICE_MONTHLY_ID || BASE_PRICE_MONTHLY_ID;
		if (basePrice) items.push({ price: basePrice, quantity: 1 });
		const extraQty = Math.max(0, serverQuantity - 3);
		if (extraQty > 0)
			items.push({ price: extraServerPrice, quantity: extraQty });
		return items;
	}

	// Fallback legacy
	items.push({
		price: isAnnual ? BASE_ANNUAL_MONTHLY_ID : BASE_PRICE_MONTHLY_ID,
		quantity: serverQuantity,
	});
	return items;
};
