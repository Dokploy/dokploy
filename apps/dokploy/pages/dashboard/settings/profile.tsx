import { GenerateToken } from "@/components/dashboard/settings/profile/generate-token";
import { ProfileForm } from "@/components/dashboard/settings/profile/profile-form";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SettingsLayout } from "@/components/layouts/settings-layout";
import { validateRequest } from "@/server/auth/auth";
import { api } from "@/utils/api";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";

const Page = () => {
	const { data } = api.auth.get.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: data?.id || "",
		},
		{
			enabled: !!data?.id && data?.rol === "user",
		},
	);
	return (
		<div className="flex flex-col gap-4 w-full">
			<ProfileForm />
			{(user?.canAccessToAPI || data?.rol === "admin") && <GenerateToken />}
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

	return {
		props: {},
	};
}
