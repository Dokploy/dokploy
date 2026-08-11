import { createFileRoute } from "@tanstack/react-router";
import dynamic from "next/dynamic";
import { ShowProjects } from "@/components/dashboard/projects/show";
import { api } from "@/utils/api";

const ShowWelcomeDokploy = dynamic(
	() =>
		import("@/components/dashboard/settings/billing/show-welcome-dokploy").then(
			(mod) => mod.ShowWelcomeDokploy,
		),
	{ ssr: false },
);

const Dashboard = () => {
	const { data: isCloud } = api.settings.isCloud.useQuery();
	return (
		<>
			{isCloud && <ShowWelcomeDokploy />}

			<ShowProjects />
		</>
	);
};

export const Route = createFileRoute("/dashboard/projects")({
	component: Dashboard,
});
