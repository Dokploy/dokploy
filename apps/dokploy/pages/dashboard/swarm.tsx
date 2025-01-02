import SwarmMonitorCard from "@/components/dashboard/swarm/monitoring-card";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";

const Dashboard = () => {
	return (
		<>
			<SwarmMonitorCard />
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
