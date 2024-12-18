import { ShowServers } from "@/components/dashboard/settings/servers/show-servers";
import SwarmMonitorCard from "@/components/dashboard/swarm/monitoring-card";
import { ServerOverviewCard } from "@/components/dashboard/swarm/servers/server-card";
import ServersOverview from "@/components/dashboard/swarm/servers/servers-overview";
import ShowApplicationServers from "@/components/dashboard/swarm/servers/show-server";
import ShowSwarmNodes from "@/components/dashboard/swarm/show/show-nodes";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Separator } from "@/components/ui/separator";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import superjson from "superjson";

const Dashboard = () => {
	return (
		<>
			<div className="flex flex-wrap gap-4 py-4">
				<SwarmMonitorCard />
			</div>
			<ServersOverview />
			{/* <ShowApplicationServers /> */}
			{/* <h1>Swarm Nodes</h1>
			<ShowSwarmNodes />
			<Separator />
			<h1 className="mt-24">Server Nodes</h1>
			<ShowApplicationServers /> */}
		</>
	);
};

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout tab={"swarm"}>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
	const { user, session } = await validateRequest(ctx.req, ctx.res);
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
			session: session,
			user: user,
		},
		transformer: superjson,
	});
	try {
		await helpers.project.all.prefetch();
		const auth = await helpers.auth.get.fetch();

		if (auth.rol === "user") {
			const user = await helpers.user.byAuthId.fetch({
				authId: auth.id,
			});

			if (!user.canAccessToDocker) {
				return {
					redirect: {
						permanent: true,
						destination: "/",
					},
				};
			}
		}
		return {
			props: {
				trpcState: helpers.dehydrate(),
			},
		};
	} catch (error) {
		return {
			props: {},
		};
	}
}
