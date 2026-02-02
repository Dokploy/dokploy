import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { WhitelabelForm } from "@/components/dashboard/settings/whitelabel-form";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { validateRequest } from "@dokploy/server/lib/auth";
import { getLocale, serverSideTranslations } from "@/utils/i18n";
import { IS_CLOUD } from "@dokploy/server";

const Page = () => {
	return (
		<div className="w-full">
			<WhitelabelForm />
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return <DashboardLayout metaName="Whitelabel">{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext,
) {
	const { req, res } = ctx;
	const locale = await getLocale(req.cookies);
	
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}

	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	if (user.role === "member") {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/settings/profile",
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
	await helpers.settings.getWebServerSettings.prefetch();

	return {
		props: {
			trpcState: helpers.dehydrate(),
			...(await serverSideTranslations(locale, ["settings"])),
		},
	};
};
