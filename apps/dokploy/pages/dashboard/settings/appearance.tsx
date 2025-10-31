import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import superjson from "superjson";
import { AppearanceForm } from "@/components/dashboard/settings/appearance/appearance-form";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { appRouter } from "@/server/api/root";
import { getLocale, serverSideTranslations } from "@/utils/i18n";

const Page = () => {
	return (
		<div className="w-full">
			<div className="h-full rounded-xl max-w-5xl mx-auto flex flex-col gap-4">
				<AppearanceForm />
			</div>
		</div>
	);
};

Page.getLayout = function getLayout(page: ReactElement) {
	return <DashboardLayout metaName="Appearance">{page}</DashboardLayout>;
};

export default Page;

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { req, res } = ctx;
	const locale = getLocale(req.cookies);
	const { user, session } = await validateRequest(req);

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
	await helpers.user.get.prefetch();

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

