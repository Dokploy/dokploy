import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import { GithubSetup } from "~/components/dashboard/settings/github/github-setup";
import { WebDomain } from "~/components/dashboard/settings/web-domain";
import { WebServer } from "~/components/dashboard/settings/web-server";
import { DashboardLayout } from "~/components/layouts/dashboard-layout";
import { SettingsLayout } from "~/components/layouts/settings-layout";
import { validateRequest } from "~/server/auth/auth";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<WebDomain />
			<GithubSetup />
			<WebServer />
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
	const { user } = await validateRequest(ctx.req, ctx.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.rol === "user") {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/settings/profile",
			},
		};
	}

	return {
		props: {},
	};
}
