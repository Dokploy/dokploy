import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import superjson from "superjson";
import { ShowProjects } from "@/components/dashboard/projects/show";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
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

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

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

	await helpers.settings.isCloud.prefetch();
	await helpers.user.get.prefetch();
	if (!user) {
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
}
