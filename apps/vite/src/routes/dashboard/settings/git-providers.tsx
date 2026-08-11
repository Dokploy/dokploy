import { createFileRoute } from "@tanstack/react-router";
import { ShowGitProviders } from "@/components/dashboard/settings/git/show-git-providers";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowGitProviders />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/git-providers")({
	component: Page,
});
