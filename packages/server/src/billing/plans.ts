
export type PlanName = 'free' | 'pro' | 'agency'

export type PlanFeatures = {
	description: string[]
	availableServer: number
}
 
export  type Plan = {
	name: string
	price: number
	priceMonthly: number
	features: PlanFeatures
 }

export const PLANS:Record<PlanName, Plan> = {
	free: {
		name: "Free",
		price: 0,
		priceMonthly: 0,
		features: {
			description: ["1 сервер", "Безлимит проектов", "SSL", "Git deploy"],
		availableServer: 1,

		},
	},
	pro: {
		name: "Pro",
		price: 39_900,
		priceMonthly: 399,
		features: {
			description: ["10 серверов", "Мониторинг", "Rollback", "Telegram алерты"],
			availableServer: 10,
		},
	},
	agency: {
		name: "Agency",
		price: 99_900,
		priceMonthly: 999,
		features: {
			description: ["50 серверов", "AI Deploy", "API", "SLA 99.9%"],
			availableServer: 50,
		},
	},
} as const;

export const PERIOD_DAYS = 30 as const;


export type PlanKey = keyof typeof PLANS;

