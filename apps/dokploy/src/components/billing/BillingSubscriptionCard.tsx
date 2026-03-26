import { format } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { ru as ruDateLocale } from "date-fns/locale/ru";
import { useLocale, useTranslations } from "next-intl";

import {
	cancelButtonMode,
	effectivePlanKey,
	subscriptionStatusBadgeVariant,
	subscriptionUiStatus,
} from "@/components/billing/billing-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SubscriptionRow = {
	plan: string;
	status: string;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
} | null;

const statItemClassName =
	"flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2";

const formatRenewalDate = (
	date: Date | null | undefined,
	localeCode: string,
): string | null => {
	if (!date) return null;
	const locale = localeCode === "ru" ? ruDateLocale : enUS;
	return format(new Date(date), "d MMMM yyyy", { locale });
};

interface BillingSubscriptionCardProps {
	subscription: SubscriptionRow;
	isCancelLoading: boolean;
	onCancel: () => void | Promise<void>;
}

export const BillingSubscriptionCard = ({
	subscription,
	isCancelLoading,
	onCancel,
}: BillingSubscriptionCardProps) => {
	const t = useTranslations("billing");
	const locale = useLocale();
	const uiStatus = subscriptionUiStatus(subscription);
	const planKey = effectivePlanKey(subscription);
	const cancelMode = cancelButtonMode(subscription);
	const renewalFormatted = formatRenewalDate(
		subscription?.currentPeriodEnd ?? null,
		locale,
	);
	const showRenewal = Boolean(
		subscription &&
			(subscription.plan === "pro" || subscription.plan === "agency") &&
			subscription.status === "active" &&
			renewalFormatted,
	);

	const cancelTooltip =
		cancelMode === "disabled"
			? t("cancelDisabledNoPaid")
			: cancelMode === "scheduled"
				? t("cancelScheduledHint")
				: undefined;

	const cancelLabel =
		cancelMode === "scheduled" ? t("cancelScheduled") : t("cancelSubscription");

	const cancelDisabled = cancelMode !== "cancel" || isCancelLoading;
	const showCancelTooltip = cancelDisabled && Boolean(cancelTooltip);

	return (
		<Card className="bg-background">
			<CardHeader className="pb-2">
				<CardTitle>{t("subscriptionTitle")}</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<div className={statItemClassName}>
						<span className="text-sm text-muted-foreground">{t("statusLabel")}</span>
						<Badge variant={subscriptionStatusBadgeVariant(uiStatus)}>
							{t(`subscriptionStatus.${uiStatus}`)}
						</Badge>
					</div>
					<div className={statItemClassName}>
						<span className="text-sm text-muted-foreground">{t("planLabel")}</span>
						<Badge variant={planKey === "free" ? "outline" : "green"}>
							{t(planKey)}
						</Badge>
					</div>
					<div className={cn(statItemClassName, "justify-between")}>
						<span className="text-sm text-muted-foreground">{t("nextCharge")}</span>
						<span className="text-sm text-foreground">
							{showRenewal && renewalFormatted ? (
								renewalFormatted
							) : (
								<span className="text-muted-foreground">
									{t("nextChargeNotApplicable")}
								</span>
							)}
						</span>
					</div>
				</div>
				<div className="pt-1">
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<span
									className={cn(
										"inline-flex w-full sm:w-auto",
										cancelDisabled && "cursor-default",
									)}
								>
									<Button
										variant="outline"
										className="w-full sm:w-auto"
										disabled={cancelDisabled}
										isLoading={isCancelLoading}
										onClick={onCancel}
									>
										{cancelLabel}
									</Button>
								</span>
							</TooltipTrigger>
							{showCancelTooltip ? (
								<TooltipContent side="top" className="max-w-xs">
									<p>{cancelTooltip}</p>
								</TooltipContent>
							) : null}
						</Tooltip>
					</TooltipProvider>
				</div>
			</CardContent>
		</Card>
	);
};
