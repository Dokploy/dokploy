import { loadStripe } from "@stripe/stripe-js";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	calculatePriceHobby,
	calculatePriceStartup,
	STARTUP_SERVERS_INCLUDED,
} from "@/components/dashboard/settings/billing/show-billing";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { BackLink, ScreenHeading } from "./screen-heading";
import { trackOnboarding } from "./track";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
	? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
	: null;

type Tier = "hobby" | "startup";

const PLANS: {
	tier: Tier;
	name: string;
	description: string;
	price: number;
	features: string[];
	recommended?: boolean;
}[] = [
	{
		tier: "hobby",
		name: "Hobby",
		description: "For individual developers",
		price: calculatePriceHobby(1, false),
		features: [
			"Setup 1 server",
			"Unlimited apps & databases",
			"2 environments",
			"Community support",
		],
	},
	{
		tier: "startup",
		name: "Startup",
		description: "For small to mid-size teams",
		price: calculatePriceStartup(STARTUP_SERVERS_INCLUDED, false),
		recommended: true,
		features: [
			`Setup up to ${STARTUP_SERVERS_INCLUDED} servers`,
			"Unlimited users & environments",
			"Basic RBAC + 2FA",
			"Email & chat support",
		],
	},
];

interface Props {
	onBack: () => void;
}

export const PlanScreen = ({ onBack }: Props) => {
	const [loading, setLoading] = useState<Tier | null>(null);
	const { data: products } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();

	const handleCheckout = async (tier: Tier) => {
		const productId =
			tier === "hobby" ? products?.hobbyProductId : products?.startupProductId;
		if (!productId) return;
		trackOnboarding("plan_chosen", { plan: tier, source: "pay_now" });
		setLoading(tier);
		try {
			const stripe = await stripePromise;
			const session = await createCheckoutSession({
				tier,
				productId,
				serverQuantity: tier === "startup" ? STARTUP_SERVERS_INCLUDED : 1,
				isAnnual: false,
				fromOnboarding: true,
			});
			await stripe?.redirectToCheckout({ sessionId: session.sessionId });
		} catch {
			toast.error("Error starting checkout");
			setLoading(null);
		}
	};

	return (
		<section className="flex flex-col gap-10">
			<div className="flex flex-col gap-6">
				<BackLink onClick={onBack} />
				<ScreenHeading eyebrow="Billing" title="Pick your plan.">
					Subscribe now and skip the trial. You can change plans at any time.
				</ScreenHeading>
			</div>

			<div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
				{PLANS.map((plan) => {
					const productId =
						plan.tier === "hobby"
							? products?.hobbyProductId
							: products?.startupProductId;
					return (
						<div
							key={plan.tier}
							className="flex flex-col justify-between gap-6 bg-background p-7"
						>
							<div>
								{plan.recommended && (
									<span className="mb-3 inline-flex items-center rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-primary-foreground">
										Recommended
									</span>
								)}
								<p className="font-medium">{plan.name}</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{plan.description}
								</p>
								<p className="mt-4 text-3xl font-semibold tabular-nums">
									${plan.price.toFixed(2)}
									<span className="text-sm font-normal text-muted-foreground">
										{" "}
										/mo
									</span>
								</p>
								<ul className="mt-4 flex flex-col gap-1.5">
									{plan.features.map((feature) => (
										<li
											key={feature}
											className="flex items-center gap-2 text-sm text-muted-foreground"
										>
											<CheckIcon className="size-3.5 shrink-0" />
											{feature}
										</li>
									))}
								</ul>
							</div>
							<Button
								isLoading={loading === plan.tier}
								disabled={loading !== null || !productId}
								onClick={() => handleCheckout(plan.tier)}
							>
								Subscribe now
							</Button>
						</div>
					);
				})}
			</div>
		</section>
	);
};
