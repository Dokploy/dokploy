import { ShowRequests } from "@/components/dashboard/requests/show-requests";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { validateRequest } from "@/server/auth/auth";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import * as React from "react";

export default function Requests() {
	return <ShowRequests />;
}
Requests.getLayout = (page: ReactElement) => {
	return <DashboardLayout tab={"requests"}>{page}</DashboardLayout>;
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
