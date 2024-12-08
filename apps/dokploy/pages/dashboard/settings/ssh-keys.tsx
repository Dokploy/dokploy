import { ShowDestinations } from "@/components/dashboard/settings/ssh-keys/show-ssh-keys";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SettingsLayout } from "@/components/layouts/settings-layout";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";
import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";
import superjson from "superjson";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowDestinations />
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
	const locale = getLocale(ctx.req.cookies);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	const { req, res, resolvedUrl } = ctx;
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

	try {
		await helpers.project.all.prefetch();
		const auth = await helpers.auth.get.fetch();
		await helpers.settings.isCloud.prefetch();

		if (auth.rol === "user") {
			const user = await helpers.user.byAuthId.fetch({
				authId: auth.id,
			});

			if (!user.canAccessToSSHKeys) {
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
				...(await serverSideTranslations(locale, ["settings"])),
			},
		};
	} catch (error) {
		return {
			props: {},
		};
	}
}
