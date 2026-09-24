import { loadStripe } from "@stripe/stripe-js";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	calculatePriceHobby,
	calculatePriceStartup,
	STARTUP_SERVERS_INCLUDED,
} from "@/components/dashboard/settings/billing/show-billing";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { displayFont } from "../font";

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
	onNext: () => void;
}

export const PlanStep = ({ onNext }: Props) => {
	const [loading, setLoading] = useState<
		`${"trial" | "checkout"}:${Tier}` | null
	>(null);
	const { data } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();
	const { mutateAsync: startFreeTrial } =
		api.stripe.startFreeTrial.useMutation();
	const utils = api.useUtils();

	const handleCheckout = async (tier: Tier) => {
		if (!data) return;
		const productId =
			tier === "hobby" ? data.hobbyProductId : data.startupProductId;
		if (!productId) return;
		setLoading(`checkout:${tier}`);
		try {
			const stripe = await stripePromise;
			const session = await createCheckoutSession({
				tier,
				productId,
				serverQuantity: tier === "startup" ? STARTUP_SERVERS_INCLUDED : 1,
				isAnnual: false,
			});
			await stripe?.redirectToCheckout({ sessionId: session.sessionId });
		} catch {
			toast.error("Error starting checkout");
			setLoading(null);
		}
	};

	const handleTrial = async (tier: Tier) => {
		setLoading(`trial:${tier}`);
		try {
			await startFreeTrial({ tier });
			await utils.project.onboardingStatus.invalidate();
			toast.success("Your 7-day trial has started");
			onNext();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error starting trial",
			);
		} finally {
			setLoading(null);
		}
	};

	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-4">
				<span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
					Billing
				</span>
				<h1
					className={`${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`}
				>
					Start free, upgrade when ready.
				</h1>
				<p className="text-muted-foreground text-lg max-w-md leading-relaxed">
					Try any plan free for 7 days. No credit card required — add one only
					if you decide to stay.
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
				{PLANS.map((plan) => {
					const productId =
						plan.tier === "hobby"
							? data?.hobbyProductId
							: data?.startupProductId;
					return (
						<div
							key={plan.tier}
							className="flex flex-col justify-between gap-6 bg-background p-7"
						>
							<div>
								{plan.recommended && (
									<span className="inline-flex items-center rounded-full bg-primary text-primary-foreground font-mono text-[10px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1 mb-3">
										Recommended
									</span>
								)}
								<p className="font-medium">{plan.name}</p>
								<p className="text-sm text-muted-foreground mt-1">
									{plan.description}
								</p>
								<p className="text-3xl font-semibold mt-4 tabular-nums">
									${plan.price.toFixed(2)}
									<span className="text-sm font-normal text-muted-foreground">
										{" "}
										/mo
									</span>
								</p>
								<ul className="flex flex-col gap-1.5 mt-4">
									{plan.features.map((f) => (
										<li
											key={f}
											className="flex items-center gap-2 text-sm text-muted-foreground"
										>
											<CheckIcon className="size-3.5 shrink-0" />
											{f}
										</li>
									))}
								</ul>
							</div>
							<div className="flex flex-col gap-2">
								<Button
									isLoading={loading === `trial:${plan.tier}`}
									disabled={loading !== null}
									onClick={() => handleTrial(plan.tier)}
								>
									Start 7-day free trial
									<ArrowRightIcon className="size-4" />
								</Button>
								<Button
									variant="outline"
									isLoading={loading === `checkout:${plan.tier}`}
									disabled={loading !== null || !productId}
									onClick={() => handleCheckout(plan.tier)}
								>
									Subscribe now
								</Button>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};
