import { api } from "@/utils/api";
import { ServerOverviewCard } from "./server-card";

export default function ServersOverview() {
	const { data: servers, isLoading } = api.server.all.useQuery();

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (!servers) {
		return <div>No servers found</div>;
	}
	return (
		<div className="container mx-auto p-2">
			<h1 className="text-2xl font-bold mb-4">Server Overview</h1>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{servers.map((server) => (
					<ServerOverviewCard server={server} key={server.serverId} />
				))}
			</div>
		</div>
	);
}
