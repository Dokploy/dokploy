import { ShowBilling } from "@/components/dashboard/settings/billing/show-billing";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SettingsLayout } from "@/components/layouts/settings-layout";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";

const Page = () => {
	return <ShowBilling />;
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return (
		<DashboardLayout tab={"settings"}>
			<SettingsLayout>{page}</SettingsLayout>
		</DashboardLayout>
	);
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	if (!IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
	const { user, session } = await validateRequest(ctx.req, ctx.res);
	if (!user || user.rol === "user") {
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
