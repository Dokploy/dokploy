import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import SwarmMonitorCard from "@/components/dashboard/swarm/monitoring-card";
import { ShowSwarmContainers } from "@/components/dashboard/swarm/containers/show-swarm-containers";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRouter } from "@/server/api/root";

const Dashboard = () => {
	return (
		<div className="space-y-4">
			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="containers">Containers</TabsTrigger>
				</TabsList>
				<TabsContent value="overview">
					<SwarmMonitorCard />
				</TabsContent>
				<TabsContent value="containers">
					<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
						<div className="rounded-xl bg-background shadow-md p-6">
							<ShowSwarmContainers />
						</div>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
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

		if (user.role === "member") {
			const userR = await helpers.user.one.fetch({
				userId: user.id,
			});

			if (!userR?.canAccessToDocker) {
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
	} catch {
		return {
			props: {},
		};
	}
}
