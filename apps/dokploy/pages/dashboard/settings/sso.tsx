import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { SSOSettings } from "@/components/dashboard/settings/sso/sso-settings";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";

const Page = () => {
	return (
		<div className="mx-auto w-full max-w-5xl">
			<SSOSettings />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="SSO Settings">{page}</DashboardLayout>;
};

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const locale = getLocale(req.cookies);
	const { user, session } = await validateRequest(req);

	// Redirect unauthenticated users before invoking protected procedures
	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}
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
	await helpers.sso.getSettings.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
}
