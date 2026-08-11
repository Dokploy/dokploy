import { createFileRoute } from "@tanstack/react-router";
import { ShowTraefikSystem } from "@/components/dashboard/file-system/show-traefik-system";
import { ServerFilter } from "@/components/shared/server-filter";

const Dashboard = () => {
	return (
		<ServerFilter>
			{(serverId) => <ShowTraefikSystem serverId={serverId} />}
		</ServerFilter>
	);
};

export const Route = createFileRoute("/dashboard/traefik")({
	component: Dashboard,
});
