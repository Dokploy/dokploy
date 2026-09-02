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

const stripePromise = loadStripe(
	process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

interface Props {
	onNext: () => void;
}

export const PlanStep = ({ onNext }: Props) => {
	const [loadingTier, setLoadingTier] = useState<
		"hobby" | "startup" | "trial" | null
	>(null);
	const { data } = api.stripe.getProducts.useQuery();
	const { mutateAsync: createCheckoutSession } =
		api.stripe.createCheckoutSession.useMutation();
	const { mutateAsync: startFreeTrial } =
		api.stripe.startFreeTrial.useMutation();
	const utils = api.useUtils();

	const handleCheckout = async (tier: "hobby" | "startup") => {
		if (!data) return;
		const productId =
			tier === "hobby" ? data.hobbyProductId : data.startupProductId;
		if (!productId) return;
		setLoadingTier(tier);
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
			setLoadingTier(null);
		}
	};

	const handleTrial = async () => {
		setLoadingTier("trial");
		try {
			await startFreeTrial();
			await utils.project.onboardingStatus.invalidate();
			toast.success("Your 14-day trial has started");
			onNext();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Error starting trial",
			);
		} finally {
			setLoadingTier(null);
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
					No credit card for the trial — add one only if you decide to stay.
				</p>
			</div>

			<div className="flex flex-col rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 overflow-hidden">
				<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 p-7">
					<div>
						<span className="inline-flex items-center rounded-full bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white font-mono text-[10px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1">
							Recommended
						</span>
						<p className={`${displayFont.className} text-2xl mt-3`}>
							14-day free trial
						</p>
						<p className="text-sm text-zinc-400 dark:text-zinc-600 mt-1 max-w-xs">
							No card required — cancel anytime.
						</p>
						<ul className="flex flex-col gap-1.5 mt-4">
							{[
								"1 server included",
								"Unlimited apps & databases",
								"Community support",
							].map((f) => (
								<li
									key={f}
									className="flex items-center gap-2 text-sm text-zinc-300 dark:text-zinc-700"
								>
									<CheckIcon className="size-3.5 text-zinc-500 shrink-0" />
									{f}
								</li>
							))}
						</ul>
					</div>
					<Button
						size="lg"
						className="bg-white text-zinc-950 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-800 w-fit shrink-0 px-6"
						isLoading={loadingTier === "trial"}
						disabled={loadingTier !== null}
						onClick={handleTrial}
					>
						Start trial
						<ArrowRightIcon className="size-4" />
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
				<div className="flex flex-col justify-between gap-6 bg-background p-7">
					<div>
						<p className="font-medium">Hobby</p>
						<p className="text-sm text-muted-foreground mt-1">
							For individual developers
						</p>
						<p className="text-3xl font-semibold mt-4 tabular-nums">
							${calculatePriceHobby(1, false).toFixed(2)}
							<span className="text-sm font-normal text-muted-foreground">
								{" "}
								/mo
							</span>
						</p>
						<ul className="flex flex-col gap-1.5 mt-4">
							{[
								"1 server included",
								"Unlimited apps & databases",
								"2 environments",
								"Community support",
							].map((f) => (
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
					<Button
						variant="outline"
						isLoading={loadingTier === "hobby"}
						disabled={loadingTier !== null || !data?.hobbyProductId}
						onClick={() => handleCheckout("hobby")}
					>
						Subscribe
					</Button>
				</div>

				<div className="flex flex-col justify-between gap-6 bg-background p-7">
					<div>
						<p className="font-medium">Startup</p>
						<p className="text-sm text-muted-foreground mt-1">
							For small to mid-size teams
						</p>
						<p className="text-3xl font-semibold mt-4 tabular-nums">
							$
							{calculatePriceStartup(STARTUP_SERVERS_INCLUDED, false).toFixed(
								2,
							)}
							<span className="text-sm font-normal text-muted-foreground">
								{" "}
								/mo
							</span>
						</p>
						<ul className="flex flex-col gap-1.5 mt-4">
							{[
								`${STARTUP_SERVERS_INCLUDED} servers included`,
								"Unlimited users & environments",
								"Basic RBAC + 2FA",
								"Email & chat support",
							].map((f) => (
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
					<Button
						variant="outline"
						isLoading={loadingTier === "startup"}
						disabled={loadingTier !== null || !data?.startupProductId}
						onClick={() => handleCheckout("startup")}
					>
						Subscribe
					</Button>
				</div>
			</div>
		</div>
	);
};
