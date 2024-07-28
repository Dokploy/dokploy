import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import { ShowNodes } from "~/components/dashboard/settings/cluster/nodes/show-nodes";
import { ShowRegistry } from "~/components/dashboard/settings/cluster/registry/show-registry";
import { DashboardLayout } from "~/components/layouts/dashboard-layout";
import { SettingsLayout } from "~/components/layouts/settings-layout";
import { validateRequest } from "~/server/auth/auth";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowRegistry />
			<ShowNodes />
		</div>
	);
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
