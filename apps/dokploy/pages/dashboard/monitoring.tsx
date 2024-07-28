import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import { ShowMonitoring } from "~/components/dashboard/monitoring/web-server/show";
import { DashboardLayout } from "~/components/layouts/dashboard-layout";
import { validateRequest } from "~/server/auth/auth";

const Dashboard = () => {
	return <ShowMonitoring />;
};

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout tab={"monitoring"}>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { user } = await validateRequest(ctx.req, ctx.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {},
	};
}
