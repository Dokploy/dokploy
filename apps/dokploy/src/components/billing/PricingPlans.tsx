import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const cardClassName =
	"bg-background flex flex-col rounded-xl border border-border shadow-sm";

const isPaidPlanKey = (plan: string): plan is "pro" | "agency" =>
	plan === "pro" || plan === "agency";

/** Текущий отображаемый план: без строки в БД = бесплатный уровень; платный — пока подписка не отменена. */
const isCurrentPlan = (
	subscription: { plan: string; status: string } | null | undefined,
	key: "free" | "pro" | "agency",
): boolean => {
	if (!subscription) {
		return key === "free";
	}

	if (isPaidPlanKey(subscription.plan) && subscription.status !== "canceled") {
		return subscription.plan === key;
	}

	return key === "free";
};

const hasUncanceledPaidSubscription = (
	subscription: { plan: string; status: string } | null | undefined,
): boolean =>
	Boolean(
		subscription &&
			isPaidPlanKey(subscription.plan) &&
			subscription.status !== "canceled",
	);

export const PricingPlans = () => {
	const { data: plans, isPending: isPlansLoading, error: plansError } =
		api.billing.getPlans.useQuery();
	const { data: subscription } = api.billing.getSubscription.useQuery();
	const { mutateAsync: createCheckout, isPending: isCheckoutLoading } =
		api.billing.createCheckout.useMutation();

	const orderedKeys = useMemo(() => {
		return plans ? (Object.keys(plans) as Array<keyof typeof plans>) : [];
	}, [plans]);

	const handleSelectPlan = async (plan: "free" | "pro" | "agency") => {
		const result = await createCheckout({ plan });
		if (result.paymentUrl) {
			window.location.href = result.paymentUrl;
		}
	};

	if (isPlansLoading) {
		return (
			<div className="text-sm text-muted-foreground">Загрузка планов…</div>
		);
	}

	if (plansError || !plans) {
		return (
			<div className="text-sm text-muted-foreground">
				Не удалось загрузить планы.
			</div>
		);
	}

	const paidSubscriptionOpen = hasUncanceledPaidSubscription(subscription);

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{orderedKeys.map((key) => {
				const plan = plans[key];
				const isCurrent = isCurrentPlan(subscription, key);
				const isPaidActive =
					subscription?.status === "active" &&
					isPaidPlanKey(subscription.plan) &&
					subscription.plan === key;

				const isButtonDisabled =
					isCheckoutLoading ||
					isCurrent ||
					(key === "free" && paidSubscriptionOpen);

				const buttonLabel = (() => {
					if (isCurrent) return "Текущий план";
					if (key === "free" && paidSubscriptionOpen) {
						return "Сначала отмените подписку";
					}
					return "Выбрать план";
				})();

				return (
					<Card
						key={key}
						className={cn(cardClassName, isCurrent && "ring-1 ring-primary")}
					>
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-base">{plan.name}</CardTitle>
							{isPaidActive ? <Badge>Активен</Badge> : null}
							{isCurrent && !isPaidActive ? (
								<Badge variant="secondary">Текущий</Badge>
							) : null}
						</CardHeader>
						<CardContent className="flex flex-1 flex-col gap-4">
							<div className="text-3xl font-semibold">
								{plan.priceMonthly}₽
								<span className="text-sm font-normal text-muted-foreground">
									{" "}
									/ мес
								</span>
							</div>
							<ul className="text-sm text-muted-foreground space-y-1">
								{plan.features.map((feature) => (
									<li key={feature}>{feature}</li>
								))}
							</ul>
							<Button
								disabled={isButtonDisabled}
								isLoading={isCheckoutLoading}
								onClick={() => handleSelectPlan(key)}
							>
								{buttonLabel}
							</Button>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
};

