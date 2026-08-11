import { createFileRoute } from "@tanstack/react-router";
import { ShowBilling } from "@/components/dashboard/settings/billing/show-billing";

const Page = () => {
	return <ShowBilling />;
};

export const Route = createFileRoute("/dashboard/settings/billing")({
	component: Page,
});
