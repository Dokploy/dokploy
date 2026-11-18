import { loadStripe } from "@stripe/stripe-js";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
	nameKey: string;
	descriptionKey: string;
	price: number;
	featureKeys: string[];
	recommended?: boolean;
}[] = [
	{
		tier: "hobby",
		nameKey: "onboarding.cloud.planHobbyName",
		descriptionKey: "onboarding.cloud.planHobbyDescription",
		price: calculatePriceHobby(1, false),
		featureKeys: [
			"onboarding.cloud.planHobbyFeature1",
			"onboarding.cloud.planHobbyFeature2",
			"onboarding.cloud.planHobbyFeature3",
			"onboarding.cloud.planHobbyFeature4",
		],
	},
	{
		tier: "startup",
		nameKey: "onboarding.cloud.planStartupName",
		descriptionKey: "onboarding.cloud.planStartupDescription",
		price: calculatePriceStartup(STARTUP_SERVERS_INCLUDED, false),
		recommended: true,
		featureKeys: [
			"onboarding.cloud.planStartupFeature1",
			"onboarding.cloud.planStartupFeature2",
			"onboarding.cloud.planStartupFeature3",
			"onboarding.cloud.planStartupFeature4",
		],
	},
];

interface Props {
	onBack: () => void;
}

export const PlanScreen = ({ onBack }: Props) => {
	const { t } = useTranslation();
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
			toast.error(t("onboarding.cloud.checkoutError"));
			setLoading(null);
		}
	};

	return (
		<section className="flex flex-col gap-10">
			<div className="flex flex-col gap-6">
				<BackLink onClick={onBack} />
				<ScreenHeading
					eyebrow={t("onboarding.cloud.billingEyebrow")}
					title={t("onboarding.cloud.planTitle")}
				>
					{t("onboarding.cloud.planSubtitle")}
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
										{t("onboarding.cloud.recommended")}
									</span>
								)}
								<p className="font-medium">{t(plan.nameKey)}</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{t(plan.descriptionKey)}
								</p>
								<p className="mt-4 text-3xl font-semibold tabular-nums">
									${plan.price.toFixed(2)}
									<span className="text-sm font-normal text-muted-foreground">
										{" "}
										{t("onboarding.cloud.perMonth")}
									</span>
								</p>
								<ul className="mt-4 flex flex-col gap-1.5">
									{plan.featureKeys.map((featureKey) => (
										<li
											key={featureKey}
											className="flex items-center gap-2 text-sm text-muted-foreground"
										>
											<CheckIcon className="size-3.5 shrink-0" />
											{t(featureKey, { servers: STARTUP_SERVERS_INCLUDED })}
										</li>
									))}
								</ul>
							</div>
							<Button
								isLoading={loading === plan.tier}
								disabled={loading !== null || !productId}
								onClick={() => handleCheckout(plan.tier)}
							>
								{t("onboarding.cloud.subscribeNow")}
							</Button>
						</div>
					);
				})}
			</div>
		</section>
	);
};
