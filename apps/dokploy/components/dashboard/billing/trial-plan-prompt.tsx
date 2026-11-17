import { loadStripe } from "@stripe/stripe-js";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trackOnboarding } from "@/components/dashboard/onboarding/cloud/track";
import {
	calculatePriceHobby,
	calculatePriceStartup,
	STARTUP_SERVERS_INCLUDED,
} from "@/components/dashboard/settings/billing/show-billing";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
	? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
	: null;

const DISMISS_KEY = "dokploy_trial_plan_prompt_dismissed";
const PROMPT_DAYS_LEFT = 2;

type Tier = "hobby" | "startup";

const PLANS: {
	tier: Tier;
	name: string;
	price: number;
	unit: string;
	blurb: string;
}[] = [
	{
		tier: "hobby",
		name: "Hobby",
		price: calculatePriceHobby(1, false),
		unit: "per server / month",
		blurb: "Good for personal projects.",
	},
	{
		tier: "startup",
		name: "Startup",
		price: calculatePriceStartup(STARTUP_SERVERS_INCLUDED, false),
		unit: `per month, ${STARTUP_SERVERS_INCLUDED} servers included`,
		blurb: "Good for small teams.",
	},
];

export const TrialPlanPrompt = () => {
	const { data: billing } = api.stripe.getBillingStatus.useQuery();
	const { data: auth } = api.user.get.useQuery();
	const canManageBilling = auth?.role === "owner" || auth?.role === "admin";
	const { data: products } = api.stripe.getProducts.useQuery(undefined, {
		enabled: canManageBilling,
	});
	const { data: serverCount } = api.server.count.useQuery();
	const { mutateAsync: createCheckoutSession, isPending } =
		api.stripe.createCheckoutSession.useMutation();

	const [tier, setTier] = useState<Tier>("hobby");
	const [open, setOpen] = useState(false);

	const isDue =
		canManageBilling &&
		!!billing?.isOnTrial &&
		!billing.hasPaymentMethod &&
		billing.trialDaysRemaining !== null &&
		billing.trialDaysRemaining <= PROMPT_DAYS_LEFT;

	useEffect(() => {
		if (!isDue) return;
		let dismissed = false;
		try {
			dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "true";
		} catch {}
		setOpen(!dismissed);
		if (!dismissed) trackOnboarding("plan_prompt_shown");
	}, [isDue]);

	const handleOpenChange = (value: boolean) => {
		setOpen(value);
		if (!value) {
			try {
				window.sessionStorage.setItem(DISMISS_KEY, "true");
			} catch {}
		}
	};

	const handleSubscribe = async () => {
		const productId =
			tier === "hobby" ? products?.hobbyProductId : products?.startupProductId;
		if (!productId) return;
		trackOnboarding("plan_chosen", { plan: tier, source: "trial_prompt" });
		try {
			const stripe = await stripePromise;
			const session = await createCheckoutSession({
				tier,
				productId,
				serverQuantity:
					tier === "startup"
						? Math.max(STARTUP_SERVERS_INCLUDED, serverCount ?? 0)
						: Math.max(1, serverCount ?? 0),
				isAnnual: false,
			});
			await stripe?.redirectToCheckout({ sessionId: session.sessionId });
		} catch {
			toast.error("Error starting checkout");
		}
	};

	if (!isDue || !billing) return null;

	const daysLeft = billing.trialDaysRemaining ?? 0;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<span className="w-fit rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
						{daysLeft === 0
							? "Your trial ends today"
							: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial`}
					</span>
					<DialogTitle className="text-2xl">
						Choose a plan to keep deploying
					</DialogTitle>
					<DialogDescription>
						{billing.trialEndsAt
							? `Your trial ends ${format(billing.trialEndsAt, "MMMM d")}. `
							: ""}
						Pick a plan and add a card to keep your apps and server connected.
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{PLANS.map((plan) => {
						const selected = tier === plan.tier;
						return (
							<button
								key={plan.tier}
								type="button"
								aria-pressed={selected}
								onClick={() => setTier(plan.tier)}
								className={cn(
									"flex flex-col items-start gap-2 rounded-xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									selected
										? "border-primary bg-muted ring-1 ring-primary"
										: "bg-card hover:bg-muted/50",
								)}
							>
								<span className="flex w-full items-center justify-between">
									<span className="font-semibold">{plan.name}</span>
									{selected && (
										<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
											Selected
										</span>
									)}
								</span>
								<span className="text-2xl font-semibold tabular-nums">
									${plan.price.toFixed(2)}
								</span>
								<span className="text-xs text-muted-foreground">
									{plan.unit}
								</span>
								<span className="text-sm text-muted-foreground">
									{plan.blurb}
								</span>
							</button>
						);
					})}
				</div>
				<p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
					Hobby is selected for you because most people start there. You can
					change plans at any time.
				</p>
				<DialogFooter>
					<Button variant="ghost" onClick={() => handleOpenChange(false)}>
						Not now
					</Button>
					<Button
						onClick={handleSubscribe}
						isLoading={isPending}
						disabled={!products}
					>
						Add card and subscribe
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
