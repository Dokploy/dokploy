import { ShowProjects } from "@/components/dashboard/projects/show";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { validateRequest } from "@/server/auth/auth";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";

const Dashboard = () => {
	return <ShowProjects />;
};

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout tab={"projects"}>{page}</DashboardLayout>;
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
