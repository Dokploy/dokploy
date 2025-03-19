export const getLicenseFeatures = (type: string): string[] => {
	const baseFeatures = [
		"Unlimited deployments",
		"Basic monitoring",
		"Email support",
	];

	const premiumFeatures = [
		...baseFeatures,
		"Priority support",
		"Advanced monitoring",
		"Custom domains",
		"Team collaboration",
	];

	const businessFeatures = [
		...premiumFeatures,
		"24/7 support",
		"Custom integrations",
		"SLA guarantees",
		"Dedicated account manager",
	];

	switch (type) {
		case "basic":
			return baseFeatures;
		case "premium":
			return premiumFeatures;
		case "business":
			return businessFeatures;
		default:
			return baseFeatures;
	}
};

export const getLicenseTypeFromPriceId = (
	priceId: string,
): {
	type: "basic" | "premium" | "business";
	billingType: "monthly" | "annual";
} => {
	const priceMap = {
		[process.env.SELF_HOSTED_BASIC_PRICE_MONTHLY_ID!]: {
			type: "basic",
			billingType: "monthly",
		},
		[process.env.SELF_HOSTED_BASIC_PRICE_ANNUAL_ID!]: {
			type: "basic",
			billingType: "annual",
		},
		[process.env.SELF_HOSTED_PREMIUM_PRICE_MONTHLY_ID!]: {
			type: "premium",
			billingType: "monthly",
		},
		[process.env.SELF_HOSTED_PREMIUM_PRICE_ANNUAL_ID!]: {
			type: "premium",
			billingType: "annual",
		},
		[process.env.SELF_HOSTED_BUSINESS_PRICE_MONTHLY_ID!]: {
			type: "business",
			billingType: "monthly",
		},
		[process.env.SELF_HOSTED_BUSINESS_PRICE_ANNUAL_ID!]: {
			type: "business",
			billingType: "annual",
		},
	} as const;

	return priceMap[priceId] || { type: "basic", billingType: "monthly" };
};
