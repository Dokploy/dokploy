import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowDiskUsage } from "@/components/dashboard/docker/disk-usage/show-disk-usage";
import { ShowDockerEvents } from "@/components/dashboard/docker/events/show-docker-events";
import { ShowHealth } from "@/components/dashboard/docker/health/show-health";
import { ShowImages } from "@/components/dashboard/docker/images/show-images";
import { ShowContainers } from "@/components/dashboard/docker/show/show-containers";
import { ShowVolumes } from "@/components/dashboard/docker/volumes/show-volumes";
import { ShowNetworks } from "@/components/dashboard/networks/show-networks";
import { ShowNodes } from "@/components/dashboard/settings/cluster/nodes/show-nodes";
import { ShowSwarmContainers } from "@/components/dashboard/swarm/containers/show-swarm-containers";
import SwarmMonitorCard from "@/components/dashboard/swarm/monitoring-card";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { ServerFilter } from "@/components/shared/server-filter";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

const DEFAULT_TAB = "containers";
const DEFAULT_SWARM_TAB = "overview";

const Dashboard = () => {
	const router = useRouter();
	const { data: permissions } = api.user.getPermissions.useQuery();
	// Host-level diagnostics, so this needs server.read on top of docker.read.
	const canSeeHealth = !!permissions?.docker.read && !!permissions?.server.read;

	const queryTab =
		typeof router.query.tab === "string" ? router.query.tab : DEFAULT_TAB;
	const activeTab =
		queryTab === "health" && !canSeeHealth ? DEFAULT_TAB : queryTab;

	const activeSwarmTab =
		typeof router.query.subtab === "string"
			? router.query.subtab
			: DEFAULT_SWARM_TAB;

	const setTab = (value: string) => {
		const { tab: _current, subtab: _subtab, ...query } = router.query;
		router.replace(
			{
				pathname: router.pathname,
				query: value === DEFAULT_TAB ? query : { ...query, tab: value },
			},
			undefined,
			{ shallow: true },
		);
	};

	const setSwarmTab = (value: string) => {
		const { subtab: _current, ...query } = router.query;
		router.replace(
			{
				pathname: router.pathname,
				query:
					value === DEFAULT_SWARM_TAB ? query : { ...query, subtab: value },
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
						<TabsTrigger value="images">Images</TabsTrigger>
						<TabsTrigger value="volumes">Volumes</TabsTrigger>
						<TabsTrigger value="networks">Networks</TabsTrigger>
						<TabsTrigger value="events">Events</TabsTrigger>
						<TabsTrigger value="disk-usage">Disk Usage</TabsTrigger>
						{canSeeHealth && <TabsTrigger value="health">Health</TabsTrigger>}
					</TabsList>
					<TabsContent value="containers">
						<ShowContainers serverId={serverId} />
					</TabsContent>
					<TabsContent value="swarm">
						<Tabs value={activeSwarmTab} onValueChange={setSwarmTab}>
							<TabsList>
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="containers">Containers</TabsTrigger>
								<TabsTrigger value="nodes">Nodes</TabsTrigger>
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
							<TabsContent value="nodes">
								<ShowNodes serverId={serverId} />
							</TabsContent>
						</Tabs>
					</TabsContent>
					<TabsContent value="images">
						<ShowImages serverId={serverId} />
					</TabsContent>
					<TabsContent value="volumes">
						<ShowVolumes serverId={serverId} />
					</TabsContent>
					<TabsContent value="networks">
						<ShowNetworks serverId={serverId} />
					</TabsContent>
					<TabsContent value="events">
						<ShowDockerEvents serverId={serverId} />
					</TabsContent>
					<TabsContent value="disk-usage">
						<ShowDiskUsage serverId={serverId} />
					</TabsContent>
					{canSeeHealth && (
						<TabsContent value="health">
							<ShowHealth serverId={serverId} />
						</TabsContent>
					)}
				</Tabs>
			)}
		</ServerFilter>
	);
};

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const { req, res } = ctx;

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});
	try {
		await helpers.project.all.prefetch();

		const userPermissions = await helpers.user.getPermissions.fetch();

		if (!userPermissions?.docker.read) {
			return {
				redirect: {
					permanent: true,
					destination: "/",
				},
			};
		}
		return {
			props: {
				trpcState: helpers.dehydrate(),
			},
		};
	} catch {
		return {
			props: {},
		};
	}
}
