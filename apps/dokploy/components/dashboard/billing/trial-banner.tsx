import { Rocket } from "lucide-react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";

export const TrialBanner = () => {
	const router = useRouter();
	const { data: billingStatus } = api.stripe.getBillingStatus.useQuery();
	const { mutateAsync: createCustomerPortalSession, isPending } =
		api.stripe.createCustomerPortalSession.useMutation();

	const handleAddPaymentMethod = async () => {
		const session = await createCustomerPortalSession().catch(() => null);
		if (session?.url) {
			window.open(session.url);
			return;
		}
		router.push("/dashboard/settings/billing");
	};

	if (!billingStatus?.isOnTrial || billingStatus.hasPaymentMethod) {
		return null;
	}

	const daysRemaining = billingStatus.trialDaysRemaining ?? 0;
	const daysLabel = `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;

	return (
		<div className="sticky top-0 z-20 mx-4 mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-2 text-sm">
			<span className="flex items-center gap-2">
				<Rocket className="h-4 w-4 text-primary shrink-0" />
				{daysRemaining > 0
					? `You have ${daysLabel} left in your free trial. Add a payment method to keep your servers.`
					: "Your free trial ends today. Add a payment method to keep your servers."}
			</span>
			<Button
				size="sm"
				variant="default"
				className="h-7"
				isLoading={isPending}
				onClick={handleAddPaymentMethod}
			>
				Add payment method
			</Button>
		</div>
	);
};
