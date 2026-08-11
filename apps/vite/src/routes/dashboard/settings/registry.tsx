import { createFileRoute } from "@tanstack/react-router";
import { ShowRegistry } from "@/components/dashboard/settings/cluster/registry/show-registry";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowRegistry />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/registry")({
	component: Page,
});
