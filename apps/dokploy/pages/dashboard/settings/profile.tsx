import { GenerateToken } from "@/components/dashboard/settings/profile/generate-token";
import { ProfileForm } from "@/components/dashboard/settings/profile/profile-form";
import { RemoveSelfAccount } from "@/components/dashboard/settings/profile/remove-self-account";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SettingsLayout } from "@/components/layouts/settings-layout";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { getLocale, serverSideTranslations } from "@/utils/i18n";
import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import superjson from "superjson";

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

	const { data: isCloud } = api.settings.isCloud.useQuery();
	return (
		<div className="flex flex-col gap-4 w-full">
			<ProfileForm />
			{(user?.canAccessToAPI || data?.rol === "admin") && <GenerateToken />}

			{isCloud && <RemoveSelfAccount />}
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return (
		<DashboardLayout tab={"settings"} metaName="Profile">
			<SettingsLayout>{page}</SettingsLayout>
		</DashboardLayout>
	);
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const locale = getLocale(req.cookies);
	const { user, session } = await validateRequest(req, res);

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

	await helpers.settings.isCloud.prefetch();
	await helpers.auth.get.prefetch();
	if (user?.rol === "user") {
		await helpers.user.byAuthId.prefetch({
			authId: user.authId,
		});
	}

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
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
}
