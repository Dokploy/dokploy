import { ShowTraefikSystem } from "@/components/dashboard/file-system/show-traefik-system";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { PERMISSIONS } from "@dokploy/server/lib/permissions";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";

const Dashboard = () => {
	return <ShowTraefikSystem />;
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

		if (user.role?.name === "member" || !user?.role?.isSystem) {
			if (!user?.role?.permissions?.includes(PERMISSIONS.TRAEFIK.ACCESS.name)) {
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
