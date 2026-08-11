import { createFileRoute } from "@tanstack/react-router";
import { ShowServers } from "@/components/dashboard/settings/servers/show-servers";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowServers />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/servers")({
	component: Page,
});
