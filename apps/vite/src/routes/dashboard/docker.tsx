import { createFileRoute } from "@tanstack/react-router";
import { useRouter } from "next/router";
import { ShowContainers } from "@/components/dashboard/docker/show/show-containers";
import { ShowVolumes } from "@/components/dashboard/docker/volumes/show-volumes";
import { ShowNetworks } from "@/components/dashboard/networks/show-networks";
import { ShowSwarmContainers } from "@/components/dashboard/swarm/containers/show-swarm-containers";
import SwarmMonitorCard from "@/components/dashboard/swarm/monitoring-card";
import { ServerFilter } from "@/components/shared/server-filter";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";

const DEFAULT_TAB = "containers";

const Dashboard = () => {
	const router = useRouter();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const queryTab =
		typeof router.query.tab === "string" ? router.query.tab : DEFAULT_TAB;
	const activeTab = isCloud && queryTab === "networks" ? DEFAULT_TAB : queryTab;

	const setTab = (value: string) => {
		const { tab: _current, ...query } = router.query;
		router.replace(
			{
				pathname: router.pathname,
				query: value === DEFAULT_TAB ? query : { ...query, tab: value },
			},
			undefined,
			{ shallow: true },
		);
	};

	return (
		<ServerFilter>
			{(serverId) => (
				<Tabs value={activeTab} onValueChange={setTab}>
					<TabsList>
						<TabsTrigger value="containers">Containers</TabsTrigger>
						<TabsTrigger value="swarm">Swarm</TabsTrigger>
						<TabsTrigger value="volumes">Volumes</TabsTrigger>
						{!isCloud && <TabsTrigger value="networks">Networks</TabsTrigger>}
					</TabsList>
					<TabsContent value="containers">
						<ShowContainers serverId={serverId} />
					</TabsContent>
					<TabsContent value="swarm">
						<Tabs defaultValue="overview">
							<TabsList>
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="containers">Containers</TabsTrigger>
							</TabsList>
							<TabsContent value="overview">
								<SwarmMonitorCard serverId={serverId} />
							</TabsContent>
							<TabsContent value="containers">
								<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
									<div className="rounded-xl bg-background shadow-md p-6">
										<ShowSwarmContainers serverId={serverId} />
									</div>
								</Card>
							</TabsContent>
						</Tabs>
					</TabsContent>
					<TabsContent value="volumes">
						<ShowVolumes serverId={serverId} />
					</TabsContent>
					{!isCloud && (
						<TabsContent value="networks">
							<ShowNetworks serverId={serverId} />
						</TabsContent>
					)}
				</Tabs>
			)}
		</ServerFilter>
	);
};

export const Route = createFileRoute("/dashboard/docker")({
	component: Dashboard,
});
