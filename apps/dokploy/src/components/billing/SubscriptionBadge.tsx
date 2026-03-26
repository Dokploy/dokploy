import { Badge } from "@/components/ui/badge";
import { api } from "@/utils/api";

export const SubscriptionBadge = () => {
	const { data: subscription } = api.billing.getSubscription.useQuery();

	if (!subscription || subscription.status !== "active") {
		return null;
	}

	return <Badge>{subscription.plan}</Badge>;
};

