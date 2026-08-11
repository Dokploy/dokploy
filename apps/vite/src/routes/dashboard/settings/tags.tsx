import { createFileRoute } from "@tanstack/react-router";
import { TagManager } from "@/components/dashboard/settings/tags/tag-manager";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<TagManager />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/tags")({
	component: Page,
});
