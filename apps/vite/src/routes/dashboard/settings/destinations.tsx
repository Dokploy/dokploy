import { createFileRoute } from "@tanstack/react-router";
import { ShowDestinations } from "@/components/dashboard/settings/destination/show-destinations";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowDestinations />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/destinations")({
	component: Page,
});
