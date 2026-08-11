import { createFileRoute } from "@tanstack/react-router";
import { ShowNotifications } from "@/components/dashboard/settings/notifications/show-notifications";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowNotifications />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/notifications")({
	component: Page,
});
