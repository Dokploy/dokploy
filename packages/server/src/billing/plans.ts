export const PLANS = {
	free: {
		name: "Free",
		price: 0,
		priceMonthly: 0,
		features: ["1 сервер", "Безлимит проектов", "SSL", "Git deploy"],
	},
	pro: {
		name: "Pro",
		price: 39_900,
		priceMonthly: 399,
		features: ["10 серверов", "Мониторинг", "Rollback", "Telegram алерты"],
	},
	agency: {
		name: "Agency",
		price: 99_900,
		priceMonthly: 999,
		features: ["50 серверов", "AI Deploy", "API", "SLA 99.9%"],
	},
} as const;

export type PlanKey = keyof typeof PLANS;

