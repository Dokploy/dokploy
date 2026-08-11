import { createFileRoute } from "@tanstack/react-router";
import { ShowBillingInvoices } from "@/components/dashboard/settings/billing/show-billing-invoices";

const Page = () => {
	return <ShowBillingInvoices />;
};

export const Route = createFileRoute("/dashboard/settings/invoices")({
	component: Page,
});
